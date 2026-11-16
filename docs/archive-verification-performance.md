# Archive verification worker comparison

Measured on November 16, 2026. Both configurations use the same verifier and all
906 published puzzles. Only the number of replay workers changes.

## Inputs and environment

- Verifier, archive, and dependency snapshot: `1e37486f11dbc36d0be3f5f62e8783caeba0ea73`.
- Local machine: Apple M5, 10 logical CPUs, macOS 27.0.1 arm64.
- Python: 3.13.15, with `uv sync --frozen`.
- CI: the existing public-repository `ubuntu-latest` runner, documented as having
  [four CPUs](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).

The local benchmark runs five alternating pairs of two and four workers. Python's
`time.perf_counter()` measures each complete verifier subprocess, including startup.
The benchmark rejects nonzero exits, incomplete verification, changes to the listed
inputs, or different stdout or stderr. Other CPU-heavy project checks run separately.

The input SHA-256 covers tracked files under `engine/src`, `engine/tools`, `schema`,
`conformance`, and `app/public/puzzles`, plus `engine/uv.lock`:
`7376058c273558a2dc6beb189843ceb400a02eb6301c3038e1b4495a26780a53`.
In `git ls-files` order, the hash includes each path, a NUL byte, and the raw SHA-256
digest of that file's contents.

A separate single-worker diagnostic verified the archive in 539.4 seconds, spending
531.1 seconds in regeneration through `verify_replay`. Sequential Nurikabe repeat
checks took 6.4 seconds. These diagnostic timings are outside the paired comparison.

## Local results

| Pair | Two workers, seconds | Four workers, seconds |
| --- | ---: | ---: |
| 1 | 297.9 | 215.2 |
| 2 | 341.7 | 257.9 |
| 3 | 356.1 | 263.4 |
| 4 | 360.8 | 267.0 |
| 5 | 342.4 | 236.1 |
| Median | 342.4 | 257.9 |
| Range | 297.9 to 360.8 | 215.2 to 267.0 |

Four workers reduce the local median wall time by 24.7%. The
median reduction of 84.5 seconds exceeds the observed range within either
configuration, meeting the acceptance criteria of at least 10% improvement beyond
timing variation. All samples are retained, including the faster initial runs.

All ten runs exit successfully, verify 906 puzzles, and produce identical stdout
with empty stderr. The stdout SHA-256 is
`2d34f51296ba3b65af87d6f489943db126db35fc0de72c29fed1a74cb2b567e4`.

## GitHub Actions sample

| Measurement | Two workers | Four workers |
| --- | ---: | ---: |
| Archive verification step | 556 s | 321 s |
| All CI checks, excluding deployment | 585 s | 361 s |

Sources: [two-worker run](https://github.com/tristrange/daily-puzzles/actions/runs/43819888608)
and [four-worker run](https://github.com/tristrange/daily-puzzles/actions/runs/43903636991).
Both use the same verifier and puzzle inputs. These are single runs on different
runner VMs, not median or p95 estimates. The local Mac timings do not predict Linux
runner timings.

## Reproduction command

Use the snapshot above and run from `engine/`. Keep the inputs fixed throughout the
comparison. This command runs the full archive ten times and fails if results differ.

```sh
uv sync --frozen
uv run python - <<'PY'
import hashlib
import subprocess
import time

baseline = None
for pair in range(1, 6):
    for workers in (2, 4):
        started = time.perf_counter()
        result = subprocess.run(
            ["uv", "run", "python", "-m", "tools.verify", "--dir",
             "../app/public/puzzles", "--jobs", str(workers)],
            capture_output=True,
            check=True,
        )
        elapsed = time.perf_counter() - started
        assert result.stdout.endswith(b"\n906 puzzles verified.\n")
        digest = tuple(
            hashlib.sha256(data).hexdigest() for data in (result.stdout, result.stderr)
        )
        if baseline is None:
            baseline = digest
        assert digest == baseline
        print(f"pair={pair} workers={workers} seconds={elapsed:.3f}", flush=True)
PY
```
