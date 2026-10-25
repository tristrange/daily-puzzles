begin;

alter table public.leaderboard_results add column if not exists attempt_elapsed_ms bigint;
alter table public.leaderboard_results drop constraint if exists leaderboard_results_attempt_elapsed_ms_check;
alter table public.leaderboard_results add constraint leaderboard_results_attempt_elapsed_ms_check
  check (attempt_elapsed_ms between 0 and 9007199254740991 and attempt_elapsed_ms <= elapsed_ms);

-- A single defaulted signature keeps named four-argument PostgREST calls unambiguous.
drop function if exists public.submit_result(text, text, bigint, bigint);
drop function if exists public.submit_result(text, text, bigint, bigint, bigint);

create function public.submit_result(p_puzzle_id text, p_nickname text, p_elapsed_ms bigint, p_hints bigint, p_attempt_elapsed_ms bigint default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  clean_name text := btrim(p_nickname);
  now_at timestamptz := clock_timestamp();
  allowance leaderboard_private.submission_limits%rowtype;
begin
  if owner_id is null then raise exception 'A player session is required' using errcode = '28000'; end if;
  if clean_name is null or clean_name !~ '^[-A-Za-z0-9_ ]{2,20}$'
    or p_elapsed_ms is null or p_elapsed_ms not between 0 and 9007199254740991
    or p_hints is null or p_hints not between 0 and 9007199254740991
    or (p_attempt_elapsed_ms is not null and (p_attempt_elapsed_ms not between 0 and 9007199254740991
      or p_attempt_elapsed_ms > p_elapsed_ms)) then
    raise exception 'Invalid nickname or score' using errcode = '22023';
  end if;
  if not exists (select from public.leaderboard_puzzles where puzzle_id = p_puzzle_id
    and puzzle_day <= (now_at at time zone 'Pacific/Kiritimati')::date) then
    raise exception 'Puzzle is not available' using errcode = '22023';
  end if;
  -- Serialize this owner's first writes, duplicate retries and deletions.
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  if exists (select from public.leaderboard_results where user_id = owner_id and puzzle_id = p_puzzle_id) then
    return jsonb_build_object('status', 'existing');
  end if;
  select * into allowance from leaderboard_private.submission_limits where user_id = owner_id;
  if found and allowance.window_start > now_at - interval '1 minute' and allowance.submissions >= 20 then
    raise exception 'Too many new results; retry later' using errcode = 'P0001';
  end if;
  insert into leaderboard_private.submission_limits values (owner_id, now_at, 1)
    on conflict (user_id) do update set
      window_start = case when submission_limits.window_start <= now_at - interval '1 minute'
        then now_at else submission_limits.window_start end,
      submissions = case when submission_limits.window_start <= now_at - interval '1 minute'
        then 1 else submission_limits.submissions + 1 end;
  insert into public.leaderboard_results (user_id, puzzle_id, nickname, elapsed_ms, hints, attempt_elapsed_ms)
    values (owner_id, p_puzzle_id, clean_name, p_elapsed_ms, p_hints, p_attempt_elapsed_ms);
  return jsonb_build_object('status', 'created');
end;
$$;

create or replace function public.get_leaderboard(p_puzzle_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  result jsonb;
begin
  if not exists (select from public.leaderboard_puzzles where puzzle_id = p_puzzle_id
    and puzzle_day <= (statement_timestamp() at time zone 'Pacific/Kiritimati')::date) then
    raise exception 'Puzzle is not available' using errcode = '22023';
  end if;
  with ranked as (
    select user_id, nickname, elapsed_ms, hints, attempt_elapsed_ms,
      rank() over (order by hints, elapsed_ms) as rank,
      row_number() over (order by hints, elapsed_ms, submitted_at, id) as position
    from public.leaderboard_results where puzzle_id = p_puzzle_id
  ), projected as (
    select position, user_id, jsonb_build_object('rank', rank, 'nickname', nickname,
      'elapsed_ms', elapsed_ms, 'hints', hints, 'is_you', coalesce(user_id = owner_id, false))
      || case when attempt_elapsed_ms is null then '{}'::jsonb
        else jsonb_build_object('attempt_elapsed_ms', attempt_elapsed_ms) end as entry
    from ranked
  )
  select jsonb_build_object(
    'entries', coalesce(jsonb_agg(entry order by position) filter (where position <= 25), '[]'::jsonb),
    'total', count(*),
    'own_entry', (jsonb_agg(entry) filter (where user_id = owner_id and position > 25))->0
  ) into result from projected;
  return result;
end;
$$;

revoke all on function public.submit_result(text, text, bigint, bigint, bigint) from public, anon, authenticated;
grant execute on function public.submit_result(text, text, bigint, bigint, bigint) to authenticated;
notify pgrst, 'reload schema';
commit;
