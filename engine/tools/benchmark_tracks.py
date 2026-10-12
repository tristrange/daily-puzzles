"""Probe Train Tracks sizes before enabling daily publication.

Usage: python -m tools.benchmark_tracks --out /tmp/tracks-probe.json
Defaults: sizes 8/10/12, seeds 0..99, ten seconds per worker. The deadline
includes independent validation; generation timings exclude validation and startup.
Timeouts are measurement outcomes, never part of the deterministic generator.
The JSON file is updated after each seed, preserving completed work on interruption.
"""

from __future__ import annotations

import argparse
import json
import math
import platform
import subprocess
import sys
from dataclasses import asdict, dataclass
from itertools import islice
from pathlib import Path
from statistics import median
from time import perf_counter
from typing import cast

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from queens_engine.tracks import PIECE_ENDS, TrackGrid, iter_solutions
from queens_engine.tracks_gen import TrackGenerationError, generate_grid

SIZES = (8, 10, 12)
COMPLETION_RATE = 0.95
LINE_ENDS = 2


@dataclass(frozen=True)
class Result:
    size: int
    seed: int
    outcome: str
    generation_seconds: float | None = None
    given_count: int | None = None
    detail: str = ""


def obeys(grid: TrackGrid, assignment: tuple[int, ...]) -> bool:
    """Check rules directly, without the search's running counts or union-find."""
    if len(assignment) != grid.cell_count or any(
        p not in range(len(PIECE_ENDS)) for p in assignment
    ):
        return False
    if any(given and assignment[cell] != given for cell, given in enumerate(grid.givens)):
        return False
    rows, cols = [0] * grid.height, [0] * grid.width
    ends = 0
    on = {cell for cell, piece in enumerate(assignment) if piece}
    for cell in on:
        row, col = divmod(cell, grid.width)
        rows[row] += 1
        cols[col] += 1
        for direction in PIECE_ENDS[assignment[cell]]:
            other = grid.neighbour(cell, direction)
            if other is None:
                ends += 1
            elif (direction + 2) % 4 not in PIECE_ENDS[assignment[other]]:
                return False
    if ends != LINE_ENDS or tuple(rows) != grid.row_clues or tuple(cols) != grid.col_clues:
        return False
    if not on:
        return False
    seen: set[int] = set()
    stack = [next(iter(on))]
    while stack:
        cell = stack.pop()
        if cell in seen:
            continue
        seen.add(cell)
        for direction in PIECE_ENDS[assignment[cell]]:
            other = grid.neighbour(cell, direction)
            if other is not None and other not in seen:
                stack.append(other)
    return seen == on


def validate(grid: TrackGrid) -> bool:
    answers = list(islice(iter_solutions(grid), 2))
    if len(answers) != 1 or not obeys(grid, answers[0]):
        return False
    if not all(clue >= 1 for clue in (*grid.row_clues, *grid.col_clues)):
        return False
    for cell, piece in enumerate(grid.givens):
        for direction in PIECE_ENDS[piece]:
            other = grid.neighbour(cell, direction)
            if other is not None and (direction + 2) % 4 in PIECE_ENDS[grid.givens[other]]:
                return False
    return True


def worker(size: int, seed: int) -> Result:
    start = perf_counter()
    try:
        grid = generate_grid(seed=seed, width=size, height=size, generator_version=3)
    except TrackGenerationError as error:
        return Result(size, seed, "generation-error", perf_counter() - start, detail=str(error))
    seconds = perf_counter() - start
    givens = sum(bool(piece) for piece in grid.givens)
    if not validate(grid):
        return Result(size, seed, "validation-error", seconds, givens, "invalid or nonunique board")
    return Result(size, seed, "ok", seconds, givens)


def run_seed(size: int, seed: int, timeout: float) -> Result:
    try:
        child = subprocess.run(
            [sys.executable, "-m", "tools.benchmark_tracks", "--worker", str(size), str(seed)],
            cwd=Path(__file__).resolve().parents[1],
            text=True,
            capture_output=True,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return Result(size, seed, "timeout")
    if child.returncode != 0:
        return Result(size, seed, "validation-error", detail=child.stderr[-1000:])
    try:
        raw = cast(dict[str, object], json.loads(child.stdout))
        result = Result(
            size,
            seed,
            str(raw["outcome"]),
            cast(float | None, raw["generation_seconds"]),
            cast(int | None, raw["given_count"]),
            str(raw["detail"]),
        )
        if result.outcome not in ("ok", "generation-error", "validation-error"):
            raise ValueError("unknown worker outcome")
    except (ValueError, KeyError, TypeError) as error:
        return Result(size, seed, "validation-error", detail=f"invalid worker response: {error}")
    return result


def summarize(rows: list[Result]) -> dict[str, object]:
    good = [row for row in rows if row.outcome == "ok"]
    times = [row.generation_seconds for row in good if row.generation_seconds is not None]
    givens = [row.given_count for row in good if row.given_count is not None]
    fraction = len(good) / len(rows) if rows else 0
    return {
        "size": rows[0].size if rows else None,
        "attempted": len(rows),
        "successes": len(good),
        "success_fraction": fraction,
        "median_seconds": median(times) if times else None,
        "max_seconds": max(times) if times else None,
        "given_range": [min(givens), max(givens)] if givens else None,
        "failed_seeds": [row.seed for row in rows if row.outcome != "ok"],
        "passed": fraction >= COMPLETION_RATE
        and not any(row.outcome == "validation-error" for row in rows),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sizes", type=int, nargs="+", choices=SIZES, default=list(SIZES))
    parser.add_argument("--count", type=int, default=100)
    parser.add_argument("--start-seed", type=int, default=0)
    parser.add_argument("--timeout", type=float, default=10)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--worker", type=int, nargs=2, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    if args.worker:
        print(json.dumps(asdict(worker(*args.worker))))
        return 0
    if args.count <= 0 or not math.isfinite(args.timeout) or args.timeout <= 0:
        parser.error("count and timeout must be positive and finite")
    if args.start_seed < 0 or args.start_seed + args.count > 2**32:
        parser.error("seed range must fit unsigned 32-bit integers")
    results: list[Result] = []

    def save() -> None:
        if args.out:
            report = {
                "runtime": f"{platform.platform()} / Python {platform.python_version()}",
                "timeout_seconds": args.timeout,
                "results": [asdict(row) for row in results],
                "summaries": [
                    summarize([row for row in results if row.size == size]) for size in args.sizes
                ],
            }
            args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    try:
        for size in args.sizes:
            for seed in range(args.start_seed, args.start_seed + args.count):
                results.append(run_seed(size, seed, args.timeout))
                save()
            print(json.dumps(summarize([row for row in results if row.size == size])), flush=True)
    except KeyboardInterrupt:
        save()
        return 130
    return int(
        any(not summarize([r for r in results if r.size == s])["passed"] for s in args.sizes)
    )


if __name__ == "__main__":
    raise SystemExit(main())
