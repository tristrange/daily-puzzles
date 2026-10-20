-- Seed the old schema before applying 002, including each original ID form.
select public.register_leaderboard_puzzles(jsonb_agg(jsonb_build_object(
  'puzzle_id', '2020-01-01' || suffix, 'puzzle_type', family,
  'puzzle_day', '2020-01-01', 'width', size, 'height', size, 'size_label', label)))
from (values ('queens', '', 7, null), ('star-battle', '-star', 9, null),
  ('word-paths', '-words', 5, null), ('trio', '-trio', 9, null),
  ('train-tracks', '-tracks', 7, null), ('train-tracks', '-tracks-small', 8, 'Small'),
  ('train-tracks', '-tracks-medium', 10, 'Medium'), ('train-tracks', '-tracks-large', 12, 'Large'))
  v(family, suffix, size, label);
begin;
set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', md5('39')::uuid)::text, true);
select public.submit_result('2020-01-01', 'Existing Player', 43210, 2);
commit;

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
      'leaderboard_puzzles_check1')) as constraints;
