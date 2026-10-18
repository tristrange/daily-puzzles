"""Measure the unpublished Trio pilot; samples include answers for review only.

Run: python -m tools.trio_probe --count 20 --out ../docs/measurements/trio-pilot.json
Large sample batches and counterexample checks stay out of the routine test suite.
"""

from __future__ import annotations

import argparse
import json
import platform
from collections import Counter
from dataclasses import asdict
from pathlib import Path
from time import perf_counter

from queens_engine.trio import TrioGrid, deduce, is_solution, solve
from queens_engine.trio_gen import TrioGenerationError, generate

SAMPLE_COUNT = 5


def check_trace(grid: TrioGrid) -> int:
    """Independently seek a counterexample for every recorded candidate elimination."""
    result = deduce(grid)
    if not result.solved or not is_solution(grid, result.cells):
        raise AssertionError("deduction trace did not finish a valid board")
    candidates = [1 << (v - 1) if v else 7 for v in grid.givens]
    checked = 0
    for step in result.steps:
        if (
            step.before != candidates[step.cell]
            or not step.after
            or step.after == step.before
            or step.after & step.before != step.after
        ):
            raise AssertionError("trace does not replay its candidate restrictions")
        for symbol in (1, 2, 3):
            bit = 1 << (symbol - 1)
            if step.before & bit and not step.after & bit:
                givens = list(grid.givens)
                givens[step.cell] = symbol
                if solve(TrioGrid(tuple(givens), grid.relations)).solutions:
                    raise AssertionError("a deduction removed a symbol from a valid completion")
                checked += 1
        candidates[step.cell] = step.after
    if tuple(candidates) != result.candidates:
        raise AssertionError("trace final candidates do not match")
    return checked


def probe(count: int) -> dict[str, object]:
    if count < 1:
        raise ValueError("count must be positive")
    records: list[dict[str, object]] = []
    samples: list[dict[str, object]] = []
    failures: list[dict[str, object]] = []
    for seed in range(count):
        started = perf_counter()
        try:
            grid = generate(seed)
        except TrioGenerationError as error:
            failures.append({"seed": seed, "error": str(error)})
            continue
        elapsed = perf_counter() - started
        logic = deduce(grid)
        exact = solve(grid)
        if exact.solutions != (logic.cells,) or not is_solution(grid, logic.cells):
            raise AssertionError("independent verification disagrees with deductions")
        records.append(
            {
                "seed": seed,
                "generation_seconds": round(elapsed, 6),
                "givens": sum(bool(v) for v in grid.givens),
                "relations": dict(Counter(edge.kind for edge in grid.relations)),
                "deductions": dict(Counter(step.rule for step in logic.steps)),
                "exact_search_line_attempts": exact.line_attempts,
            }
        )
        if len(samples) < SAMPLE_COUNT:
            samples.append(
                {
                    "seed": seed,
                    "givens": grid.givens,
                    "relations": [asdict(edge) for edge in grid.relations],
                    "solution": logic.cells,
                    "trace": [
                        f"{step.rule}: cell {step.cell} {step.before:03b}->{step.after:03b}; "
                        f"group {','.join(str(cell) for cell in step.group)}"
                        for step in logic.steps
                    ],
                    "counterexamples_rejected": check_trace(grid),
                }
            )
    return {
        "purpose": "Unpublished feasibility probe; answers and traces are review data",
        "recipe": "provisional: 9x9, 3 symbols, 24 initial relations, direct deductions",
        "python": platform.python_version(),
        "requested": count,
        "succeeded": len(records),
        "failures": failures,
        "records": records,
        "samples": samples,
        "limitations": (
            "No human difficulty rating or playtesting; not registered for daily publication"
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--count", type=int, default=20)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if args.count < 1:
        parser.error("--count must be positive")
    report = probe(args.count)
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"{report['succeeded']}/{report['requested']} boards verified; report: {args.out}")
    return 1 if report["failures"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
