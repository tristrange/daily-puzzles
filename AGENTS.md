# Repository Guidelines

## Project structure

- `app/src/` contains React components, pages, rules, and storage. `app/public/` holds assets and puzzle JSON.
- `engine/src/queens_engine/` contains Python generators and solvers. Tests live in `engine/tests/`; publishing tools live in `engine/tools/`.
- `schema/` and `conformance/` contain shared formats and fixtures. `backend/leaderboard/` contains the optional leaderboard. Guides live in `docs/`.

## Development and verification

Use Node.js 22.12+ and, for engine work, Python 3.13+ and `uv`.

- From `app/`, run `npm ci` and `npm run dev` to start the site. Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` for app checks.
- From `engine/`, run `uv sync --frozen`, then `uv run pytest -q -m 'not generator_sweep'`, `uv run pyright`, `uv run ruff check .`, and `uv run ruff format --check .`.
- For changes to the engine, schema, or published puzzles, also run `uv run python -m tools.verify --dir ../app/public/puzzles --jobs 2` and `uv run python -m tools.schema_ids --check` from `engine/`.

Run checks relevant to the change. Frontend-only and documentation-only PRs can skip engine jobs; pushes to `main` run them. See `README.md` for details.

## Style and tests

TypeScript uses two-space indentation, single quotes, and PascalCase components. Python uses four-space indentation and snake_case; Ruff enforces a 100-character line limit.

App tests use Vitest and live beside code as `*.test.ts` or `*.test.tsx`. Engine tests use pytest and Hypothesis in `engine/tests/test_*.py`. Add focused behavior tests and update shared fixtures when the app and engine must agree. No coverage threshold is configured.

## Puzzle data and secrets

Preserve published puzzles and IDs, saved progress, leaderboard results, and offline behavior. Never commit Supabase service-role keys or Turnstile secrets, or expose them through `VITE_` variables. See `docs/leaderboard-setup.md`.

## Commits and pull requests

Use concise, imperative commit subjects. History includes plain subjects and prefixes such as `fix:` and `feat:`. Use branch names such as `feat/new-game` or `fix/mobile-input`.

In PRs, explain the change and verification, link relevant issues, and include screenshots for visual changes. Note new dependencies, configuration requirements, and checks that could not run.

Use a PR for product or design decisions, behavior changes, and puzzle publishing. Wait for checks and let the maintainer review and merge. Never merge those PRs yourself.

Commit directly to `main` for uncontroversial, low-risk changes such as documentation, CI configuration, dependency bumps, or one-line fixes. Verify locally, keep the commit focused, and report what was pushed. When unsure, use a PR.
