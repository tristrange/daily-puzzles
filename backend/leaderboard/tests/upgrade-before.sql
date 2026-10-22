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
