create table public.attempt_upgrade_snapshot as select
  (select jsonb_agg(to_jsonb(r) - 'attempt_elapsed_ms' order by id) from public.leaderboard_results r) as results,
  (select jsonb_agg(to_jsonb(l) order by user_id) from leaderboard_private.submission_limits l) as limits,
  (select jsonb_agg(jsonb_build_array(oid, relacl, relrowsecurity, relforcerowsecurity) order by oid) from pg_class
    where oid in ('public.leaderboard_results'::regclass, 'public.leaderboard_puzzles'::regclass,
      'leaderboard_private.submission_limits'::regclass)) as security,
  (select jsonb_agg(to_jsonb(p) order by oid) from pg_policy p where polrelid in (
    'public.leaderboard_results'::regclass, 'public.leaderboard_puzzles'::regclass,
    'leaderboard_private.submission_limits'::regclass)) as policies,
  (select jsonb_agg(to_jsonb(p) order by oid) from pg_proc p where pronamespace = 'public'::regnamespace
    and proname not in ('submit_result', 'get_leaderboard')) as functions;
