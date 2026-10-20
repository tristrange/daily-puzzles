# Tents preview

The user approved starting Tents after the recent cleanup and Trio Clear notes.
Keep delivery here in a focused PR, following the existing preview flow.

## Rules and scope

Use an 8×8 board with fixed trees and row/column tent totals. Tents occupy
non-tree cells and cannot touch, even diagonally. Every tree must be paired with
one orthogonally adjacent tent and every tent with one tree. A tent may border
several trees; requiring exactly one adjacent tree would be a different puzzle.
Uniqueness means a unique set of tent cells, not a unique pairing.
Reference: [Simon Tatham's Tents rules](https://newroman.net/puzzles/js/tents.html).

Ship three answer-free, independently solver-verified preview boards at
`#/preview/tents?board=1`, linked from Today and How to play. No daily registration,
archive slots, stats, leaderboard, shared schema or publisher changes yet.
Do not label difficulty or claim all future boards are solvable by these rules.

## Playing

Use Tent, Grass and Erase brushes, with tap/drag, arrow navigation, keyboard
shortcuts, Undo/Redo and confirmed Reset. A drag is one undo step; cancellation
restores its starting state. Trees are immutable. Grass marks are optional for
completion but treated as assumptions by hints. Show overfilled line clues,
touching tents and tents without a possible tree pairing as conflicts.

Save unfinished attempts and active time per board using preview-only keys.
Pause time while hidden or away. Completed previews start fresh on reopening;
browser storage failure must leave play usable and show a warning.

Explained hints use non-touching, tree adjacency and line counts. They highlight
the target and support, and offer Apply move as one undo step. Report a stall or
contradiction honestly; never reveal a stored solution or silently guess.
Reuse HintPanel, ResetButton, useMoveHistory, the active clock and theme tokens.
Keep controls beside the board on desktop and compact above it on phones.

## Proof and stop condition

An isolated Python preview tool constructs deterministic candidates and counts
tent placements up to two using row-pattern search plus bipartite matching.
Budget exhaustion is inconclusive and must fail, never certify uniqueness.
Keep this outside the production family registry. Store a small measurement
report; avoid a large seed sweep in normal tests.

Test matching edge cases, zero/one/multiple solutions, bounded exhaustion, malformed
boards, hint soundness, saved attempts and real playing controls. Run existing
checks and browser-check phone/desktop, light/dark, reload, hints and completion.
Stop at a playable preview PR; generation quality and physical iPhone playtesting
inform a later daily rollout.
