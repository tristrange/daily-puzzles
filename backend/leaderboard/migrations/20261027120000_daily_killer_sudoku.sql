begin;

alter table public.leaderboard_puzzles
  drop constraint leaderboard_puzzles_puzzle_type_check,
  drop constraint leaderboard_puzzles_puzzle_id_check,
  drop constraint leaderboard_puzzles_check1,
  add constraint leaderboard_puzzles_puzzle_type_check
    check (puzzle_type in ('queens', 'star-battle', 'train-tracks', 'word-paths', 'trio', 'tents', 'sudoku', 'nurikabe', 'killer-sudoku')),
  add constraint leaderboard_puzzles_puzzle_id_check
    check (puzzle_id ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}(-star|-tracks(-small|-medium|-large)?|-words|-trio|-tents|-(killer-)?sudoku-(easy|medium|hard)|-nurikabe)?$'),
  add constraint leaderboard_puzzles_check1 check (case puzzle_type
    when 'queens' then puzzle_id = puzzle_day::text
    when 'star-battle' then puzzle_id = puzzle_day::text || '-star'
    when 'word-paths' then puzzle_id = puzzle_day::text || '-words'
    when 'trio' then puzzle_id = puzzle_day::text || '-trio'
    when 'tents' then puzzle_id = puzzle_day::text || '-tents'
    when 'sudoku' then width = 9 and height = 9 and puzzle_id in (
      puzzle_day::text || '-sudoku-easy', puzzle_day::text || '-sudoku-medium', puzzle_day::text || '-sudoku-hard')
    when 'killer-sudoku' then width = 9 and height = 9 and puzzle_id in (
      puzzle_day::text || '-killer-sudoku-easy', puzzle_day::text || '-killer-sudoku-medium', puzzle_day::text || '-killer-sudoku-hard')
    when 'nurikabe' then width = 7 and height = 7 and puzzle_id = puzzle_day::text || '-nurikabe'
    else puzzle_id in (puzzle_day::text || '-tracks', puzzle_day::text || '-tracks-small',
      puzzle_day::text || '-tracks-medium', puzzle_day::text || '-tracks-large') end);

commit;
