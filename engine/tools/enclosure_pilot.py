"""Collect reproducible enclosure quality diagnostics and elapsed generation time."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from dataclasses import asdict
from pathlib import Path
from time import monotonic

from queens_engine.enclosure import EnclosureGrid
from queens_engine.enclosure_gen import EnclosureGenerationError, generate_with_report
from queens_engine.enclosure_solver import EnclosureSolverTimeoutError


def _snapshot(grid: EnclosureGrid) -> str:
    water = set(grid.water)
    return "\n".join(
        "".join(
            "H" if cell == grid.horse else "~" if cell in water else "."
            for cell in range(row * grid.size, (row + 1) * grid.size)
        )
        for row in range(grid.size)
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seeds", type=int, default=200)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)
    if args.seeds < 1:
        parser.error("--seeds must be positive")
    started = monotonic()
    boards: list[dict[str, object]] = []
    errors: list[dict[str, object]] = []
    rejections: Counter[str] = Counter()
    for seed in range(args.seeds):
        try:
            grid, report = generate_with_report(seed)
        except EnclosureGenerationError as exc:
            rejections.update(exc.rejections)
            errors.append({"seed": seed, "error": str(exc)})
            continue
        except EnclosureSolverTimeoutError as exc:
            errors.append({"seed": seed, "error": str(exc), "aborted": True})
            break
        rejections.update(report.rejections)
        boards.append(
            {
                "seed": seed,
                "score": grid.optimal_score,
                "budget": grid.wall_budget,
                "snapshot": _snapshot(grid),
                **asdict(report),
            }
        )
    result = {
        "requested_seeds": args.seeds,
        "successes": len(boards),
        "errors": errors,
        "rejections": dict(sorted(rejections.items())),
        "elapsed_seconds": monotonic() - started,
        "boards": boards,
    }
    output = json.dumps(result, indent=2) + "\n"
    if args.output:
        args.output.write_text(output, encoding="utf-8")
    else:
        print(output, end="")
    return int(bool(errors))


if __name__ == "__main__":
    raise SystemExit(main())
