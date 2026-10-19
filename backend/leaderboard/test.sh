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
sql < tests/contract.sql

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
