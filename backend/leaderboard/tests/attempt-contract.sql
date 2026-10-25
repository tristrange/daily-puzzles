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
select pg_temp.check_true((select count(*) = 1 from pg_proc where pronamespace = 'public'::regnamespace
  and proname = 'submit_result'), 'sole submit signature');
select pg_temp.check_true(to_regprocedure('public.submit_result(text,text,bigint,bigint)') is null,
  'old signature removed');
select pg_temp.check_true(has_function_privilege('authenticated', 'public.submit_result(text,text,bigint,bigint,bigint)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.submit_result(text,text,bigint,bigint,bigint)', 'EXECUTE'), 'submit grants');
set local role service_role;
select public.register_leaderboard_puzzles('[{"puzzle_id":"2000-01-01","puzzle_type":"queens","puzzle_day":"2000-01-01","width":7,"height":7}]');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', md5('1')::uuid)::text, true);
select pg_temp.rejects('select public.submit_result(''2000-01-01'', ''Invalid'', 1000, 0, -1)', '22023');
select pg_temp.rejects('select public.submit_result(''2000-01-01'', ''Invalid'', 1000, 0, 1001)', '22023');
select pg_temp.rejects('select public.submit_result(''2000-01-01'', ''Invalid'', 9007199254740991, 0, 9007199254740992)', '22023');
select pg_temp.rejects('select public.submit_result(''2000-01-01'', ''Invalid'', 1000, 0, ''0.5'')', '22P02');
select pg_temp.check_true(public.submit_result('2000-01-01', 'Legacy', 1000, 0)->>'status' = 'created', 'four-argument client');
select pg_temp.check_true(public.submit_result('2000-01-01', 'Revised', 1, 0, 0)->>'status' = 'existing', 'first result immutable');
select set_config('request.jwt.claims', jsonb_build_object('sub', md5('2')::uuid)::text, true);
select public.submit_result('2000-01-01', 'Reset', 2000, 0, 0);
select set_config('request.jwt.claims', jsonb_build_object('sub', md5('3')::uuid)::text, true);
select public.submit_result('2000-01-01', 'Hints', 100, 1, 100);
reset role;
insert into public.leaderboard_results(user_id, puzzle_id, nickname, elapsed_ms, hints, attempt_elapsed_ms)
select md5(n::text)::uuid, '2000-01-01', 'Player ' || n, 3000 + n, 0, n from generate_series(4, 30) n;
select pg_temp.rejects('update public.leaderboard_results set attempt_elapsed_ms = elapsed_ms + 1', '23514');
set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', md5('3')::uuid)::text, true);
do $$ declare board jsonb; begin
  board := public.get_leaderboard('2000-01-01');
  perform pg_temp.check_true(board->'entries'->0 = '{"rank":1,"nickname":"Legacy","elapsed_ms":1000,"hints":0,"is_you":false}'::jsonb,
    'legacy JSON exact and rank uses total');
  perform pg_temp.check_true(board->'entries'->1->>'attempt_elapsed_ms' = '0' and board->'entries'->1->>'rank' = '2',
    'known zero retained without outranking faster total');
  perform pg_temp.check_true(board->'own_entry'->>'attempt_elapsed_ms' = '100' and board->'own_entry'->>'rank' = '30',
    'own outside top 25 retains metadata and hints-first rank');
end $$;
reset role;
select pg_temp.check_true((select nickname = 'Legacy' and elapsed_ms = 1000 and attempt_elapsed_ms is null
  from public.leaderboard_results where puzzle_id = '2000-01-01' and user_id = md5('1')::uuid), 'first legacy row unchanged');
rollback;
\echo 'Leaderboard attempt timing contract passed'
