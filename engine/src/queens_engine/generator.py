"""Seeded puzzle generation with a uniqueness gate.

A board is generated in three stages, all driven by one deterministic PRNG:

1. A random queens solution is placed by backtracking over rows with random
   column order.
2. Regions grow outward from their queens, one cell at a time, from a random
   frontier. Each region keeps its queen and stays 4-connected by construction,
   and every cell is eventually claimed because the frontier is connected.
3. The exact solver is the uniqueness gate: boards with more than one solution
   are discarded and the PRNG moves on. Because every stage is a pure function
   of the seed, the same seed always produces the same board.

If no unique board appears within the attempt budget, `GenerationError` is
raised rather than silently shipping a puzzle with a second solution.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from .board import Board, PuzzleType
from .prng import Prng
from .puzzle import Puzzle
from .solver import has_unique_solution

DEFAULT_SIZE: Final[int] = 8
MIN_GENERATABLE_SIZE: Final[int] = 5
MAX_GENERATABLE_SIZE: Final[int] = 9
MAX_SEED: Final[int] = 0xFFFFFFFF

# Attempts to allow before giving up, per size. Uniqueness is a rare accident
# of region arrangement (see the M3 note in README), so bigger grids need
# progressively more tries; 9 is deliberately slow but achievable.
DEFAULT_ATTEMPTS: Final[dict[int, int]] = {
    5: 200,
    6: 1_000,
    7: 4_000,
    8: 20_000,
    9: 60_000,
}


class GenerationError(ValueError):
    """Generation did not find a unique board within the attempt budget."""


@dataclass(frozen=True, slots=True)
class GenerationConfig:
    """Knobs for generation. `size` relates to capacity; see board.py."""

    size: int = DEFAULT_SIZE
    max_attempts: int | None = None


def generate_puzzle(*, seed: int, puzzle_id: str, config: GenerationConfig | None = None) -> Puzzle:
    """Generate a unique-solution Queen's puzzle from `seed`.

    `seed` must fit the schema's 0..2^32-1 range so it can be stored in a
    puzzle file and replayed later.
    """
    if not 0 <= seed <= MAX_SEED:
        raise GenerationError(f"seed {seed} outside [0, 2**32-1]")
    cfg = config or GenerationConfig()
    if not MIN_GENERATABLE_SIZE <= cfg.size <= MAX_GENERATABLE_SIZE:
        raise GenerationError(
            f"size {cfg.size} outside [{MIN_GENERATABLE_SIZE}, {MAX_GENERATABLE_SIZE}]"
        )
    max_attempts = cfg.max_attempts or DEFAULT_ATTEMPTS[cfg.size]

    rng = Prng(seed)
    for _ in range(max_attempts):
        solution = _place_queens(cfg.size, rng)
        if solution is None:
            continue
        regions = _grow_regions(cfg.size, solution, rng)
        board = Board(
            size=cfg.size,
            regions=regions,
            region_capacity=(1,) * cfg.size,
            puzzle_type=PuzzleType.QUEENS,
        )
        if has_unique_solution(board):
            return Puzzle(
                id=puzzle_id,
                puzzle_type=PuzzleType.QUEENS,
                size=cfg.size,
                seed=seed,
                generator_version=1,
                board=board,
            )

    raise GenerationError(f"no unique board found for seed {seed} in {max_attempts} attempts")


def verify_replay(puzzle: Puzzle) -> Puzzle:
    """Regenerate `puzzle` from its seed and confirm the board is identical.

    This is the CI check in the daily pipeline: a puzzle file is trustworthy
    only if the committed regions are exactly what the seed produces.
    """
    regenerated = generate_puzzle(
        seed=puzzle.seed,
        puzzle_id=puzzle.id,
        config=GenerationConfig(size=puzzle.size),
    )
    if regenerated.board != puzzle.board:
        raise GenerationError(
            f"replay mismatch for {puzzle.id}: seed {puzzle.seed} produced a different board"
        )
    return regenerated


def _place_queens(size: int, rng: Prng) -> list[int] | None:
    """One random solution: `result[row]` is the column of that row's queen.

    Main-diagonal (`col - row`) and anti-diagonal (`col + row`) invariants are
    kept in separate sets: a value from one can equal a value from the other
    for cells that do not actually attack, so a shared set would reject valid
    placements.
    """
    columns: list[int | None] = [None] * size

    def find(row: int, main: set[int], anti: set[int]) -> bool:
        if row == size:
            return True
        for col in rng.shuffled(range(size)):
            if col in columns or (col - row) in main or (col + row) in anti:
                continue
            columns[row] = col
            main.add(col - row)
            anti.add(col + row)
            if find(row + 1, main, anti):
                return True
            main.discard(col - row)
            anti.discard(col + row)
        columns[row] = None
        return False

    if not find(0, set(), set()):
        return None
    result: list[int] = []
    for row in range(size):
        col = columns[row]
        assert col is not None, f"row {row} assigned when backtracking returned"
        result.append(col)
    return result


def _grow_regions(size: int, solution: list[int], rng: Prng) -> tuple[int, ...]:
    """Flood-fill the grid, growing every region from its queen's cell.

    Cells are claimed one at a time from a random frontier; a claimed cell adds
    its unclaimed neighbours to the frontier, so growth cannot strand a cell.
    Regions are 4-connected and each holds exactly its queen because the queen
    cells are the region seeds.
    """
    regions = [-1] * (size * size)
    frontier: list[tuple[int, int]] = []
    for region, col in enumerate(solution):
        row = region
        regions[row * size + col] = region
        for next_row, next_col in _neighbours(row, col, size):
            if regions[next_row * size + next_col] < 0:
                frontier.append((next_row * size + next_col, region))

    while frontier:
        i = rng.below(len(frontier))
        cell, region = frontier[i]
        frontier[i], frontier[-1] = frontier[-1], frontier[i]
        frontier.pop()
        if regions[cell] >= 0:
            continue
        regions[cell] = region
        row, col = divmod(cell, size)
        for next_row, next_col in _neighbours(row, col, size):
            if regions[next_row * size + next_col] < 0:
                frontier.append((next_row * size + next_col, region))

    return tuple(regions)


def _neighbours(row: int, col: int, size: int) -> tuple[tuple[int, int], ...]:
    found: list[tuple[int, int]] = []
    for next_row, next_col in (
        (row - 1, col),
        (row + 1, col),
        (row, col - 1),
        (row, col + 1),
    ):
        if 0 <= next_row < size and 0 <= next_col < size:
            found.append((next_row, next_col))
    return tuple(found)


__all__ = [
    "DEFAULT_ATTEMPTS",
    "DEFAULT_SIZE",
    "MAX_GENERATABLE_SIZE",
    "MIN_GENERATABLE_SIZE",
    "GenerationConfig",
    "GenerationError",
    "generate_puzzle",
    "verify_replay",
]
