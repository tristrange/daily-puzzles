"""Certify twelve frozen advanced Trio exercises and their short rule witnesses."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Literal, TypedDict, cast

import jsonschema

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from queens_engine.trio import (
    COUNT_PER_SYMBOL,
    LINES,
    SIDE,
    WINDOWS,
    Relation,
    Rule,
    TrioGrid,
    deduce,
    solve,
)

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "app/src/data/trio-lessons.json"
REPORT = ROOT / "docs/measurements/trio-lessons.json"
TECHNIQUES = ("quota-no-three", "relation-propagation", "candidate-chains")
BITS = (1, 2, 4)
EXERCISES = 4
MIN_CHAIN = 3
MAX_WITNESS = 5
MIN_VARIATION = 2
MIN_CONSTRAINTS = 2
PAIR = 2


class Edge(TypedDict):
    first: int
    second: int
    kind: Literal["same", "different"]


class Geometry(TypedDict):
    givens: list[int]
    relations: list[Edge]


class Goal(TypedDict):
    line: int
    remove: int


class Restriction(TypedDict):
    cell: int
    remove: int
    rule: Rule
    group: list[int]


class Example(TypedDict):
    cell: int
    witness: list[Restriction]


class Exercise(TypedDict):
    id: str
    source: str
    board: Geometry
    prefix: int
    goal: Goal
    examples: list[Example]


class Technique(TypedDict):
    id: str
    title: str
    stage: str
    introduction: str
    exercises: list[Exercise]


def object_schema(properties: dict[str, object]) -> dict[str, object]:
    return {
        "type": "object",
        "properties": properties,
        "required": list(properties),
        "additionalProperties": False,
    }


CELL = {"type": "integer", "minimum": 0, "maximum": 80}
TEXT = {"type": "string", "minLength": 1}
EDGE = object_schema({"first": CELL, "second": CELL, "kind": {"enum": ["same", "different"]}})
ACTION = object_schema(
    {
        "cell": CELL,
        "remove": {"type": "integer", "minimum": 1, "maximum": 6},
        "rule": {"enum": ["row-count", "column-count", "no-three", "same", "different"]},
        "group": {
            "type": "array",
            "items": CELL,
            "minItems": 2,
            "maxItems": 9,
            "uniqueItems": True,
        },
    }
)
EXAMPLE = object_schema(
    {
        "cell": CELL,
        "witness": {"type": "array", "items": ACTION, "minItems": 2, "maxItems": MAX_WITNESS},
    }
)
BOARD = object_schema(
    {
        "givens": {
            "type": "array",
            "items": {"type": "integer", "minimum": 0, "maximum": 3},
            "minItems": 81,
            "maxItems": 81,
        },
        "relations": {"type": "array", "items": EDGE},
    }
)
EXERCISE = object_schema(
    {
        "id": TEXT,
        "source": {"type": "string", "pattern": r"^\d{4}-\d{2}-\d{2}-trio$"},
        "board": BOARD,
        "prefix": {"type": "integer", "minimum": 0},
        "goal": object_schema(
            {
                "line": {"type": "integer", "minimum": 0, "maximum": 17},
                "remove": {"enum": [1, 2, 3]},
            }
        ),
        "examples": {"type": "array", "items": EXAMPLE, "minItems": 1, "maxItems": 9},
    }
)
SCHEMA = {
    "type": "array",
    "items": object_schema(
        {
            "id": TEXT,
            "title": TEXT,
            "stage": TEXT,
            "introduction": TEXT,
            "exercises": {
                "type": "array",
                "items": EXERCISE,
                "minItems": EXERCISES,
                "maxItems": EXERCISES,
            },
        }
    ),
}


def geometry(raw: Geometry) -> TrioGrid:
    return TrioGrid(
        tuple(raw["givens"]),
        tuple(Relation(edge["first"], edge["second"], edge["kind"]) for edge in raw["relations"]),
    )


def rule_options(
    masks: Sequence[int], grid: TrioGrid, action: Restriction
) -> list[tuple[int, list[tuple[int, int]]]]:
    cell, group, rule = action["cell"], tuple(action["group"]), action["rule"]
    if cell not in group:
        return []
    if rule in ("row-count", "column-count"):
        options: list[tuple[int, list[tuple[int, int]]]] = []
        for bit in BITS if group in (LINES[:SIDE] if rule == "row-count" else LINES[SIDE:]) else ():
            fixed = [c for c in group if masks[c] == bit]
            possible = [c for c in group if masks[c] & bit]
            if len(fixed) == COUNT_PER_SYMBOL:
                options.append((7 ^ bit, [(c, b) for c in fixed for b in BITS if b != bit]))
            if len(possible) == COUNT_PER_SYMBOL and cell in possible:
                options.append((bit, [(c, bit) for c in group if c not in possible]))
        return options
    if rule == "no-three":
        return [
            (7 ^ bit, [(c, b) for c in group if c != cell for b in BITS if b != bit])
            for bit in BITS
            if group in WINDOWS and all(masks[c] == bit for c in group if c != cell)
        ]
    edge = next(
        (
            edge
            for edge in grid.relations
            if (edge.first, edge.second) == group and edge.kind == rule
        ),
        None,
    )
    if edge is None:
        return []
    other = group[1] if cell == group[0] else group[0]
    if rule == "same":
        return [(masks[other], [(other, bit) for bit in BITS if not masks[other] & bit])]
    return (
        [(7 ^ masks[other], [(other, bit) for bit in BITS if bit != masks[other]])]
        if masks[other].bit_count() == 1
        else []
    )


def allows(masks: Sequence[int], grid: TrioGrid, action: Restriction) -> bool:
    return any(not action["remove"] & allowed for allowed, _ in rule_options(masks, grid, action))


def direct_removal(masks: Sequence[int], grid: TrioGrid, cell: int, bit: int) -> bool:
    for index, line in enumerate(LINES):
        if cell in line and allows(
            masks,
            grid,
            Restriction(
                cell=cell,
                remove=bit,
                rule="row-count" if index < SIDE else "column-count",
                group=list(line),
            ),
        ):
            return True
    for window in WINDOWS:
        if cell in window and allows(
            masks, grid, Restriction(cell=cell, remove=bit, rule="no-three", group=list(window))
        ):
            return True
    return any(
        cell in (edge.first, edge.second)
        and allows(
            masks,
            grid,
            Restriction(cell=cell, remove=bit, rule=edge.kind, group=[edge.first, edge.second]),
        )
        for edge in grid.relations
    )


def check_causality(
    grid: TrioGrid, prepared: Sequence[int], actions: list[Restriction], target: int, bit: int
) -> None:
    for omitted in range(len(actions) - 1):
        alternate = list(prepared)
        for index, action in enumerate(actions):
            if index != omitted and allows(alternate, grid, action):
                alternate[action["cell"]] &= ~action["remove"]
        if not alternate[target] & bit:
            raise ValueError("witness contains a restriction unnecessary for its conclusion")


def check_witness(
    grid: TrioGrid, prepared: Sequence[int], goal: Goal, example: Example, technique: str
) -> list[int]:
    target, bit = example["cell"], 1 << (goal["remove"] - 1)
    actions = example["witness"]
    masks = list(prepared)
    for action in actions:
        cell, removed = action["cell"], action["remove"]
        if masks[cell] & removed != removed or not allows(masks, grid, action):
            raise ValueError("witness restriction is not justified by its current premises")
        effect = masks[cell]
        for allowed, _ in rule_options(masks, grid, action):
            effect &= allowed
        if effect != masks[cell] & ~removed:
            raise ValueError("witness must show the full restriction of its stated rule")
        masks[cell] = effect
        if not masks[cell]:
            raise ValueError("witness removes every candidate")
    if masks[target] & bit or actions[-1]["cell"] != target or not actions[-1]["remove"] & bit:
        raise ValueError("witness must end at the named exclusion")
    check_causality(grid, prepared, actions, target, bit)
    rules = {action["rule"] for action in actions}
    if technique == "quota-no-three" and not (
        "no-three" in rules
        and rules & {"row-count", "column-count"}
        and not rules & {"same", "different"}
    ):
        raise ValueError("quota/run witness must combine both rules causally")
    if technique == "relation-propagation" and actions[-1]["rule"] not in ("same", "different"):
        raise ValueError("relation witness must carry a newly derived restriction through a link")
    response = prepared[target] & ~bit
    if masks[target] != response:
        raise ValueError("the final rule must leave exactly the requested remaining candidates")
    if technique == "candidate-chains" and (
        len(actions) < MIN_CHAIN
        or len({(action["rule"], tuple(action["group"])) for action in actions}) < MIN_CONSTRAINTS
        or response.bit_count() != PAIR
    ):
        raise ValueError("candidate chain must have three necessary restrictions and leave a pair")
    return masks


def read_catalog(data: Path) -> list[Technique]:
    raw: object = json.loads(data.read_text())
    jsonschema.validate(raw, SCHEMA)
    catalog = cast(list[Technique], raw)
    if [item["id"] for item in catalog] != list(TECHNIQUES):
        raise ValueError("catalog must preserve the three ordered techniques")
    sources: set[str] = set()
    boards: set[str] = set()
    for technique in catalog:
        for index, exercise in enumerate(technique["exercises"]):
            suffix = "" if index == 0 else f"-{index + 1}"
            if exercise["id"] != f"trio-{technique['id']}{suffix}":
                raise ValueError("exercise IDs must preserve course order")
            board = json.dumps(exercise["board"], sort_keys=True)
            if exercise["source"] in sources or board in boards:
                raise ValueError("exercises require twelve distinct sources and boards")
            sources.add(exercise["source"])
            boards.add(board)
        if (
            len({exercise["goal"]["line"] < SIDE for exercise in technique["exercises"]})
            < MIN_VARIATION
            or len({exercise["goal"]["remove"] for exercise in technique["exercises"]})
            < MIN_VARIATION
        ):
            raise ValueError("each technique must vary orientation and removed symbols")
    links = {
        action["rule"]
        for exercise in catalog[1]["exercises"]
        for example in exercise["examples"]
        for action in example["witness"]
    }
    if not {"same", "different"} <= links:
        raise ValueError("relation exercises must include both link kinds")
    return catalog


def certify(exercise: Exercise, technique: str, max_attempts: int) -> dict[str, object]:
    source_path = ROOT / "app/public/puzzles" / f"{exercise['source']}.json"
    source = json.loads(source_path.read_text())
    if source["board"] != {"size": 9, **exercise["board"]}:
        raise ValueError("lesson geometry differs from its committed source")
    grid = geometry(exercise["board"])
    exact = solve(grid, max_attempts=max_attempts)
    if len(exact.solutions) != 1:
        raise ValueError("lesson source must have exactly one solution")
    logic = deduce(grid)
    prefix = exercise["prefix"]
    if prefix >= len(logic.steps):
        raise ValueError("prepared prefix is outside the source trace")
    masks = [1 << (value - 1) if value else 7 for value in grid.givens]
    for step in logic.steps[:prefix]:
        if masks[step.cell] != step.before:
            raise ValueError("source trace before-mask mismatch")
        masks[step.cell] = step.after
    goal = exercise["goal"]
    bit = 1 << (goal["remove"] - 1)
    eligible = [
        cell for cell in LINES[goal["line"]] if masks[cell].bit_count() > 1 and masks[cell] & bit
    ]
    expected = [cell for cell in eligible if not logic.candidates[cell] & bit]
    if not expected or [example["cell"] for example in exercise["examples"]] != expected:
        raise ValueError("accepted answers must include every supported exclusion in the scope")
    if any(direct_removal(masks, grid, cell, bit) for cell in eligible):
        raise ValueError("exercise permits a one-rule shortcut")
    examples: list[dict[str, object]] = []
    for example in exercise["examples"]:
        after = check_witness(grid, masks, goal, example, technique)
        if any(
            not after[cell] & (1 << (value - 1)) for cell, value in enumerate(exact.solutions[0])
        ):
            raise ValueError("witness contradicts the independently verified solution")
        examples.append(
            {
                "cell": example["cell"],
                "after": masks[example["cell"]] & ~bit,
                "witness": example["witness"],
            }
        )
    return {
        "id": exercise["id"],
        "source": exercise["source"],
        "source_sha256": hashlib.sha256(source_path.read_bytes()).hexdigest(),
        "prefix": prefix,
        "candidates": masks,
        "goal": goal,
        "examples": examples,
        "unique_solution": list(exact.solutions[0]),
        "search_attempts": exact.line_attempts,
    }


def verify(
    data: Path = DATA,
    report: Path = REPORT,
    *,
    write_report: bool = False,
    max_attempts: int = 100_000,
) -> None:
    catalog = read_catalog(data)
    certificates = [
        certify(exercise, technique["id"], max_attempts)
        for technique in catalog
        for exercise in technique["exercises"]
    ]
    if len({tuple(cast(list[int], item["candidates"])) for item in certificates}) != len(
        certificates
    ):
        raise ValueError("prepared positions must be distinct")
    document = {
        "purpose": (
            "Frozen Trio lesson positions, complete scoped answers and semantic witnesses. "
            "Solutions are review-only."
        ),
        "lessons": certificates,
    }
    if not write_report:
        if json.loads(report.read_text()) != document:
            raise ValueError("lesson certificates differ from frozen content")
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
    verify(write_report=args.write_report)
    print("Verified twelve advanced Trio exercises and every scoped answer")


if __name__ == "__main__":
    main()
