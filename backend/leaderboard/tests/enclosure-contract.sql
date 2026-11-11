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
