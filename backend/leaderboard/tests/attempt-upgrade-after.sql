do $$ declare saved public.attempt_upgrade_snapshot%rowtype; begin
  select * into strict saved from public.attempt_upgrade_snapshot;
  if saved.results is distinct from (select jsonb_agg(to_jsonb(r) - 'attempt_elapsed_ms' order by id) from public.leaderboard_results r)
    or saved.limits is distinct from (select jsonb_agg(to_jsonb(l) order by user_id) from leaderboard_private.submission_limits l)
    or saved.security is distinct from (select jsonb_agg(jsonb_build_array(oid, relacl, relrowsecurity, relforcerowsecurity) order by oid) from pg_class
      where oid in ('public.leaderboard_results'::regclass, 'public.leaderboard_puzzles'::regclass,
        'leaderboard_private.submission_limits'::regclass))
    or saved.policies is distinct from (select jsonb_agg(to_jsonb(p) order by oid) from pg_policy p where polrelid in (
      'public.leaderboard_results'::regclass, 'public.leaderboard_puzzles'::regclass, 'leaderboard_private.submission_limits'::regclass))
    or saved.functions is distinct from (select jsonb_agg(to_jsonb(p) order by oid) from pg_proc p where pronamespace = 'public'::regnamespace
      and proname not in ('submit_result', 'get_leaderboard'))
  then raise exception 'Attempt migration changed existing data, limits, security or unrelated functions'; end if;
end $$;
drop table public.attempt_upgrade_snapshot;
\echo 'Attempt upgrade preserved existing data, limits and security'
