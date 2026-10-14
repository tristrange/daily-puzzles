"""Measure the English word-path pilot; reports contain answers for review only.

Run: python -m tools.benchmark_word_paths --count 100 --out /tmp/word-paths.json
Budgets bound construction; a fresh unbounded check verifies every returned board.
No files are published and no other puzzle family is registered or changed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import sys
from dataclasses import asdict, dataclass
from itertools import islice
from pathlib import Path
from statistics import median
from time import perf_counter

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from queens_engine.word_paths import (
    SearchBudget,
    WordGrid,
    WordPath,
    WordSearchLimitError,
    iter_solutions,
    pilot_vocabulary,
    vocabulary_paths,
)
from queens_engine.word_paths_gen import MAX_EXTRA_PATHS, WordGenerationError, generate_grid


@dataclass(frozen=True)
class Result:
    seed: int
    outcome: str
    states: int
    generation_seconds: float
    validation_seconds: float = 0
    grid: WordGrid | None = None
    answers: tuple[WordPath, ...] = ()
    candidate_path_count: int = 0
    other_path_count: int = 0
    other_words: tuple[str, ...] = ()
    detail: str = ""


def obeys(grid: WordGrid, answers: tuple[WordPath, ...], vocabulary: tuple[str, ...]) -> bool:
    """Check letters, adjacency and complete coverage without solver helpers."""
    if sorted(len(path.cells) for path in answers) != sorted(grid.word_lengths):
        return False
    used: set[int] = set()
    for path in answers:
        letters: list[str] = []
        for index, cell in enumerate(path.cells):
            if type(cell) is not int or not 0 <= cell < grid.cell_count or cell in used:
                return False
            letter = grid.letters[cell]
            if letter is None:
                return False
            if index:
                row, col = divmod(cell, grid.width)
                prev_row, prev_col = divmod(path.cells[index - 1], grid.width)
                if abs(row - prev_row) + abs(col - prev_col) != 1:
                    return False
            used.add(cell)
            letters.append(letter)
        if "".join(letters) != path.word or path.word not in vocabulary:
            return False
    return used == {cell for cell, letter in enumerate(grid.letters) if letter is not None}


def worker(seed: int, vocabulary: tuple[str, ...], max_states: int, max_attempts: int) -> Result:
    budget = SearchBudget(max_states)
    started = perf_counter()
    try:
        grid = generate_grid(
            seed=seed, vocabulary=vocabulary, budget=budget, max_attempts=max_attempts
        )
    except (WordGenerationError, WordSearchLimitError) as error:
        return Result(
            seed,
            "incomplete" if isinstance(error, WordSearchLimitError) else "generation-error",
            budget.spent,
            perf_counter() - started,
            detail=str(error),
        )
    generation_seconds = perf_counter() - started
    checked = perf_counter()
    covers = list(islice(iter_solutions(grid, vocabulary), 2))
    if len(covers) != 1 or not obeys(grid, covers[0], vocabulary):
        return Result(
            seed,
            "validation-error",
            budget.spent,
            generation_seconds,
            perf_counter() - checked,
            grid,
            detail="invalid or nonunique returned board",
        )
    paths = vocabulary_paths(grid, vocabulary)
    extras = tuple(path for path in paths if path not in covers[0])
    if len(extras) > MAX_EXTRA_PATHS:
        return Result(
            seed,
            "validation-error",
            budget.spent,
            generation_seconds,
            perf_counter() - checked,
            grid,
            detail="too many alternative word paths",
        )
    target_words = {path.word for path in covers[0]}
    return Result(
        seed,
        "ok",
        budget.spent,
        generation_seconds,
        perf_counter() - checked,
        grid,
        covers[0],
        len(paths),
        len(extras),
        tuple(sorted({path.word for path in extras} - target_words)),
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--count", type=int, default=100)
    parser.add_argument("--max-states", type=int, default=250_000)
    parser.add_argument("--max-attempts", type=int, default=50)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)
    if args.count <= 0 or args.max_states < 0 or args.max_attempts <= 0:
        parser.error("count/attempts must be positive and max-states must be nonnegative")
    vocabulary = pilot_vocabulary()
    results: list[Result] = []
    report: dict[str, object] = {
        "status": "experimental; not approved for daily publication",
        "platform": platform.platform(),
        "python": platform.python_version(),
        "max_states": args.max_states,
        "max_attempts": args.max_attempts,
        "max_extra_paths": MAX_EXTRA_PATHS,
        "vocabulary_sha256": hashlib.sha256("\n".join(vocabulary).encode()).hexdigest(),
        "vocabulary_counts": {
            str(n): sum(len(word) == n for word in vocabulary) for n in (3, 4, 5, 6)
        },
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    for seed in range(args.count):
        results.append(worker(seed, vocabulary, args.max_states, args.max_attempts))
        successes = [row for row in results if row.outcome == "ok"]
        report.update(
            {
                "attempted": len(results),
                "successes": len(successes),
                "failed_seeds": [row.seed for row in results if row.outcome != "ok"],
                "median_generation_seconds": median(row.generation_seconds for row in successes)
                if successes
                else None,
                "max_generation_seconds": max(
                    (row.generation_seconds for row in successes), default=None
                ),
                "results": [asdict(row) for row in results],
            }
        )
        args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"{report['successes']}/{report['attempted']} verified pilot boards; {args.out}")
    return 0 if all(row.outcome == "ok" for row in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
