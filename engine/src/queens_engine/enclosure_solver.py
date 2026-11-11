"""Exact budgeted vertex enclosure optimization; never mistake a witness for a proof."""

from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from typing import Literal

from ortools.sat.python import cp_model

from .enclosure import EnclosureGrid, evaluate, neighbours


class EnclosureSolverTimeoutError(RuntimeError):
    """The safety wall-clock limit interrupted deterministic search. Abort this run."""


@dataclass(frozen=True)
class OptimalResult:
    score: int
    walls: tuple[int, ...]
    best_bound: int
    deterministic_time: float
    branches: int
    status: Literal["optimal"] = "optimal"


@dataclass(frozen=True)
class InfeasibleResult:
    status: Literal["infeasible"] = "infeasible"


@dataclass(frozen=True)
class InconclusiveResult:
    deterministic_time: float
    status: Literal["inconclusive"] = "inconclusive"


def solve_optimal(
    grid: EnclosureGrid,
    *,
    max_deterministic_time: float = 5.0,
    max_time_seconds: float = 60.0,
) -> OptimalResult | InfeasibleResult | InconclusiveResult:
    """Prove the largest horse-connected region under a cell-wall budget.

    Closure makes every neighbour of an inside cell inside or a wall. A unit of
    flow from the horse to every other inside cell rules out disconnected prizes.
    Thus the chosen inside cells are exactly the horse's reachable component.
    """
    if (
        not isfinite(max_deterministic_time)
        or max_deterministic_time < 0
        or not isfinite(max_time_seconds)
        or max_time_seconds <= 0
    ):
        raise ValueError("search limits must be finite; work >= 0 and time > 0")
    if max_deterministic_time == 0:
        return InconclusiveResult(0)

    model, land, wall = _model(grid)

    solver = cp_model.CpSolver()
    solver.parameters.num_workers = 1
    solver.parameters.random_seed = 0
    solver.parameters.max_deterministic_time = max_deterministic_time
    solver.parameters.max_time_in_seconds = max_time_seconds
    solver.parameters.absolute_gap_limit = 0
    solver.parameters.relative_gap_limit = 0
    status = solver.solve(model)
    work = solver.response_proto.deterministic_time
    if status == cp_model.MODEL_INVALID:
        raise ValueError(f"invalid enclosure optimization model: {model.validate()}")
    if status == cp_model.INFEASIBLE:
        return InfeasibleResult()
    if status != cp_model.OPTIMAL:
        if work + 1e-6 < max_deterministic_time:
            raise EnclosureSolverTimeoutError(
                "safety time limit interrupted exact enclosure search"
            )
        return InconclusiveResult(work)

    score = round(solver.objective_value)
    best_bound = round(solver.best_objective_bound)
    walls = tuple(cell for cell in land if solver.boolean_value(wall[cell]))
    checked = evaluate(grid, walls)
    if checked.escaped or checked.score != score or best_bound != score:
        raise RuntimeError("exact enclosure witness or bound failed independent evaluation")
    return OptimalResult(score, walls, best_bound, work, solver.num_branches)


def _model(
    grid: EnclosureGrid,
) -> tuple[cp_model.CpModel, tuple[int, ...], dict[int, cp_model.IntVar]]:
    water = set(grid.water)
    land = tuple(cell for cell in range(grid.cell_count) if cell not in water)
    adjacent = {
        cell: tuple(other for other in neighbours(grid.size, cell) if other not in water)
        for cell in land
    }
    model = cp_model.CpModel()
    inside = {cell: model.new_bool_var(f"inside_{cell}") for cell in land}
    wall = {cell: model.new_bool_var(f"wall_{cell}") for cell in land}
    model.add(inside[grid.horse] == 1)
    model.add(wall[grid.horse] == 0)
    model.add(sum(wall.values()) <= grid.wall_budget)
    for cell in land:
        model.add(inside[cell] + wall[cell] <= 1)
        row, col = divmod(cell, grid.size)
        if row in (0, grid.size - 1) or col in (0, grid.size - 1):
            model.add(inside[cell] == 0)
        for other in adjacent[cell]:
            model.add(inside[cell] <= inside[other] + wall[other])
        # Removing a wall that touches no inside cell cannot change the enclosure.
        model.add(wall[cell] <= sum(inside[other] for other in adjacent[cell]))

    capacity = len(land) - 1
    flow = {
        (cell, other): model.new_int_var(0, capacity, f"flow_{cell}_{other}")
        for cell in land
        for other in adjacent[cell]
    }
    for (cell, other), variable in flow.items():
        model.add(variable <= capacity * inside[cell])
        model.add(variable <= capacity * inside[other])
    for cell in land:
        incoming = sum(flow[other, cell] for other in adjacent[cell])
        outgoing = sum(flow[cell, other] for other in adjacent[cell])
        if cell == grid.horse:
            model.add(outgoing - incoming == sum(inside.values()) - 1)
        else:
            model.add(incoming - outgoing == inside[cell])
    model.maximize(sum(inside.values()))

    return model, land, wall
