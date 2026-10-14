# Word Paths File Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Freeze replayable Word Paths v1 and agree on its file contract in Python and TypeScript.
**Architecture:** Extend the existing puzzle envelope, rulebook, schema and ID registry. Keep the genre unpublished; share vocabulary source and fixture expectations.
**Tech Stack:** Existing Python 3.13, pytest, jsonschema, TypeScript, Vitest, Ajv/Vite; no new dependencies.
**Spec:** `docs/superpowers/specs/2026-10-14-word-paths-contract-design.md`

## Global Constraints

- `word-paths`, `-words`, generatorVersion 1; unpublished in engine and app.
- Frozen vocabulary SHA-256 e054967cc550e50a1f0d245fab7e18979870922f0c41e2d4cc7ff2010d93f0ce.
- Version 1: 5×5, lengths 3,4,5,6, max 50 attempts/250000 states/two extra paths.
- No public puzzle files, answers in puzzle JSON, difficulty, new dependencies or existing archive changes.

## Review Focus

- Unknown recipe versions must fail rather than replay through the latest recipe.
- Shared grid parsing must reject wrong letters, totals, lengths and foreign fields.
- A direct unpublished URL must never instantiate a marks game.
- Vocabulary edits must fail digest and replay tests; the browser consumes exactly the same words.
- Existing daily slots and published puzzle bytes must remain unchanged.

### Task 1: Engine contract, schema and frozen recipe

**Files:** `engine/src/queens_engine/{board,rulebook,word_paths,word_paths_gen}.py`, vocabulary data, `schema/puzzle.schema.json`, `conformance/{id-cases,word-paths}/`, `engine/tests/test_word_paths_contract.py`.
**Interfaces:** Consumes WordGrid, generate_grid, pilot_vocabulary. Produces WordPathRulebook through rulebook_for(PuzzleType.WORD_PATHS); existing parse_puzzle/dumps_puzzle/verify_replay operate on WordGrid.

- [x] Write tests asserting v1 roundtrip/replay, unpublished/rating/hints facts, digest, no answers, rejected marks options, invalid version and wrong board, ten shared samples and invalid mutations, and 100 seeds against the independent reference solver.
- [x] Run `.venv/bin/pytest tests/test_word_paths_contract.py -q`; expect missing Word Paths contract failures.
- [x] Freeze vocabulary file; register enum/rulebook and widen board union; extend schema and ID manifest, generate pattern. Write ten canonical fixtures with shared expected fields and mutation errors.
- [x] Run focused contract, word-engine, rulebook and conformance tests; expect all pass.
- [x] Commit `Freeze Word Paths generation and puzzle file contract`.

### Task 2: Browser grid and shared contract

**Files:** `app/src/domain/{wordPaths,wordPaths.test,puzzle,board,games}.ts`, registry consumers, `app/src/components/PuzzleView.tsx`, `app/src/pages/HomePage.tsx`, related tests.
**Interfaces:** Consumes Task 1's schema, vocabulary source and conformance manifest. Produces immutable WordGrid and WORD_PATHS_VOCABULARY, parsed through parsePuzzle; unpublished metadata and safe direct-route fallback.

- [x] Write shared fixture/mutation and frozen vocabulary tests plus unpublished daily-slot/route regression assertions.
- [x] Run `npm test -- src/domain/wordPaths.test.ts`; expect missing WordGrid/parser failures.
- [x] Implement WordGrid invariants, same-source word-list import and parser; complete registry metadata. Adjust consumers to keep words out of marks stages and current daily slots.
- [x] Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`; expect all pass.
- [x] Commit `Parse Word Paths files in the browser without publishing them`.

### Task 3: Compatibility verification and contributor documentation

**Files:** `engine/README.md`, `docs/puzzle-model.md`, `conformance/README.md`, `docs/journal.md`, this plan.
**Interfaces:** Consumes both complete implementations and shared fixtures.

- [x] Document generation/verification examples using a temporary output directory, frozen vocabulary policy and human release gates.
- [x] Run full Python tests, pyright, ruff lint/format, tools.verify against all published puzzles, tools.schema_ids --check; expect success. Compare app/public/puzzles to origin/main; expect no diff.
- [x] Run CLI generation and verification on temporary Word Paths files; expect canonical replay success and no answer data.
- [x] Commit `Document verified Word Paths contract and replay policy`.
- [ ] Obtain one fresh whole-branch review, resolve important findings with regression proof, open and attach a focused PR, wait for checks, leave merging to maintainer.
