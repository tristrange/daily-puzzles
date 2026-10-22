# The daily pipeline

How a puzzle gets from a seed to a served board, and how the repository keeps that honest.
The pipeline is milestone M8 in the [journal](journal.md#milestones).

## Deployment

The site is published to GitHub Pages by the `deploy` job in `ci.yml`, on every push to
`main`, at:

```
https://<user>.github.io/daily-puzzles/
```

Three things about that arrangement are worth knowing.

**The deploy waits for both gates.** `needs: [engine, app]` means the puzzle
verification has to pass before anything is published, so a malformed puzzle file can be
committed to `main` without a site going out that serves it. That is the reason the job
lives in `ci.yml` rather than in a workflow of its own: it reuses the verification instead
of repeating it.

The engine's `tests` and `archive` matrix jobs run on separate runners in parallel.
The first runs pytest (excluding `generator_sweep`), pyright and ruff; the second
replays the full archive and checks the schema ID pattern. Both must succeed for
the stable `engine` gate to pass. Failure, cancellation, unexpected skips or routing
failure cannot produce a green gate. Known frontend-only PRs skip both legs and
the gate, as before; main and publisher dispatches always require both checks.

Word Paths checks ten evenly spaced generation seeds (0, 10, …, 90) against an
independent solver on each engine run. The other ninety carry the
`generator_sweep` pytest marker. `engine-sweep.yml` checks all 100 every Monday at
04:43 UTC and can also be started manually in Actions. That wider sample does
not block deployment; every committed puzzle still passes the unchanged archive
uniqueness and replay gate. Plain `uv run pytest -q` includes all seeds locally.

Publisher window tests keep real Queens generation on small boards and load
committed companions to check scheduling, restart and file-writing behavior.
Separate generation, seed-retry and replay tests keep using the real engines.
No production generator or validation budget is reduced.

**The daily publisher has to ask for the deploy explicitly.** This is the one part of the
arrangement that is counter-intuitive. A commit made with the default `GITHUB_TOKEN`
raises no workflow event at all, by design — GitHub suppresses it so a workflow cannot
re-trigger itself. So the `git push` in `publish.yml` publishes the puzzle and, on its
own, would never verify it or deploy it: the site would go stale every night while the
repository carried on looking perfectly healthy.

So after a successful push the publisher dispatches `ci.yml` on `main`, which needs
`actions: write` and a `workflow_dispatch` trigger to be allowed. It dispatches the whole
workflow rather than a deploy-only one, so the nightly puzzle gets the same engine
verification a human push does — a gap that was there before Pages existed, because those
commits were never running CI either.

**The build knows it is served from a sub-path.** A Pages *project* site lives at
`/<repo>/`, not at the domain root, so the deploy step sets `BASE_PATH` and
`app/vite.config.ts` reads it. Every asset URL and the app's own puzzle fetches derive from
it, which is the same `BASE_URL` the share link reads — see
[Share text](app.md#share-text). A
local `npm run build` with no `BASE_PATH` still builds for the root, so nothing about
local development changes.

**No SPA rewrite is needed.** The app routes on the hash, so the server only ever sees a
request for `/daily-puzzles/`; the route lives in the fragment. Every link the app emits
therefore survives being pasted anywhere, and there is no 404 page to keep in step with the
routes. The `gh-pages` branch and Jekyll are absent too: `actions/deploy-pages` serves the
uploaded artifact directly.

If the repository is renamed, the deploy follows automatically — `BASE_PATH` is derived
from `github.event.repository.name` rather than written down. A repository that should be
served from the domain root instead (a `<user>.github.io` repository) would need that one
line changed.

## The daily pipeline


M8 closes the loop the samples were propping open: the archive publishes itself. Two
tools and three workflows do it.

```sh
cd engine
uv run python -m tools.publish --out ../app/public/puzzles   # fill the gap to lead days ahead
uv run python -m tools.publish --out ../app/public/puzzles --check  # fail if a required slot is missing
uv run python -m tools.verify --dir ../app/public/puzzles --jobs 2  # replay every committed puzzle
```

`tools/publish.py` scans the archive for missing puzzles and fills them from the first
missing day through today plus a `--lead` (default 3). Each rulebook owns its daily
slots. The shared ID manifest pins each family's activation and variants. From
October 21, 2026 a complete day carries **eleven puzzles**: Queens, Star Battle,
Small 8x8, Medium 10x10 and Large 12x12 Train Tracks, Word Paths, Trio, Tents,
and Easy, Medium and Hard 9x9 Sudoku. Earlier days retain their original required
slots; named variants stay in one puzzle family.
Already committed legacy boards (including October 14–16) remain archive extras.
The archive probes their original IDs as well as the current daily slots; the
chooser and publisher use only the required slots.

Each slot starts with a seed hashed from its full ID. Queens follows its weekday's
ramp and logic-only gate; Star Battle retains its unique-solution and nearby-layout
checks. Train Tracks uses generator version 3's deterministic search budgets and
proves uniqueness without claiming a difficulty rating. A failed off-ramp seed is
bumped at most 32 times; failure never substitutes a smaller board or drops a slot.

Sudoku slots carry `-sudoku-easy`, `-sudoku-medium` and `-sudoku-hard` suffixes.
The board's level must match its ID. Its versioned generator accepts only a unique
solution completed by the requested techniques; Medium and Hard must stall under
the preceding level. A failed search never substitutes an easier level. Committed
files contain givens only, and full archive verification replays their seed and
checks the same guarantees. Preview boards and progress stay separate.

Skipping is per puzzle rather than per day, which is what makes this safe to run against
an archive published before companions existed: a committed Queens board does not stop
its missing companion or size variant from being filled in. A partial run resumes
at the earliest incomplete day and writes only missing slots. A new board is written
to a temporary sibling ignored by the slot scan, then renamed into place after the
write completes; an interrupted write cannot masquerade as a published file.

It is idempotent by construction: an existing file is never rewritten and an id always
maps to one puzzle, so running it twice in a day is a no-op and a missed week self-heals
on the next run. `tools/verify.py`
re-parses every committed puzzle, checks that its envelope ID matches its filename,
and calls `verify_replay` on it, so a generator change
that would have drifted the archive fails loudly before anything is merged.

CI and daily publishing use two replay workers. Each file still receives the full
parse, identity, replay, ramp and canonical-byte checks. Results are consumed in
filename order, so the Star Battle repeat window and diagnostics stay deterministic.
Omit `--jobs` for serial verification, or set it to the worker count available locally.

Verify also checks each Queens file against the ramp for its weekday, and treats a break
as a **failure** rather than a remark: a missing band from `RAMP_START` onwards, a board
of the wrong size, or a band above the target all exit non-zero. Falling *short* of the
target passes, because the search reports that honestly and publishes the hardest board
it found. Files dated before `RAMP_START` are skipped — they were published when every
board was 8x8 with no band recorded, so their size is history rather than a claim — and
so is every Star Battle companion, which is not on the ramp until the deduction engine
can rate a star board.

The workflows live in [`.github/workflows/`](../.github/workflows):

- `ci.yml` runs on every pull request and push to `main`: the shared-engine gates
  (pytest, pyright, ruff) plus `tools.verify` over the committed puzzles, and the app
  gates (vitest, typecheck, oxlint, build).
- `publish.yml` runs from a daily cron (and by hand via `workflow_dispatch`): generators
  and verifies the missing dates, then commits and pushes only when the diff is non-empty,
  so the archive and `git log` tell the whole publishing story.
- `monitor-publish.yml` runs a few hours after the publisher and checks `main` with
  `tools.publish --check`: every required slot from the archive's fixed first day through
  the lead horizon must already be committed. It is deliberately separate from `publish.yml`, because a publisher that
  fails before its push leaves the committed archive short while its local working tree
  looks fine. A missing slot fails the scheduled run, which is the alert.
