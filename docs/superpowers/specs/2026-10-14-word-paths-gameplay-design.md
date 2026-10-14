# Playable Word Paths preview

## Outcome

Implement the approved English Word Paths rules in a usable browser game. Reuse
the frozen v1 word list, shared files, current visual design and local-only
storage. This PR delivers a preview at `#/preview/word-paths`; daily publication
and existing archives stay unchanged. Branch: `feat/word-paths-gameplay`.

## Rules and state

Keep `WordGame` separate from marks/tracks state: grid, accepted word paths and
unfinished trace. Spell only orthogonal paths through letters, never blockers or
repeated cells. Accept any frozen-vocabulary word whose length has an unused
slot and whose cells are not already claimed. Submission order is irrelevant.
Locally accepted words can lead to dead ends; explain this and offer Undo.
Win only when legal accepted paths fill every required length and open cell.
No hidden answer paths, client solver, hints or vocabulary expansion.

## Input and feedback

Drag letters and release to submit. Tap letters and use Submit for precise input.
Highlight immediately on press and show the traced word continuously. Returning
to an earlier selected cell truncates the trace; diagonal jumps, blockers and
accepted cells never enter it. A tap alone keeps selection; Clear selection and
Escape discard it. Backspace removes its last letter.

One roving tab stop per board. Arrows and Home/End move focus, Space selects the
focused letter, Enter submits, and Ctrl/Cmd+Z undoes a word. Label letters,
blockers, selection position and accepted words; use live status for outcomes.
Colours are reinforced with position/length numbers and word labels.

Capture primary pointers; use `touch-action: pinch-zoom` across the board to
reserve one-finger movement for tracing without removing zoom. Cancellation,
lost capture, a second pointer or release outside the active path restores the
pre-gesture trace, never submits it. No spring or gesture animation dependency:
feedback tracks input immediately. Use existing theme variables and focus rings;
keep reduced-motion and high-contrast support.

## Progress, time and results

Save accepted paths, unfinished trace and elapsed active time with a board
fingerprint. Validate restored paths against all current rules and the frozen
vocabulary; ignore malformed, stale or overlapping snapshots. Keep preview keys
separate from daily progress. Pause time while hidden or unmounted. Storage
failure must leave play usable and show a clear warning.

Undo removes the last submitted word (also after reload). Reset is one reversible
history action; the timer continues. Clear completed progress; repeated daily
solves preserve the first solve record. Reuse the existing SolvedPanel, stats and
clipboard fallback. Add a spoiler-only Word Paths solution share. Preview shares
say Preview and link to the selected preview board; preview solves never affect
daily stats/streaks. Daily stage integration remains behind publication gates.

## Preview and validation

Import the ten existing canonical conformance samples, without answer paths.
Select Board 1–10 through a query parameter so share links reopen the same one.
Link the preview from How to play. Keep its small rules summary beside the game.
Do not add it to Today, archive or the publisher.

Test pure rules, shared Python/TypeScript path fixtures, progress validation,
preview isolation, share text and accessible board markup. Run all existing
checks and archive replay. Inspect light/dark, a small viewport, pointer dragging,
keyboard solving, reload/Undo and storage behaviour through the browser. Real
phone touch/pinch testing is a release gate if unavailable in this environment.
