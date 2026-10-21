begin;
create function pg_temp.check_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Failed: %', label; end if; end;
$$;
create function pg_temp.rejects(command text, expected_state text) returns void language plpgsql as $$
begin
  begin execute command;
  exception when others then
    if sqlstate = expected_state then return; end if;
    raise exception 'Wrong error for %: % %', command, sqlstate, sqlerrm;
  end;
  raise exception 'Unexpectedly allowed: %', command;
end;
$$;

-- Catalog registration is a privileged, atomic operation.
set local role service_role;
select public.register_leaderboard_puzzles(jsonb_agg(jsonb_build_object(
  'puzzle_id', (current_date - n)::text, 'puzzle_type', 'queens',
  'puzzle_day', (current_date - n)::text, 'width', 7, 'height', 7, 'size_label', null)))
from generate_series(0, 25) n;
select public.register_leaderboard_puzzles(jsonb_agg(jsonb_build_object(
  'puzzle_id', current_date::text || '-tracks-' || variant, 'puzzle_type', 'train-tracks',
  'puzzle_day', current_date::text, 'width', size, 'height', size, 'size_label', label)))
from (values ('small', 8, 'Small'), ('medium', 10, 'Medium'), ('large', 12, 'Large')) v(variant, size, label);
select public.register_leaderboard_puzzles(jsonb_agg(jsonb_build_object(
  'puzzle_id', current_date::text || suffix, 'puzzle_type', family,
  'puzzle_day', current_date::text, 'width', size, 'height', size, 'size_label', null)))
from (values ('star-battle', '-star', 9), ('word-paths', '-words', 5),
  ('trio', '-trio', 9), ('tents', '-tents', 10), ('train-tracks', '-tracks', 7)) v(family, suffix, size);
select public.register_leaderboard_puzzles(jsonb_build_array(jsonb_build_object(
  'puzzle_id', (current_date + 3)::text, 'puzzle_type', 'queens',
  'puzzle_day', (current_date + 3)::text, 'width', 7, 'height', 7, 'size_label', null)));
reset role;

-- Every family must retain its canonical ID, including both sides of Tents pairings.
set local role service_role;
do $$ declare family text; suffix text; candidate jsonb; begin
  for family, suffix in
    select a.family, b.suffix
    from (values ('queens', ''), ('star-battle', '-star'), ('train-tracks', '-tracks'),
      ('word-paths', '-words'), ('trio', '-trio'), ('tents', '-tents')) a(family, suffix)
    cross join (values ('queens', ''), ('star-battle', '-star'), ('train-tracks', '-tracks'),
      ('word-paths', '-words'), ('trio', '-trio'), ('tents', '-tents')) b(family, suffix)
    where a.family <> b.family
  loop
    candidate := jsonb_build_array(jsonb_build_object('puzzle_id', current_date::text || suffix,
      'puzzle_type', family, 'puzzle_day', current_date::text, 'width',10,'height',10));
    perform pg_temp.rejects(format('select public.register_leaderboard_puzzles(%L)', candidate::text), '23514');
  end loop;
end $$;
reset role;

set local role anon;
select pg_temp.check_true(public.get_leaderboard(current_date::text) =
  '{"entries":[],"total":0,"own_entry":null}'::jsonb, 'public empty board');
select pg_temp.rejects('select * from public.leaderboard_results', '42501');
select pg_temp.rejects('insert into public.leaderboard_results default values', '42501');
select pg_temp.rejects('select public.submit_result(current_date::text, ''Alice'', 60000, 0)', '42501');
select pg_temp.rejects('select public.remove_my_results()', '42501');
select pg_temp.rejects('select public.register_leaderboard_puzzles(''[]'')', '42501');
select pg_temp.rejects('drop table public.leaderboard_results', '42501');
reset role;

-- Different owners tie at 60 s / zero hints; 1 s / one hint ranks third.
set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', md5('1')::uuid)::text, true);
select pg_temp.check_true(public.submit_result(current_date::text, ' Alice ', 60000, 0)->>'status' = 'created', 'first submit');
select set_config('request.jwt.claims', jsonb_build_object('sub', md5('2')::uuid)::text, true);
select public.submit_result(current_date::text, 'Bob', 60000, 0);
select set_config('request.jwt.claims', jsonb_build_object('sub', md5('3')::uuid)::text, true);
select public.submit_result(current_date::text, 'Carol', 1000, 1);
do $$ declare board jsonb := public.get_leaderboard(current_date::text); begin
  perform pg_temp.check_true(board->'entries' = '[
    {"rank":1,"nickname":"Alice","elapsed_ms":60000,"hints":0,"is_you":false},
    {"rank":1,"nickname":"Bob","elapsed_ms":60000,"hints":0,"is_you":false},
    {"rank":3,"nickname":"Carol","elapsed_ms":1000,"hints":1,"is_you":true}]'::jsonb,
    'tie ranks, hints before speed, projection, nickname normalization');
end $$;
select pg_temp.check_true(public.submit_result(current_date::text, 'Changed', 0, 0)->>'status' = 'existing', 'retry succeeds');
select pg_temp.check_true(public.get_leaderboard(current_date::text)->'entries'->2->>'nickname' = 'Carol', 'retry cannot replace score');
select pg_temp.rejects('update public.leaderboard_results set nickname = ''Forged''', '42501');
select pg_temp.rejects('delete from public.leaderboard_results', '42501');
select pg_temp.rejects('drop table public.leaderboard_results', '42501');
select pg_temp.rejects('select * from public.leaderboard_results', '42501');
select pg_temp.rejects('select public.register_leaderboard_puzzles(''[]'')', '42501');
select pg_temp.rejects('select public.get_leaderboard((current_date + 3)::text)', '22023');
select pg_temp.rejects('select public.submit_result((current_date + 3)::text, ''Carol'', 1, 0)', '22023');
select pg_temp.rejects('select public.get_leaderboard(''unknown'')', '22023');
select pg_temp.rejects('select public.submit_result(''unknown'', ''Carol'', 1, 0)', '22023');
select pg_temp.rejects('select public.submit_result((current_date - 1)::text, ''X'', 1, 0)', '22023');
select pg_temp.rejects('select public.submit_result((current_date - 1)::text, ''<script>'', 1, 0)', '22023');
select pg_temp.rejects('select public.submit_result((current_date - 1)::text, ''Élise'', 1, 0)', '22023');
select pg_temp.rejects('select public.submit_result((current_date - 1)::text, null, 1, 0)', '22023');
select pg_temp.rejects('select public.submit_result((current_date - 1)::text, ''Carol'', -1, 0)', '22023');
select pg_temp.rejects('select public.submit_result((current_date - 1)::text, ''Carol'', 9007199254740992, 0)', '22023');
select pg_temp.rejects('select public.submit_result((current_date - 1)::text, ''Carol'', 1, -1)', '22023');
select pg_temp.rejects('select public.submit_result((current_date - 1)::text, ''Carol'', 1, null)', '22023');
select set_config('request.jwt.claims', '{}', true);
select pg_temp.rejects('select public.submit_result(current_date::text, ''Missing'', 1, 0)', '28000');
select pg_temp.rejects('select public.remove_my_results()', '28000');

-- All three sizes are distinct boards, even on the same date.
select set_config('request.jwt.claims', jsonb_build_object('sub', md5('4')::uuid)::text, true);
select public.submit_result(current_date::text || '-tracks-small', 'Tracks', 100, 0);
select pg_temp.check_true(public.get_leaderboard(current_date::text || '-tracks-small')->>'total' = '1', 'small has result');
select pg_temp.check_true(public.get_leaderboard(current_date::text || '-tracks-medium')->>'total' = '0', 'medium separate');
select pg_temp.check_true(public.get_leaderboard(current_date::text || '-tracks-large')->>'total' = '0', 'large separate');
select pg_temp.check_true(public.submit_result(current_date::text || '-tents', 'Tents', 12345, 0)->>'status' = 'created', 'Tents first submit');
select pg_temp.check_true(public.submit_result(current_date::text || '-tents', 'Changed', 1, 0)->>'status' = 'existing', 'Tents retry');
select pg_temp.check_true(public.get_leaderboard(current_date::text || '-tents')->'entries' =
  '[{"rank":1,"nickname":"Tents","elapsed_ms":12345,"hints":0,"is_you":true}]'::jsonb, 'Tents ranking and owner');
select pg_temp.check_true(public.get_leaderboard(current_date::text || '-trio')->>'total' = '0', 'Tents separate from Trio');

-- Outside-top-25 owner gets their own rank without exposing private columns.
do $$ begin for n in 1..26 loop
  perform set_config('request.jwt.claims', jsonb_build_object('sub', md5(n::text)::uuid)::text, true);
  perform public.submit_result((current_date - 1)::text, 'Player ' || n, n * 1000, 0);
end loop; end $$;
select pg_temp.check_true(jsonb_array_length(public.get_leaderboard((current_date - 1)::text)->'entries') = 25, 'top 25 bounded');
select pg_temp.check_true(public.get_leaderboard((current_date - 1)::text)->'own_entry' =
  '{"rank":26,"nickname":"Player 26","elapsed_ms":26000,"hints":0,"is_you":true}'::jsonb, 'owner outside top');

-- Deleting as user 1 cannot remove user 2; remaining ties/ranks recalculate.
select set_config('request.jwt.claims', jsonb_build_object('sub', md5('1')::uuid)::text, true);
select pg_temp.check_true(public.remove_my_results() = 2, 'only caller rows deleted');
select pg_temp.check_true(public.get_leaderboard(current_date::text)->'entries'->0->>'nickname' = 'Bob', 'other owner retained');
select pg_temp.check_true(public.get_leaderboard(current_date::text)->'entries'->1->>'rank' = '2', 'rank after deletion');
reset role;

-- A private counter survives deleting rows, and only new writes count.
set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', md5('40')::uuid)::text, true);
do $$ begin for n in 0..19 loop
  perform public.submit_result((current_date - n)::text, 'Rate Test', 1, 0);
  perform public.submit_result((current_date - n)::text, 'Rate Test', 1, 0);
end loop; end $$;
select pg_temp.check_true(public.remove_my_results() = 20, 'delete own scores');
select pg_temp.rejects('select public.submit_result((current_date - 20)::text, ''Rate Test'', 1, 0)', 'P0001');
select pg_temp.rejects('select * from leaderboard_private.submission_limits', '42501');
reset role;
update leaderboard_private.submission_limits set window_start = clock_timestamp() - interval '61 seconds' where user_id = md5('40')::uuid;
set local role authenticated;
select pg_temp.check_true(public.submit_result((current_date - 20)::text, 'Rate Test', 1, 0)->>'status' = 'created', 'expired window resets');
reset role;

-- Re-registering metadata retains scores. A bad batch cannot partially insert.
set local role service_role;
select public.register_leaderboard_puzzles(jsonb_build_array(jsonb_build_object(
  'puzzle_id', current_date::text, 'puzzle_type', 'queens', 'puzzle_day', current_date::text,
  'width', 7, 'height', 7, 'size_label', null)));
reset role;
select pg_temp.check_true((select count(*) from public.leaderboard_results where puzzle_id = current_date::text) = 2, 'catalog keeps results');
select pg_temp.rejects(format('select public.register_leaderboard_puzzles(%L)', jsonb_build_array(
  jsonb_build_object('puzzle_id', (current_date - 100)::text, 'puzzle_type', 'queens', 'puzzle_day', (current_date - 100)::text, 'width',7,'height',7),
  jsonb_build_object('puzzle_id', 'broken', 'puzzle_type', 'queens'))::text), '23502');
select pg_temp.check_true(not exists(select from public.leaderboard_puzzles where puzzle_id = (current_date - 100)::text), 'bad batch atomic');
select pg_temp.rejects(format('select public.register_leaderboard_puzzles(%L)', jsonb_build_array(
  jsonb_build_object('puzzle_id', (current_date - 100)::text || '-tracks-small', 'puzzle_type', 'train-tracks',
    'puzzle_day', (current_date - 100)::text, 'width',8,'height',8,'size_label',null))::text), '23514');
-- SQL-like input is data, even when it bypasses all browser validation.
savepoint hostile_inputs;
set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', md5('39')::uuid)::text, true);
select pg_temp.rejects(format('select public.submit_result(%L, %L, 1000, 0)',
  (current_date - 25)::text, 'x''; DROP TABLE auth.users;--'), '22023');
select pg_temp.rejects(format('select public.submit_result(%L, %L, 1000, 0)',
  (current_date - 25)::text, ''' OR true --'), '22023');
select pg_temp.rejects(format('select public.get_leaderboard(%L)',
  current_date::text || ''' OR true --'), '22023');
select pg_temp.check_true(public.submit_result((current_date - 25)::text,
  'DROP TABLE users', 1000, 0)->>'status' = 'created', 'SQL keywords are harmless nickname text');
reset role;
select pg_temp.check_true(exists(select from public.leaderboard_results
  where user_id = md5('39')::uuid and nickname = 'DROP TABLE users')
  and (select count(*) from auth.users) = 40, 'SQL-like nickname stored literally; users retained');
rollback to savepoint hostile_inputs;
rollback;
\echo 'Leaderboard SQL contract passed'
