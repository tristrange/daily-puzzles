-- Full rows plus unchanged database security/function definitions, not only counts.
create table public.leaderboard_upgrade_snapshot as
select
  (select jsonb_agg(to_jsonb(p) order by puzzle_id) from public.leaderboard_puzzles p) as puzzles,
  (select jsonb_agg(to_jsonb(r) order by id) from public.leaderboard_results r) as results,
  (select jsonb_agg(to_jsonb(l) order by user_id) from leaderboard_private.submission_limits l) as limits,
  (select jsonb_agg(to_jsonb(c) order by oid) from pg_class c where oid in (
    'public.leaderboard_puzzles'::regclass, 'public.leaderboard_results'::regclass,
    'leaderboard_private.submission_limits'::regclass)) as tables,
  (select jsonb_agg(to_jsonb(p) order by oid) from pg_proc p where pronamespace in (
    'public'::regnamespace, 'leaderboard_private'::regnamespace)) as functions,
  (select jsonb_agg(to_jsonb(p) order by oid) from pg_policy p where polrelid in (
    'public.leaderboard_puzzles'::regclass, 'public.leaderboard_results'::regclass,
    'leaderboard_private.submission_limits'::regclass)) as policies,
  (select jsonb_agg(to_jsonb(c) order by oid) from pg_constraint c where conrelid in (
    'public.leaderboard_puzzles'::regclass, 'public.leaderboard_results'::regclass,
    'leaderboard_private.submission_limits'::regclass) and conname not in (
      'leaderboard_puzzles_puzzle_type_check', 'leaderboard_puzzles_puzzle_id_check',
      'leaderboard_puzzles_check1', 'leaderboard_puzzles_size_label_check',
      'leaderboard_puzzles_check2')) as constraints;
