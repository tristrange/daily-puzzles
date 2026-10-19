begin;

create schema leaderboard_private;
revoke all on schema leaderboard_private from public, anon, authenticated;

create table public.leaderboard_puzzles (
  puzzle_id text primary key,
  puzzle_type text not null check (puzzle_type in ('queens', 'star-battle', 'train-tracks', 'word-paths', 'trio')),
  puzzle_day date not null,
  width integer not null check (width between 1 and 16),
  height integer not null check (height between 1 and 16),
  size_label text check (size_label in ('Small', 'Medium', 'Large')),
  check (puzzle_id ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}(-star|-tracks(-small|-medium|-large)?|-words|-trio)?$'),
  check (left(puzzle_id, 10) = puzzle_day::text),
  check (case puzzle_type
    when 'queens' then puzzle_id = puzzle_day::text
    when 'star-battle' then puzzle_id = puzzle_day::text || '-star'
    when 'word-paths' then puzzle_id = puzzle_day::text || '-words'
    when 'trio' then puzzle_id = puzzle_day::text || '-trio'
    else puzzle_id in (puzzle_day::text || '-tracks', puzzle_day::text || '-tracks-small',
      puzzle_day::text || '-tracks-medium', puzzle_day::text || '-tracks-large') end),
  check (case when puzzle_id like '%-tracks-small' then size_label is not distinct from 'Small'
    when puzzle_id like '%-tracks-medium' then size_label is not distinct from 'Medium'
    when puzzle_id like '%-tracks-large' then size_label is not distinct from 'Large'
    else size_label is null end)
);

create table public.leaderboard_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  puzzle_id text not null references public.leaderboard_puzzles(puzzle_id),
  nickname text not null check (nickname = btrim(nickname) and nickname ~ '^[-A-Za-z0-9_ ]{2,20}$'),
  elapsed_ms bigint not null check (elapsed_ms between 0 and 9007199254740991),
  hints bigint not null check (hints between 0 and 9007199254740991),
  submitted_at timestamptz not null default clock_timestamp(),
  unique (user_id, puzzle_id)
);
create index leaderboard_result_order on public.leaderboard_results(puzzle_id, hints, elapsed_ms, submitted_at, id);

-- Separate from public results so deleting scores cannot reset the write budget.
create table leaderboard_private.submission_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  submissions integer not null check (submissions between 1 and 20)
);

alter table public.leaderboard_puzzles enable row level security;
alter table public.leaderboard_results enable row level security;
alter table leaderboard_private.submission_limits enable row level security;
revoke all on public.leaderboard_puzzles, public.leaderboard_results from public, anon, authenticated;
revoke all on leaderboard_private.submission_limits from public, anon, authenticated;

create function public.register_leaderboard_puzzles(p_puzzles jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  if p_puzzles is null or jsonb_typeof(p_puzzles) <> 'array' then
    raise exception 'Expected a puzzle metadata array' using errcode = '22023';
  end if;
  insert into public.leaderboard_puzzles (puzzle_id, puzzle_type, puzzle_day, width, height, size_label)
    select puzzle_id, puzzle_type, puzzle_day, width, height, size_label
    from jsonb_to_recordset(p_puzzles) as p(puzzle_id text, puzzle_type text, puzzle_day date,
      width integer, height integer, size_label text)
    on conflict (puzzle_id) do update set puzzle_type = excluded.puzzle_type,
      puzzle_day = excluded.puzzle_day, width = excluded.width, height = excluded.height,
      size_label = excluded.size_label;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create function public.submit_result(p_puzzle_id text, p_nickname text, p_elapsed_ms bigint, p_hints bigint)
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
    or p_hints is null or p_hints not between 0 and 9007199254740991 then
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
  insert into public.leaderboard_results (user_id, puzzle_id, nickname, elapsed_ms, hints)
    values (owner_id, p_puzzle_id, clean_name, p_elapsed_ms, p_hints);
  return jsonb_build_object('status', 'created');
end;
$$;

create function public.get_leaderboard(p_puzzle_id text) returns jsonb
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
    select user_id, nickname, elapsed_ms, hints,
      rank() over (order by hints, elapsed_ms) as rank,
      row_number() over (order by hints, elapsed_ms, submitted_at, id) as position
    from public.leaderboard_results where puzzle_id = p_puzzle_id
  ), projected as (
    select position, user_id, jsonb_build_object('rank', rank, 'nickname', nickname,
      'elapsed_ms', elapsed_ms, 'hints', hints, 'is_you', coalesce(user_id = owner_id, false)) as entry
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

create function public.remove_my_results() returns integer
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); affected integer;
begin
  if owner_id is null then raise exception 'A player session is required' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  delete from public.leaderboard_results where user_id = owner_id;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.register_leaderboard_puzzles(jsonb) from public, anon, authenticated;
revoke all on function public.submit_result(text, text, bigint, bigint) from public, anon, authenticated;
revoke all on function public.get_leaderboard(text) from public, anon, authenticated;
revoke all on function public.remove_my_results() from public, anon, authenticated;
grant execute on function public.register_leaderboard_puzzles(jsonb) to service_role;
grant execute on function public.submit_result(text, text, bigint, bigint) to authenticated;
grant execute on function public.get_leaderboard(text) to anon, authenticated;
grant execute on function public.remove_my_results() to authenticated;
notify pgrst, 'reload schema';
commit;
