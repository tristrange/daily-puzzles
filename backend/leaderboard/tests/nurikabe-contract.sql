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

set local role service_role;
select public.register_leaderboard_puzzles(jsonb_build_array(jsonb_build_object(
  'puzzle_id', current_date::text || '-nurikabe', 'puzzle_type', 'nurikabe',
  'puzzle_day', current_date::text, 'width', 7, 'height', 7)));
do $$ declare candidate jsonb; family text; suffix text; width integer; height integer; label text; begin
  for family, suffix, width, height, label in select * from (values
    ('nurikabe', '-tents', 7, 7, null), ('tents', '-nurikabe', 7, 7, null),
    ('nurikabe', '-nurikabe', 8, 8, null), ('nurikabe', '-nurikabe', 7, 6, null),
    ('nurikabe', '-nurikabe', 7, 7, 'Medium')) v(family, suffix, width, height, label)
  loop
    candidate := jsonb_build_array(jsonb_build_object('puzzle_id', current_date::text || suffix,
      'puzzle_type', family, 'puzzle_day', current_date::text,
      'width', width, 'height', height, 'size_label', label));
    perform pg_temp.rejects(format('select public.register_leaderboard_puzzles(%L)', candidate::text), '23514');
  end loop;
end $$;
reset role;
set local role anon;
select pg_temp.rejects('select public.register_leaderboard_puzzles(''[]'')', '42501');
select pg_temp.rejects('select * from public.leaderboard_puzzles', '42501');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', md5('39')::uuid)::text, true);
select public.submit_result(current_date::text || '-nurikabe', 'Nurikabe Player', 50000, 0, 12000);
select pg_temp.check_true((select (public.get_leaderboard(current_date::text || '-nurikabe')->'entries'->0->>'elapsed_ms')::bigint = 50000), 'Nurikabe has its own ranked result');
reset role;
select pg_temp.check_true((select attempt_elapsed_ms = 12000 from public.leaderboard_results
  where puzzle_id = current_date::text || '-nurikabe' and nickname = 'Nurikabe Player'), 'Nurikabe retains attempt metadata');
rollback;
\echo 'Nurikabe catalog and score contract passed'
