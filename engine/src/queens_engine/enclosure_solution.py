"""Certified, board-bound Horse Enclosure solution witnesses."""

from __future__ import annotations

import json
import re
from typing import Any, TypedDict, cast

from .enclosure import EnclosureGrid, evaluate
from .enclosure_solver import OptimalResult, solve_optimal


class Solution(TypedDict):
    version: int
    id: str
    board: str
    walls: list[int]


def fingerprint(grid: EnclosureGrid) -> str:
    return json.dumps(
        [grid.size, grid.water, grid.horse, grid.wall_budget, grid.optimal_score],
        separators=(",", ":"),
    )


def validate_solution(value: object, puzzle_id: str, grid: EnclosureGrid) -> None:
    if not isinstance(value, dict):
        raise ValueError(f"invalid solution for {puzzle_id}")
    value = cast(dict[str, Any], value)
    if (
        not re.fullmatch(r"\d{4}-\d{2}-\d{2}-enclosure", puzzle_id)
        or set(value) != {"version", "id", "board", "walls"}
        or type(value["version"]) is not int
        or value["version"] != 1
        or value["id"] != puzzle_id
        or value["board"] != fingerprint(grid)
        or not isinstance(value["walls"], list)
        or grid.optimal_score is None
    ):
        raise ValueError(f"invalid solution for {puzzle_id}")
    result = evaluate(grid, cast(list[int], value["walls"]))
    if result.escaped or result.score != grid.optimal_score:
        raise ValueError(f"non-optimal solution for {puzzle_id}")


def make_solution(puzzle_id: str, grid: EnclosureGrid) -> Solution:
    result = solve_optimal(grid)
    if (
        not isinstance(result, OptimalResult)
        or result.score != result.best_bound
        or result.score != grid.optimal_score
    ):
        raise ValueError(f"optimum not certified for {puzzle_id}")
    solution: Solution = {
        "version": 1,
        "id": puzzle_id,
        "board": fingerprint(grid),
        "walls": list(result.walls),
    }
    validate_solution(solution, puzzle_id, grid)
    return solution
