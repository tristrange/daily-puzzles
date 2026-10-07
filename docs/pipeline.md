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

**The deploy waits for the other two jobs.** `needs: [engine, app]` means the puzzle
verification has to pass before anything is published, so a malformed puzzle file can be
committed to `main` without a site going out that serves it. That is the reason the job
lives in `ci.yml` rather than in a workflow of its own: it reuses the verification instead
of repeating it.

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
tools and two workflows do it.

```sh
cd engine
uv run python -m tools.publish --out ../app/public/puzzles   # fill the gap to lead days ahead
uv run python -m tools.verify --dir ../app/public/puzzles    # replay every committed puzzle
```

`tools/publish.py` scans the archive for missing puzzles and fills them from the first
missing day through today plus a `--lead` (default 3). It writes **two puzzles per day**:
the Queens board named after the day, and its Star Battle companion named
`<date>-star.json`. Both use a seed hashed from the id, size 8, but they are gated
differently, because they can promise different things. Queens walks the seed upward
until `deduce` reaches a solution without guessing, exactly as
`tools/generate --logic-only` does. A star board is not gated: `deduce` does run on a
two-star board, but a two-star board almost never reaches a finish by rules alone — 92%
offer an opening deduction and 0.1% complete, measured over 1000 generated 8x8 boards.
Gating on it would reject essentially every board, so the companion takes the guarantee
the generator actually provides — a unique solution — and says "unique, not logic-gated"
rather than printing a difficulty number that would mean something weaker than the same
number on a Queens board.

Skipping is per puzzle rather than per day, which is what makes this safe to run against
an archive published before companions existed: a committed Queens board does not stop
its missing companion from being filled in.

It is idempotent by construction: an existing file is never rewritten and an id always
maps to one puzzle, so running it twice in a day is a no-op and a missed week self-heals
on the next run. `tools/verify.py`
re-parses every committed puzzle and calls `verify_replay` on it, so a generator change
that would have drifted the archive fails loudly before anything is merged.

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
