# Sudoku preview

## Approved direction and delivery boundary

The maintainer chose standard Sudoku, with a future Easy, Medium and Hard puzzle
every day. First deliver one playable preview per level so they can assess the
challenge and phone controls. Preserve the existing six games and all saved data.
This is a new rules/solver module, using the existing preview architecture.

The first implementation milestone establishes the Sudoku model, independent
solution verification and three original sample boards. The following milestone
adds the complete playable preview. Use focused reviewable PRs and implement here.
Daily IDs, the shared production schema, publisher, archive, Stats and leaderboard
registration wait until the preview has been playtested. No new dependency is
expected. Do not generalize Trio into a configurable puzzle framework.

## Exact rules

The board has 81 row-major cells, nine rows, nine columns and nine fixed 3×3 boxes.
Fill every cell with a digit from 1 through 9. Each row, column and box contains
each digit exactly once. Starting digits are immutable. Notes are optional and
do not count toward completion. No diagonal, arithmetic or other variant rules.
See [Nikoli's standard rules](https://www.nikoli.co.jp/en/puzzles/sudoku/).

Parse exactly 81 integer values from 0 through 9, with 0 meaning empty. Preview
definitions have stable IDs `sudoku-preview-1` through `sudoku-preview-3`, a level
label and givens. Reject malformed values, unknown levels and duplicate IDs.
Parsing rejects givens with duplicate digits in a row, column or box; offline
verification rejects all unsatisfiable definitions. A full grid
passes only the direct row/column/box validator; an answer comparison is not the
completion rule. Ship givens only, without solutions in the app's preview JSON.

## What the levels mean

Rate by the weakest supported technique set that completes the original puzzle.
Clue count, board size and brute-force search work do not determine the label.

| Level | Supported logical techniques |
| --- | --- |
| Easy | Naked and hidden singles |
| Medium | Easy techniques, locked candidates (pointing/claiming), naked and hidden pairs |
| Hard | Medium techniques, naked and hidden triples, and X-wing |

A Medium sample must stall under Easy rules and finish under Medium rules. A
Hard sample must stall under Medium rules and finish under Hard rules. Reject
candidates that require guessing or exceed the supported techniques. The labels
are provisional project ratings, not equivalent to another Sudoku app's ratings;
human playtesting decides whether their separation feels useful.

Keep an exact solver separate from the technique solver. Count solutions up to
two, with explicit node/attempt budgets. Exhaustion is inconclusive, never proof
of uniqueness. Generate original candidates offline using deterministic seeds
and clue removal, then accept only boards with exactly one solution and a
complete logical trace in their intended band. Record seeds, techniques, work
and timings in a small measurement report. Do not add a broad seed sweep to CI.

## Playing and phone layout

Use cell-first entry: tap an editable cell, then choose 1–9 or Erase. Arrow keys
move focus; digits enter values; Delete/Backspace erases; N toggles Notes;
Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z use the existing history convention. Tapping a
given may select it for inspection, but entry controls must not modify it.
Selecting a cell alone must never place a number or count as a move.

Notes toggles digits in empty cells, displayed in a consistent 3×3 arrangement.
Entering a digit clears that cell's notes. Erase clears the selected editable
cell; Clear notes removes all pencil marks as one undoable action. Do not silently
fill or prune notes elsewhere. Undo/Redo restores both values and notes; a fresh
edit after Undo discards Redo. Reset uses ResetButton's existing confirmation
and undo behavior, preserving elapsed time and shown-hint count.

Use the existing theme tokens and restrained board styling, with clear box
boundaries, selected-cell and row/column/box context, and visible duplicate-digit
conflicts. Distinguish givens without relying on color alone. Keep the board large:
controls beside it on desktop, a compact toolbar above and a two-row 1–9/Erase
keypad below the board on phones. Keep touch targets usable and let the page scroll
outside the board. Number entry does not need a drag-paint gesture.

Save values, notes, active elapsed time and shown hints under a preview-only key,
with a version and givens fingerprint. Ignore malformed or stale saves. Storage
failure leaves play usable with the existing save warning. Pause active time
while hidden or away; reopening a completed board starts fresh. Undo history is
visit-local. Preview attempts never write daily Stats or leaderboard scores.

## Explained hints

Use the same supported techniques as the offline classifier, with a small shared
fixture set to check Python/TypeScript agreement. Each step identifies its rule,
target, supporting cells and candidate change. Notes may select a useful hint
but never prove one. Reuse HintPanel and the established target/support outlines;
Show cell focuses the target, Escape restores Hint focus, and Apply move is one
undoable action. A candidate-only hint updates the target's notes and explains
the resulting candidate set without placing a digit. Revealing a hint increments
and saves the count immediately; Undo and Reset never refund it.

Before a normal hint, independently check the placed digits against the unique
solution using a bounded browser solver, cached per definition. If verification
cannot finish or uniqueness fails, report that honestly and offer no accusation.
For a wrong entry, use the established progression: a free general warning,
optional Show the mistake (counts one hint), then optional Apply to clear one
identified entry. Do not reveal a correction in the initial warning. Ignore manual
notes in this check. Never silently guess or substitute a stored answer for a
logical hint; report stalls and contradictions distinctly.

## Integration and acceptance

Add a lazy `/preview/sudoku?board=1` route using the current preview selector
pattern. Label the three choices Easy, Medium and Hard and link from Today and
a dedicated How to play section. Invalid selectors fall back to the first board.
Use dedicated Sudoku domain, progress and stage modules while reusing history,
timer, Reset and hint presentation patterns. No changes to existing game rules,
save formats, generated archives or database permissions.

Focused checks must cover row/column/box validity, zero/one/multiple solutions,
budget exhaustion, the three band certificates, deduction soundness against
independent solutions, immutable givens, notes/history, saved reload, confirmed
Reset, hint progression and preview isolation. Keep expensive generation probes
report-only. Run the relevant existing gates once, inspect the production bundle
for accidental eager loading, and obtain one independent review per code PR.

Browser-check desktop and phone widths in Light, Dark and Auto, keypad/keyboard
entry, notes and Clear notes, history, reload, hints and completion. Physical
iPhone playtesting remains a maintainer acceptance step. Stop after the verified
preview is available; daily generation and three-per-day publication need their
own later rollout, informed by the maintainer's playtest.
