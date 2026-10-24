"""Certify the committed Learn givens without regenerating or searching for boards."""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, TypedDict, cast

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from queens_engine.sudoku import ALL, UNITS, Level, SudokuGrid, solve
from queens_engine.sudoku_deduce import Step, next_step, single

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "app/src/data/sudoku-lessons.json"
REPORT = ROOT / "docs/measurements/sudoku-lessons.json"
MAX_NODES = 200_000
PAIR, TRIPLE = 2, 3


@dataclass(frozen=True)
class Recipe:
    id: str
    seed: int
    level: Level
    rule: str
    support: Literal["group", "retained", "removed"]


RECIPES = (
    Recipe("locked-candidates", 42218, "medium", "locked-candidate", "removed"),
    Recipe("pairs", 42068, "medium", "naked-pair", "group"),
    Recipe("hidden-pairs", 52336, "medium", "hidden-pair", "retained"),
    Recipe("naked-triples", 52384, "hard", "naked-triple", "group"),
    Recipe("x-wing", 43763, "hard", "x-wing", "removed"),
)


class StepCertificate(TypedDict):
    cell: int
    before: int
    after: int
    rule: str
    group: list[int]
    dependencies: list[int]


class Certificate(TypedDict):
    id: str
    seed: int
    level: Level
    unique_solution: list[int]
    search_nodes: int
    trace_index: int
    step: StepCertificate
    candidates: list[int]
    support: list[int]


def check_witness(step: Step, masks: list[int], support: list[int]) -> None:
    if step.rule == "hidden-pair":
        reserved = step.after
        places = [cell for cell in step.group if masks[cell] & reserved]
        if (
            step.group not in UNITS
            or reserved.bit_count() != PAIR
            or len(places) != PAIR
            or support != places
            or step.cell not in support
            or any(masks[cell] & reserved != reserved for cell in support)
        ):
            raise ValueError("hidden pair must reserve both digits in exactly two unit cells")
    if step.rule == "naked-triple":
        union = 0
        for cell in support:
            union |= masks[cell]
        if (
            len(set(support)) != TRIPLE
            or support != list(step.group)
            or step.cell in support
            or not any({*support, step.cell} <= set(unit) for unit in UNITS)
            or union.bit_count() != TRIPLE
            or len({masks[cell] for cell in support}) < PAIR
            or any(not 1 < masks[cell].bit_count() <= TRIPLE for cell in support)
            or step.after != step.before & ~union
            or step.after.bit_count() < PAIR
        ):
            raise ValueError("naked triple must reserve three digits in three visible unit cells")


def certify(givens: list[int], recipe: Recipe, *, max_nodes: int) -> Certificate:
    exact = solve(SudokuGrid(tuple(givens), recipe.level), max_nodes=max_nodes)
    if len(exact.solutions) != 1:
        raise ValueError(f"{recipe.id} must have exactly one solution")
    solution = exact.solutions[0]
    masks = [1 << (value - 1) if value else ALL for value in givens]
    latest = [-1] * 81
    trace_index = 0
    while step := next_step(tuple(masks), recipe.level):
        if (
            not step.after
            or step.after == step.before
            or step.after & step.before != step.after
            or not step.after & (1 << (solution[step.cell] - 1))
        ):
            raise ValueError(f"{recipe.id} has an invalid restriction")
        dependencies = sorted({latest[cell] for cell in (*step.group, step.cell)} - {-1})
        if step.rule == recipe.rule:
            relevant = step.after if recipe.support == "retained" else step.before & ~step.after
            support = [
                cell for cell in step.group if recipe.support == "group" or masks[cell] & relevant
            ]
            if any(single(masks[cell]) for cell in support):
                raise ValueError("pattern cells must have visible notes")
            check_witness(step, masks, support)
            return Certificate(
                id=recipe.id,
                seed=recipe.seed,
                level=recipe.level,
                unique_solution=list(solution),
                search_nodes=exact.nodes,
                trace_index=trace_index,
                step=StepCertificate(
                    cell=step.cell,
                    before=step.before,
                    after=step.after,
                    rule=step.rule,
                    group=list(step.group),
                    dependencies=dependencies,
                ),
                candidates=masks,
                support=support,
            )
        latest[step.cell] = trace_index
        masks[step.cell] = step.after
        trace_index += 1
    raise ValueError(f"missing teaching deduction: {recipe.id}")


def verify(
    data: Path, report: Path, *, write_report: bool = False, max_nodes: int = MAX_NODES
) -> None:
    positions = cast(dict[str, list[int]], json.loads(data.read_text()))
    if set(positions) != {recipe.id for recipe in RECIPES}:
        raise ValueError("lesson givens must match the five-lesson catalog")
    certificates = [
        certify(positions[recipe.id], recipe, max_nodes=max_nodes) for recipe in RECIPES
    ]
    document = {
        "purpose": (
            "Independent Python certificates for five original lesson positions; "
            "solutions are review-only data."
        ),
        "lessons": certificates,
        "recipe": (
            "Replay committed givens to the first named technique. "
            "Seeds record original generator provenance only. "
            "Verify with tools/sudoku_lessons.py; use --write-report to refresh certificates."
        ),
    }
    if not write_report:
        if json.loads(report.read_text()) != document:
            raise ValueError(
                "lesson certificates differ from committed givens and deduction replay"
            )
        return
    formatted = json.dumps(document, indent=2)
    formatted = re.sub(
        r"\[\n\s+(\d+(?:,\n\s+\d+)*)\n\s+\]",
        lambda match: "[" + re.sub(r",\n\s+", ", ", match[1]) + "]",
        formatted,
    )
    report.write_text(formatted + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write-report", action="store_true")
    args = parser.parse_args()
    verify(DATA, REPORT, write_report=args.write_report)
    print("Verified five Sudoku lessons against exact solutions and deterministic deductions")


if __name__ == "__main__":
    main()
