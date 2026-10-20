do $$ declare saved public.leaderboard_upgrade_snapshot%rowtype; begin
  select * into strict saved from public.leaderboard_upgrade_snapshot;
  if saved.puzzles is distinct from (select jsonb_agg(to_jsonb(p) order by puzzle_id) from public.leaderboard_puzzles p)
    or saved.results is distinct from (select jsonb_agg(to_jsonb(r) order by id) from public.leaderboard_results r)
    or saved.limits is distinct from (select jsonb_agg(to_jsonb(l) order by user_id) from leaderboard_private.submission_limits l)
  then raise exception 'Upgrade changed existing catalog, results or rate limits'; end if;
  if saved.tables is distinct from (select jsonb_agg(to_jsonb(c) order by oid) from pg_class c where oid in (
      'public.leaderboard_puzzles'::regclass, 'public.leaderboard_results'::regclass,
      'leaderboard_private.submission_limits'::regclass))
    or saved.functions is distinct from (select jsonb_agg(to_jsonb(p) order by oid) from pg_proc p where pronamespace in (
      'public'::regnamespace, 'leaderboard_private'::regnamespace))
    or saved.policies is distinct from (select jsonb_agg(to_jsonb(p) order by oid) from pg_policy p where polrelid in (
      'public.leaderboard_puzzles'::regclass, 'public.leaderboard_results'::regclass,
      'leaderboard_private.submission_limits'::regclass))
    or saved.constraints is distinct from (select jsonb_agg(to_jsonb(c) order by oid) from pg_constraint c where conrelid in (
      'public.leaderboard_puzzles'::regclass, 'public.leaderboard_results'::regclass,
      'leaderboard_private.submission_limits'::regclass) and conname not in (
        'leaderboard_puzzles_puzzle_type_check', 'leaderboard_puzzles_puzzle_id_check',
        'leaderboard_puzzles_check1'))
  then raise exception 'Upgrade changed security, RPCs or unrelated constraints'; end if;
  if exists (select from pg_constraint where conrelid = 'public.leaderboard_puzzles'::regclass and not convalidated)
  then raise exception 'Upgrade did not validate the catalog constraints'; end if;
end $$;
drop table public.leaderboard_upgrade_snapshot;
\echo 'Leaderboard upgrade preserved existing data, security and RPCs'
