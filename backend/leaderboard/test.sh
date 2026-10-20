#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
test_container="daily-puzzles-leaderboard-test-$$"
cleanup() { docker rm -f "$test_container" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run --rm -d --name "$test_container" -e POSTGRES_PASSWORD=disposable-test-only postgres:17 >/dev/null
for attempt in {1..30}; do
  if docker exec "$test_container" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
sql() { docker exec -i "$test_container" psql -X -q -v ON_ERROR_STOP=1 -U postgres "$@"; }
sql < tests/auth-fixture.sql
sql < migrations/001_leaderboards.sql
sql -c 'create database leaderboard_upgrade template postgres'
sql < migrations/002_tents.sql
sql < tests/contract.sql

# Preserve live-style data and security state while upgrading, then retry 002.
sql -d leaderboard_upgrade < tests/upgrade-before.sql
sql -d leaderboard_upgrade < migrations/002_tents.sql
sql -d leaderboard_upgrade < tests/upgrade-after.sql
sql -d leaderboard_upgrade <<'SQL'
select public.register_leaderboard_puzzles('[{"puzzle_id":"2020-01-01-tents","puzzle_type":"tents","puzzle_day":"2020-01-01","width":10,"height":10}]');
begin;
set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', md5('39')::uuid)::text, true);
select public.submit_result('2020-01-01-tents', 'Existing Tents', 12345, 0);
commit;
SQL
sql -d leaderboard_upgrade < migrations/002_tents.sql
sql -d leaderboard_upgrade <<'SQL'
do $$ begin
  if (select count(*) from public.leaderboard_results r join public.leaderboard_puzzles p using (puzzle_id)
    where r.puzzle_id = '2020-01-01-tents' and nickname = 'Existing Tents' and elapsed_ms = 12345
    and hints = 0 and puzzle_type = 'tents' and width = 10 and height = 10) <> 1
  then raise exception 'Repeated migration did not preserve existing Tents data'; end if;
end $$;
SQL
sql -d leaderboard_upgrade < tests/contract.sql

# Separate connections race for one first result; either may win, never both.
sql <<'SQL'
select public.register_leaderboard_puzzles(jsonb_build_array(jsonb_build_object(
  'puzzle_id', current_date::text, 'puzzle_type', 'queens', 'puzzle_day', current_date::text,
  'width', 7, 'height', 7, 'size_label', null)));
SQL
race() {
  sql <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', md5('1')::uuid)::text, true);
select public.submit_result(current_date::text, 'Race', $1, 0);
select pg_sleep(0.2);
commit;
SQL
}
race 1000 >/dev/null & first=$!
race 2000 >/dev/null & second=$!
wait "$first"
wait "$second"
sql <<'SQL'
do $$ begin
  if (select count(*) from public.leaderboard_results) <> 1
    or (select elapsed_ms from public.leaderboard_results) not in (1000, 2000)
  then raise exception 'Concurrent first results were not retained safely'; end if;
end $$;
SQL
echo 'Leaderboard concurrent submissions passed'
