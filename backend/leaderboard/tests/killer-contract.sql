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
select public.register_leaderboard_puzzles(jsonb_build_array(
  jsonb_build_object('puzzle_id', current_date::text || '-killer-sudoku-easy', 'puzzle_type', 'killer-sudoku', 'puzzle_day', current_date::text, 'width', 9, 'height', 9, 'size_label', 'Easy'),
  jsonb_build_object('puzzle_id', current_date::text || '-killer-sudoku-medium', 'puzzle_type', 'killer-sudoku', 'puzzle_day', current_date::text, 'width', 9, 'height', 9, 'size_label', 'Medium'),
  jsonb_build_object('puzzle_id', current_date::text || '-killer-sudoku-hard', 'puzzle_type', 'killer-sudoku', 'puzzle_day', current_date::text, 'width', 9, 'height', 9, 'size_label', 'Hard')
));
select pg_temp.rejects(format('select public.register_leaderboard_puzzles(%L)', jsonb_build_array(jsonb_build_object(
  'puzzle_id', current_date::text || '-killer-sudoku-easy', 'puzzle_type', 'killer-sudoku',
  'puzzle_day', current_date::text, 'width', 8, 'height', 9, 'size_label', 'Easy'))::text), '23514');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', md5('39')::uuid)::text, true);
select public.submit_result(current_date::text || '-killer-sudoku-hard', 'Killer Player', 50000, 1, 12000);
select pg_temp.check_true((select (public.get_leaderboard(current_date::text || '-killer-sudoku-hard')->'entries'->0->>'elapsed_ms')::bigint = 50000), 'Killer has its own ranked result');
reset role;
select pg_temp.check_true((select attempt_elapsed_ms = 12000 from public.leaderboard_results
  where puzzle_id = current_date::text || '-killer-sudoku-hard' and nickname = 'Killer Player'), 'Killer retains attempt metadata');
rollback;
\echo 'Killer Sudoku catalog and score contract passed'
