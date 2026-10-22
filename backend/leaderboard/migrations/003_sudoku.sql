begin;

-- Expand only catalog checks; retain all rows, security settings and RPCs.
alter table public.leaderboard_puzzles
  drop constraint leaderboard_puzzles_puzzle_type_check,
  drop constraint leaderboard_puzzles_puzzle_id_check,
  drop constraint leaderboard_puzzles_check1,
  drop constraint leaderboard_puzzles_size_label_check,
  drop constraint leaderboard_puzzles_check2,
  add constraint leaderboard_puzzles_puzzle_type_check
    check (puzzle_type in ('queens', 'star-battle', 'train-tracks', 'word-paths', 'trio', 'tents', 'sudoku')),
  add constraint leaderboard_puzzles_puzzle_id_check
    check (puzzle_id ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}(-star|-tracks(-small|-medium|-large)?|-words|-trio|-tents|-sudoku-(easy|medium|hard))?$'),
  add constraint leaderboard_puzzles_check1 check (case puzzle_type
    when 'queens' then puzzle_id = puzzle_day::text
    when 'star-battle' then puzzle_id = puzzle_day::text || '-star'
    when 'word-paths' then puzzle_id = puzzle_day::text || '-words'
    when 'trio' then puzzle_id = puzzle_day::text || '-trio'
    when 'tents' then puzzle_id = puzzle_day::text || '-tents'
    when 'sudoku' then width = 9 and height = 9 and puzzle_id in (
      puzzle_day::text || '-sudoku-easy', puzzle_day::text || '-sudoku-medium', puzzle_day::text || '-sudoku-hard')
    else puzzle_id in (puzzle_day::text || '-tracks', puzzle_day::text || '-tracks-small',
      puzzle_day::text || '-tracks-medium', puzzle_day::text || '-tracks-large') end),
  add constraint leaderboard_puzzles_size_label_check
    check (size_label in ('Small', 'Medium', 'Large', 'Easy', 'Hard')),
  add constraint leaderboard_puzzles_check2 check (case
    when puzzle_id like '%-tracks-small' then size_label is not distinct from 'Small'
    when puzzle_id like '%-tracks-medium' then size_label is not distinct from 'Medium'
    when puzzle_id like '%-tracks-large' then size_label is not distinct from 'Large'
    when puzzle_id like '%-sudoku-easy' then size_label is not distinct from 'Easy'
    when puzzle_id like '%-sudoku-medium' then size_label is not distinct from 'Medium'
    when puzzle_id like '%-sudoku-hard' then size_label is not distinct from 'Hard'
    else size_label is null end);

commit;
