begin;

alter table public.leaderboard_puzzles
  drop constraint if exists leaderboard_puzzles_puzzle_type_check,
  drop constraint if exists leaderboard_puzzles_puzzle_id_check,
  drop constraint if exists leaderboard_puzzles_check1,
  add constraint leaderboard_puzzles_puzzle_type_check
    check (puzzle_type in ('queens', 'star-battle', 'train-tracks', 'word-paths', 'trio', 'tents', 'sudoku', 'nurikabe', 'killer-sudoku', 'enclosure')),
  add constraint leaderboard_puzzles_puzzle_id_check
    check (puzzle_id ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}(-star|-tracks(-small|-medium|-large)?|-words|-trio|-tents|-(killer-)?sudoku-(easy|medium|hard)|-nurikabe|-enclosure)?$'),
  add constraint leaderboard_puzzles_check1 check (case puzzle_type
    when 'queens' then puzzle_id = puzzle_day::text
    when 'star-battle' then puzzle_id = puzzle_day::text || '-star'
    when 'word-paths' then puzzle_id = puzzle_day::text || '-words'
    when 'trio' then puzzle_id = puzzle_day::text || '-trio'
    when 'tents' then puzzle_id = puzzle_day::text || '-tents'
    when 'sudoku' then width = 9 and height = 9 and puzzle_id in (
      puzzle_day::text || '-sudoku-easy', puzzle_day::text || '-sudoku-medium', puzzle_day::text || '-sudoku-hard')
    when 'killer-sudoku' then width = 9 and height = 9 and puzzle_id in (
      puzzle_day::text || '-killer-sudoku-easy', puzzle_day::text || '-killer-sudoku-medium', puzzle_day::text || '-killer-sudoku-hard')
    when 'enclosure' then puzzle_id = puzzle_day::text || '-enclosure' and width = height
    when 'nurikabe' then width = 7 and height = 7 and puzzle_id = puzzle_day::text || '-nurikabe'
    else puzzle_id in (puzzle_day::text || '-tracks', puzzle_day::text || '-tracks-small',
      puzzle_day::text || '-tracks-medium', puzzle_day::text || '-tracks-large') end);


alter table public.leaderboard_puzzles add column if not exists max_score integer;
alter table public.leaderboard_results add column if not exists score integer;
alter table public.leaderboard_puzzles drop constraint if exists leaderboard_puzzles_max_score_check;
alter table public.leaderboard_puzzles add constraint leaderboard_puzzles_max_score_check
  check (case when puzzle_type = 'enclosure' then max_score is not null and max_score between 1 and width * height else max_score is null end);

create or replace function leaderboard_private.validate_result_score() returns trigger
language plpgsql set search_path = '' as $$
declare catalog public.leaderboard_puzzles%rowtype;
begin
  select * into catalog from public.leaderboard_puzzles where puzzle_id = new.puzzle_id for share;
  if (catalog.puzzle_type = 'enclosure' and (new.score is null or new.score <= 0 or new.score > catalog.max_score or new.hints <> 0))
    or (catalog.puzzle_type <> 'enclosure' and new.score is not null) then
    raise exception 'Invalid score for puzzle' using errcode = '22023';
  end if;
  return new;
end; $$;
drop trigger if exists leaderboard_result_score_check on public.leaderboard_results;
create trigger leaderboard_result_score_check before insert or update on public.leaderboard_results
  for each row execute function leaderboard_private.validate_result_score();

create or replace function leaderboard_private.validate_catalog_score() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select from public.leaderboard_results where puzzle_id = new.puzzle_id and
    (case when new.puzzle_type = 'enclosure' then score is null or score <= 0 or score > new.max_score or hints <> 0
      else score is not null end)) then
    raise exception 'Catalog change would invalidate results' using errcode = '22023';
  end if;
  return new;
end; $$;
drop trigger if exists leaderboard_catalog_score_check on public.leaderboard_puzzles;
create trigger leaderboard_catalog_score_check before update on public.leaderboard_puzzles
  for each row execute function leaderboard_private.validate_catalog_score();

create or replace function public.register_leaderboard_puzzles(p_puzzles jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  if p_puzzles is null or jsonb_typeof(p_puzzles) <> 'array' then
    raise exception 'Expected a puzzle metadata array' using errcode = '22023';
  end if;
  insert into public.leaderboard_puzzles (puzzle_id, puzzle_type, puzzle_day, width, height, size_label, max_score)
    select puzzle_id, puzzle_type, puzzle_day, width, height, size_label, max_score
    from jsonb_to_recordset(p_puzzles) as p(puzzle_id text, puzzle_type text, puzzle_day date,
      width integer, height integer, size_label text, max_score integer)
    on conflict (puzzle_id) do update set puzzle_type = excluded.puzzle_type,
      puzzle_day = excluded.puzzle_day, width = excluded.width, height = excluded.height,
      size_label = excluded.size_label, max_score = excluded.max_score;
  get diagnostics affected = row_count;
  return affected;
end; $$;

create or replace function public.submit_enclosure_result(p_puzzle_id text, p_nickname text, p_elapsed_ms bigint, p_score integer, p_attempt_elapsed_ms bigint default null)
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
    or p_score is null or p_score <= 0
    or (p_attempt_elapsed_ms is not null and (p_attempt_elapsed_ms not between 0 and 9007199254740991
      or p_attempt_elapsed_ms > p_elapsed_ms)) then
    raise exception 'Invalid nickname or score' using errcode = '22023';
  end if;
  if not exists (select from public.leaderboard_puzzles where puzzle_id = p_puzzle_id
    and puzzle_type = 'enclosure' and p_score <= max_score
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
  insert into public.leaderboard_results (user_id, puzzle_id, nickname, elapsed_ms, hints, attempt_elapsed_ms, score)
    values (owner_id, p_puzzle_id, clean_name, p_elapsed_ms, 0, p_attempt_elapsed_ms, p_score);
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
    select user_id, nickname, elapsed_ms, hints, attempt_elapsed_ms, score,
      rank() over (order by score desc nulls last, hints, elapsed_ms) as rank,
      row_number() over (order by score desc nulls last, hints, elapsed_ms, submitted_at, id) as position
    from public.leaderboard_results where puzzle_id = p_puzzle_id
  ), projected as (
    select position, user_id, jsonb_build_object('rank', rank, 'nickname', nickname,
      'elapsed_ms', elapsed_ms, 'hints', hints, 'is_you', coalesce(user_id = owner_id, false))
      || case when score is null then '{}'::jsonb else jsonb_build_object('score', score) end
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

revoke all on function public.submit_enclosure_result(text, text, bigint, integer, bigint) from public, anon, authenticated;
grant execute on function public.submit_enclosure_result(text, text, bigint, integer, bigint) to authenticated;
notify pgrst, 'reload schema';
commit;
