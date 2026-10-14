# Word Paths: English Wend-inspired game

Status: English confirmed; engine feasibility and the generator/file contract are implemented.
The release and interface design remains proposed. No daily publication or app
registration accompanies this milestone. ScaleDown is excluded.

## Outcome

Add an original daily word-discovery game to Queens, Star Battle and Train
Tracks. Retain the static site, deterministic Python engine, shared contracts,
browser-local progress and existing visual design. Working title: **Word Paths**.
Use original boards and vocabulary; LinkedIn's puzzles are reference material.

## Reference rules and editorial goals

LinkedIn's [official rules](https://www.linkedin.com/help/linkedin/answer/a6565995)
require orthogonally adjacent letters, every letter used once, and no overlapping
words. Blank answer rows disclose word lengths; dragging and releasing submits a
word. Its [constructor's design notes](https://www.linkedin.com/pulse/unwritten-rules-wend-our-word-discovery-game-linkedin-news-f0p8c)
explain blocked cells, usually distinct word lengths, recognizable vocabulary,
clear opening discoveries and avoiding misleading word paths. These are broader
content-quality goals, not consequences of a unique solution.

## Proposed first release

Publish one English 5×5 board per day. Four words have lengths 3, 4, 5 and 6:
18 letter cells and seven blocked cells. Show only the four lengths before
solving. These dimensions and lengths are our initial policy, not a claim about
LinkedIn's full range of boards.

A path spells a word in order, moving up, down, left or right. A cell cannot
repeat within a path or belong to two submitted words. Blocked cells cannot be
entered. Use each required length exactly once and every letter cell exactly
once to win. Submission order does not matter. Undo can remove a submitted word;
Reset clears progress. Tracing backwards is legal only when it independently
spells an accepted word.

Use a committed, reviewed English vocabulary for the pilot, restricted to A–Z
words of the supported lengths. Exclude proper names, acronyms and abbreviations;
choose familiar answers and avoid relying on obscure forms or simple plural
padding. Freeze the vocabulary with the generator version before publication.
This is a finite game vocabulary, not a claim to recognize all English words.

**Proposed acceptance policy:** accept any vocabulary word on a legal path that
fills an unused length, rather than secretly requiring the constructor's exact
path. A locally valid word can still lead to a dead end; players can undo it.
Do not label such a submission as proof that it belongs to the final solution.
This choice should be visible in How to play and differs from a checker that
accepts only predetermined answers.

## Solver and quality guarantees

Enumerate vocabulary paths, then count complete nonoverlapping covers satisfying
all lengths. Prove uniqueness against the entire pilot vocabulary, not only the
four words selected during construction. Count different submission orders as
one solution; count reversed palindrome paths once. Other distinct legal paths
remain distinct solutions even if they spell the same word.

One discovered cover is insufficient: finish the search or find a second cover.
Generation may use deterministic work budgets, including path enumeration;
exhaustion means inconclusive and rejects the candidate. Independent publication
verification must prove uniqueness. No smaller-board or weaker-vocabulary
fallback is allowed. Record generation timings and failure rates before adopting
a publishing recipe.

Review sample boards for familiar words, useful starting points, misleading
partial words and overly obvious disconnected word corridors. Mathematical
uniqueness does not establish enjoyable play or human difficulty.

The first construction probe found 95 of 100 unique boards had other legal
vocabulary paths. The measured pilot therefore caps those alternatives at two
(including other placements of answer words). It counts all relevant paths before
accepting a candidate. This is a provisional editorial heuristic, not a guarantee
that the broader English language has no misleading words.

## Integration

Give this genre its own grid and game state. Reuse geometry conventions and
register it through the existing rulebook, puzzle-family tables, schema, ID
conformance, routes, archive and stats. Proposed identity: `word-paths` with
`YYYY-MM-DD-words` IDs. Puzzle files contain letters, blockers and lengths, never
answer words or paths. The browser validates using the same frozen vocabulary;
the word list is public reference data, not a per-puzzle answer list.

Provide drag tracing, tap-based selection and keyboard traversal/submission.
Reserve board gestures for tracing while preserving pinch zoom. Reuse Auto/Light/
Dark appearance, timer, undo/reset, solve records and sharing. Save unfinished
paths and active time using the established progress conventions. Do not
generalize unrelated game state or introduce a framework for future games.

## Delivery sequence

1. **Engine feasibility PR:** vocabulary, path rules, exact cover counter,
   regression fixtures and a small deterministic construction probe. Keep the
   new family out of public daily scheduling and the app registry.
2. **Generator and file contract PR:** freeze the measured generation recipe,
   vocabulary and version; add parsers and shared fixtures; prove replay and
   uniqueness for a representative generated batch.
3. **Playable UI PR:** tracing, accessible controls, progress, results and a
   preview batch; verify small-phone layout and real touch input where available.
4. **Daily rollout PR:** choose activation, commit the initial verified batch and
   enable Today/archive/publication without rewriting existing puzzle files.

The first PR must distinguish zero, one and multiple covers; reject illegal
diagonals, blocked steps, reused cells and invalid length totals; detect a second
cover using unintended vocabulary words; and avoid counting word order or
palindrome reversal as ambiguity. Report reproducibility, timings and a human
review of sample boards. If the probe produces poor boards or impractical search,
revise the construction policy before integrating it into daily publication.

Defer multiple languages, board sizes, difficulty ratings, elaborate themes,
hints and account features. Existing game content and saved results must remain
unchanged throughout.


The [v1 contract](2026-10-14-word-paths-contract-design.md) freezes the measured
pilot recipe and finite vocabulary for replay. These are not a claim of editorial
approval; vocabulary changes needed by playtesting will receive a new version.
