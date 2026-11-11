begin;
select public.register_leaderboard_puzzles('[{"puzzle_id":"2020-01-01-enclosure","puzzle_type":"enclosure","puzzle_day":"2020-01-01","width":8,"height":8,"max_score":20}]');
do $$
declare i integer; response jsonb;
begin
  for i in 1..27 loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', md5(i::text)::uuid)::text, true);
    response := public.submit_enclosure_result('2020-01-01-enclosure', 'Player', 1000 + (i / 3), 20 - (i / 10), 500);
    if response->>'status' <> 'created' then raise exception 'Expected created'; end if;
  end loop;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', md5('1')::uuid)::text, true);
  if public.submit_enclosure_result('2020-01-01-enclosure', 'Changed', 1, 20)->>'status' <> 'existing' then raise exception 'Expected existing'; end if;
  response := public.get_leaderboard('2020-01-01-enclosure');
  if jsonb_array_length(response->'entries') <> 25 or (response->>'total')::int <> 27
    or (response->'entries'->0->>'score')::int <> 20
    or (response->'entries'->0->>'rank')::int <> 1
    or (response->'entries'->1->>'rank')::int <> 1 then raise exception 'Invalid leaderboard %', response; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', md5('27')::uuid)::text, true);
  if public.get_leaderboard('2020-01-01-enclosure')->'own_entry' is null then raise exception 'Missing own entry'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', md5('30')::uuid)::text, true);
  begin perform public.submit_enclosure_result('2020-01-01-enclosure', 'Player', 1000, 21); raise exception 'Accepted excessive score'; exception when invalid_parameter_value then null; end;
  begin perform public.submit_enclosure_result('2020-01-01-enclosure', 'Player', 1000, 0); raise exception 'Accepted zero score'; exception when invalid_parameter_value then null; end;
  begin perform public.submit_result('2020-01-01-enclosure', 'Player', 1000, 0); raise exception 'Accepted unscored result'; exception when check_violation or invalid_parameter_value then null; end;
end $$;

rollback;

-- Cross score and time deliberately: a fast, smaller area must lose to a slow,
-- larger area, and an improvement must not replace the original ranked area.
begin;
select public.register_leaderboard_puzzles('[{"puzzle_id":"2020-02-01-enclosure","puzzle_type":"enclosure","puzzle_day":"2020-02-01","width":8,"height":8,"max_score":20}]');
set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', md5('36')::uuid)::text, true);
select public.submit_enclosure_result('2020-02-01-enclosure', 'Original', 9000, 1);
select public.submit_enclosure_result('2020-02-01-enclosure', 'Improved', 1, 20);
select set_config('request.jwt.claims', jsonb_build_object('sub', md5('37')::uuid)::text, true);
select public.submit_enclosure_result('2020-02-01-enclosure', 'Slow High', 9000, 20);
select set_config('request.jwt.claims', jsonb_build_object('sub', md5('38')::uuid)::text, true);
select public.submit_enclosure_result('2020-02-01-enclosure', 'Fast Low', 1, 19);
select set_config('request.jwt.claims', jsonb_build_object('sub', md5('39')::uuid)::text, true);
select public.submit_enclosure_result('2020-02-01-enclosure', 'Fast High', 5000, 20);
select set_config('request.jwt.claims', jsonb_build_object('sub', md5('40')::uuid)::text, true);
select public.submit_enclosure_result('2020-02-01-enclosure', 'Tied High', 5000, 20);
do $$
declare entries jsonb := public.get_leaderboard('2020-02-01-enclosure')->'entries';
begin
  if (entries->0->>'rank')::int <> 1 or (entries->1->>'rank')::int <> 1
    or (entries->0->>'score')::int <> 20 or (entries->0->>'elapsed_ms')::bigint <> 5000
    or (entries->2->>'rank')::int <> 3 or entries->2->>'nickname' <> 'Slow High'
    or (entries->3->>'rank')::int <> 4 or entries->3->>'nickname' <> 'Fast Low'
    or (entries->4->>'score')::int <> 1 or (entries->4->>'elapsed_ms')::bigint <> 9000
    or entries->4->>'nickname' <> 'Original' then
    raise exception 'First-area/time ordering changed: %', entries;
  end if;
end $$;
set local role anon;
do $$ begin
  begin
    perform public.submit_enclosure_result('2020-02-01-enclosure', 'Anonymous', 1, 20);
    raise exception 'Anonymous role submitted a ranked area';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
