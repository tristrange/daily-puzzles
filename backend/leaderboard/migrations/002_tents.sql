begin;

-- Replace only the three family checks from 001; validate every existing row.
alter table public.leaderboard_puzzles
  drop constraint leaderboard_puzzles_puzzle_type_check,
  drop constraint leaderboard_puzzles_puzzle_id_check,
  drop constraint leaderboard_puzzles_check1,
  add constraint leaderboard_puzzles_puzzle_type_check
    check (puzzle_type in ('queens', 'star-battle', 'train-tracks', 'word-paths', 'trio', 'tents')),
  add constraint leaderboard_puzzles_puzzle_id_check
    check (puzzle_id ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}(-star|-tracks(-small|-medium|-large)?|-words|-trio|-tents)?$'),
  add constraint leaderboard_puzzles_check1 check (case puzzle_type
    when 'queens' then puzzle_id = puzzle_day::text
    when 'star-battle' then puzzle_id = puzzle_day::text || '-star'
    when 'word-paths' then puzzle_id = puzzle_day::text || '-words'
    when 'trio' then puzzle_id = puzzle_day::text || '-trio'
    when 'tents' then puzzle_id = puzzle_day::text || '-tents'
    else puzzle_id in (puzzle_day::text || '-tracks', puzzle_day::text || '-tracks-small',
      puzzle_day::text || '-tracks-medium', puzzle_day::text || '-tracks-large') end);

commit;
