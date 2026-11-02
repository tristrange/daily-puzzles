# Product roadmap

This is a working list of ideas for Daily Puzzles, not a release schedule. Items
in the first section are follow-ups we have discussed. New suggestions and ideas
we decided to postpone have their own sections. Revisit the list after playtesting.

## Agreed follow-ups

### Progress checks for more games

Add a free progress check to Trio, Tents, and Train Tracks, one game at a time.
The check should report a mistake without revealing its location. Revealing a
specific mistake then counts as a hint, as it does in the existing checks.

Each game needs its own rules. Trio notes and Tents highlights are working aids,
not committed answers. Train Tracks `?` means a track with an undecided shape.
Tents checks must account for valid tree-to-tent pairings. Preserve each game's
saved progress and allow any correction to be undone.

### Daily deduction challenge

Collect feedback from the [Sudoku preview](https://tristrange.github.io/daily-puzzles/#/preview/deduction)
before making it a daily feature. The preview rotates nine lesson positions,
checks one prepared elimination, and does not save results. Before launch, prepare
more positions and decide how to handle other valid deductions. Consider saving
completion locally and extending the challenge to other games only if players
enjoy it.

### Portable progress

Extend the existing Stats export and import to cover more local progress, such as
unfinished puzzles and completed lessons. Keep existing stats backups readable.
Decide how imports handle conflicts without silently replacing newer work.
Keep leaderboard credentials out of the backup unless a separate design calls
for them. This is a player-data backup, not a database backup or automatic sync.

## Ongoing improvements

- Keep lessons focused on useful advanced techniques, with varied exercises and
  clear reasoning. See the [lesson guide](learn-roadmap.md) for teaching criteria.
- Improve puzzle quality and hints using real sticking points from playtesting.
  A unique solution does not prove a puzzle can be solved with the deductions a
  player or the current hint engine knows. Train Tracks and Star Battle are
  candidates for further work on human-solvable reasoning.

## Small issue to fix

The How to Play page says unfinished Queens and Star Battle attempts restart on
reload and that updates always require closing every window. Both statements are
out of date. Update that guidance to match the current saved-progress and update
behavior, and check the other games while editing it.

## Deferred ideas

- **Challenge a friend.** Share a puzzle and compare results for friendly play.
  Reuse existing links or leaderboards where practical; client-reported times and
  hints are not cheat-proof. We decided to leave this for later.
- **Post-solve walkthrough.** Show an example logical route through a solved
  puzzle, not a reconstruction of the player's moves. Start with a game whose
  solver can support an honest, complete explanation.
- **Slitherlink.** Explore a loop-drawing puzzle after the current ideas. Start
  with a preview and separately evaluate uniqueness and human playability.
- **Chess-style Sudoku.** Explore another Sudoku variant after Killer Sudoku;
  choose the actual chess constraints before designing or implementing it.

## New ideas to discuss

These are proposals, not commitments.

- **Puzzle collections.** Offer small, hand-picked sets of archive boards around
  a theme, such as a tour of different games. Players can finish a collection at
  their own pace, using existing solve history. This differs from the rotating
  weekly goals because the boards themselves are selected in advance.
- **Save for later.** Let players bookmark an archive puzzle and find it again in
  a short local list. A bookmark would not guarantee offline access unless the
  puzzle has also been downloaded. Include bookmarks in a future progress backup.
- **Practice later.** Let a player save a lesson from a hint for after the puzzle,
  instead of interrupting the solve. The list could use existing lesson progress
  and stay on the device.
- **Personal context after a solve.** Optionally compare a result with the
  player's previous results for the same game and size or level. Show hint use
  alongside time and avoid implying that every board has equal difficulty.
- **Untimed practice.** Offer an unscored copy of a puzzle for relaxed
  experimentation. Keep it separate from daily results, streaks, achievements,
  and leaderboards. This needs care across the different saved-game formats.
- **Find the deduction yourself.** If players enjoy the daily deduction preview,
  try an optional version that does not identify the target cell. It would need
  fair handling of multiple valid moves and enough explanation when players get
  stuck.

## Recently delivered

Hint-to-lesson links, Surprise me in the archive, the Puzzle Passport, weekly
challenges, learning achievements, and individual Word Paths word removal are
available. Progress checks already exist for Sudoku, Killer Sudoku, Queens, Star
Battle, and Nurikabe.
