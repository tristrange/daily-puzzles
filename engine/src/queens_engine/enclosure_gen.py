"""Deterministic, bounded generation of exactly certified enclosure boards."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, replace

from .enclosure import EnclosureGrid, evaluate, neighbours
from .enclosure_solver import InconclusiveResult, OptimalResult, solve_optimal
from .prng import Prng

GENERATOR_VERSION = 1
SIDE = 8
MAX_ATTEMPTS = 64
MIN_SCORE = 8
BOTTLENECK_DEGREE = 2


class EnclosureGenerationError(RuntimeError):
    def __init__(self, rejections: dict[str, int]) -> None:
        self.rejections = rejections
        super().__init__(f"no certified enclosure after {MAX_ATTEMPTS} attempts: {rejections}")


@dataclass(frozen=True)
class GenerationReport:
    attempts: int
    rejections: dict[str, int]
    best_bound: int
    greedy_score: int
    greedy_gap: int
    alternative_scores: tuple[int, ...]
    plateau: int
    water_cells: int
    water_components: int
    bottlenecks: int
    deterministic_time: float
    branches: int


def canonical_layout(grid: EnclosureGrid) -> tuple[int, ...]:
    """Return a symmetry-independent representation, including the wall budget."""

    def transform(cell: int, flip: bool, turns: int) -> int:
        row, col = divmod(cell, grid.size)
        if flip:
            col = grid.size - 1 - col
        for _ in range(turns):
            row, col = col, grid.size - 1 - row
        return row * grid.size + col

    variants: list[tuple[int, ...]] = []
    for flip in (False, True):
        for turns in range(4):
            water = sorted(transform(c, flip, turns) for c in grid.water)
            variants.append(
                (grid.size, grid.wall_budget, transform(grid.horse, flip, turns), *water)
            )
    return min(variants)


def _candidate(rng: Prng) -> EnclosureGrid:
    horse = (2 + rng.below(4)) * SIDE + 2 + rng.below(4)
    water: set[int] = set()
    # Several short channels create contiguous obstacles rather than independent noise.
    for _ in range(3 + rng.below(3)):
        cell = rng.below(SIDE * SIDE)
        for _ in range(4 + rng.below(6)):
            if cell != horse:
                water.add(cell)
            adjacent = neighbours(SIDE, cell)
            cell = adjacent[rng.below(len(adjacent))]
    return EnclosureGrid(SIDE, tuple(sorted(water)), horse, 6 + rng.below(5))


def _frontier(grid: EnclosureGrid, region: set[int]) -> set[int]:
    water = set(grid.water)
    return {
        n for c in region for n in neighbours(grid.size, c) if n not in region and n not in water
    }


def _greedy(grid: EnclosureGrid) -> tuple[int, tuple[int, ...], int]:
    region = {grid.horse}
    scores: list[int] = []
    plateau = 0
    while True:
        frontier = _frontier(grid, region)
        if len(frontier) <= grid.wall_budget:
            result = evaluate(grid, tuple(sorted(frontier)))
            if not result.escaped:
                scores.append(result.score)
        choices: list[tuple[int, int]] = []
        for cell in sorted(frontier):
            row, col = divmod(cell, grid.size)
            if row in (0, grid.size - 1) or col in (0, grid.size - 1):
                continue
            expanded = region | {cell}
            new_frontier = _frontier(grid, expanded)
            if len(new_frontier) <= grid.wall_budget:
                choices.append((len(new_frontier), cell))
        if not choices:
            break
        best = min(choices)[0]
        plateau += sum(cost == best for cost, _ in choices) - 1
        region.add(min(choices)[1])
    return max(scores, default=0), tuple(sorted(set(scores))), plateau


def _structure(grid: EnclosureGrid) -> tuple[int, int]:
    remaining = set(grid.water)
    components = 0
    while remaining:
        components += 1
        stack = [remaining.pop()]
        while stack:
            for cell in neighbours(grid.size, stack.pop()):
                if cell in remaining:
                    remaining.remove(cell)
                    stack.append(cell)
    water = set(grid.water)
    bottlenecks = sum(
        len([n for n in neighbours(grid.size, c) if n not in water]) <= BOTTLENECK_DEGREE
        for c in range(grid.cell_count)
        if c not in water
    )
    return components, bottlenecks


def generate(seed: int) -> EnclosureGrid:
    return generate_with_report(seed)[0]


def generate_with_report(seed: int) -> tuple[EnclosureGrid, GenerationReport]:
    if type(seed) is not int or not 0 <= seed < 2**32:
        raise ValueError("seed must be an unsigned 32-bit integer")
    rng = Prng(seed)
    rejected: Counter[str] = Counter()
    for attempt in range(1, MAX_ATTEMPTS + 1):
        grid = _candidate(rng)
        if not evaluate(grid, ()).escaped:
            rejected["initially_enclosed"] += 1
            continue
        result = solve_optimal(grid)
        if isinstance(result, InconclusiveResult):
            rejected["inconclusive"] += 1
            continue
        if not isinstance(result, OptimalResult):
            rejected["infeasible"] += 1
            continue
        if result.score < MIN_SCORE:
            rejected["score_below_8"] += 1
            continue
        greedy, scores, plateau = _greedy(grid)
        components, bottlenecks = _structure(grid)
        report = GenerationReport(
            attempt,
            dict(sorted(rejected.items())),
            result.best_bound,
            greedy,
            result.score - greedy,
            scores,
            plateau,
            len(grid.water),
            components,
            bottlenecks,
            result.deterministic_time,
            result.branches,
        )
        return replace(grid, optimal_score=result.score), report
    raise EnclosureGenerationError(dict(sorted(rejected.items())))
