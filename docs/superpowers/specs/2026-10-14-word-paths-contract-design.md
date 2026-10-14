# Word Paths generator and file contract

## Outcome and scope

Continue the merged engine prototype with replayable files that Python and the
browser parse identically. Reuse the existing puzzle envelope, rulebook and shared
schema. This milestone does not publish Word Paths or add a playing screen.
Keep all old puzzle bytes, daily slots, saved progress and appearance unchanged.

## Contract

Register `word-paths`, suffix `-words`, unpublished on both sides. Files contain
`id`, `type`, `seed`, `generatorVersion: 1`, and `board` with `width`, `height`,
row-major `letters` (A–Z or null blocker), and `wordLengths`. No difficulty,
answer words, solution paths or extra board fields are accepted. Require a real
canonical day and a matching Word Paths suffix. The grid supports dimensions
1–7, distinct integer lengths 3–6, and exactly as many open letters as the sum
of lengths. File parsing checks structure and these invariants, not solvability.
Version 1 generation is specifically 5×5 with lengths 3,4,5,6.

## Frozen generation and vocabulary

Version 1 binds the measured 748-word Codex-authored pilot vocabulary and recipe:
SplitMix64, self-avoiding 18-cell route, sorted word pools, 50 attempts, 250,000
work states, full-vocabulary uniqueness and at most two other candidate paths.
Freeze that list as `word-paths-en-v1.txt`, preserving its semantic SHA-256
`e054967cc550e50a1f0d245fab7e18979870922f0c41e2d4cc7ff2010d93f0ce`.
The browser imports that same source as public reference data. No dictionary
service, dependency or per-puzzle answers are needed. Unknown versions and
marks-only generation options fail explicitly. A future word-list/recipe change
needs a new replay version; version 1 remains available.

Freezing this finite game vocabulary is a reproducibility choice, not a claim of
complete English coverage or editorial approval. Human vocabulary review and
playtesting remain release gates. If they require additions, introduce version 2
before publication rather than altering version 1 silently.

## Integration and proof

Add a Word Paths rulebook for generation, parsing, serialization, geometry,
rendering and solving. Reuse `tools.generate` and `tools.verify`. No rated band,
ramp, hint engine or daily publication. The app registers metadata and parsing,
but a direct Word Paths URL reports that its playing screen is not ready; it
must never fall through to the marks game.

Commit ten representative canonical files under `conformance/word-paths/`, never
`app/public/puzzles`. Both languages assert their boards and invalid mutations
against one manifest. Python additionally replays every sample, independently
checks its unique cover, and verifies a 100-seed representative batch. Tests pin
vocabulary bytes/digest, serialization without answers, failure bounds, unknown
versions and compatibility. Run both complete suites, type/lint/build gates,
archive replay and schema-ID generation checks before opening the PR.
