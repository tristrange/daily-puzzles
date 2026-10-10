"""Seeded puzzle generation with a uniqueness gate.

A board is generated in three stages, all driven by one deterministic PRNG:

1. A random solution is placed by backtracking over rows with random column
   order — one star per row for Queens, `stars_per_row` for Star Battle.
2. Regions grow outward from their stars, one cell at a time, from a random
   frontier. Each region keeps its stars and stays 4-connected by
   construction, and every cell is eventually claimed because the frontier is
   connected.
3. The exact solver is the uniqueness gate: boards with more than one solution
   are discarded and the PRNG moves on. Because every stage is a pure function
   of the seed, the same seed always produces the same board.

If no unique board appears within the attempt budget, `GenerationError` is
raised rather than silently shipping a puzzle with a second solution.

`generator_version` records the algorithm that produced a puzzle: 1 is the
Queens path, 2 is the Star Battle path (multi-star placement). The committed
version-1 files must replay byte-for-byte, so the Queens functions are frozen;
Star Battle consumption lives in separate functions that cannot perturb them.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from .board import Board, BoardError, Puzzle, PuzzleType
from .prng import Prng
from .solver import has_unique_solution, iter_solutions

DEFAULT_SIZE: Final[int] = 8
MIN_GENERATABLE_SIZE: Final[int] = 5
MAX_GENERATABLE_SIZE: Final[int] = 9
MAX_SEED: Final[int] = 0xFFFFFFFF
MIN_STARS_PER_ROW: Final[int] = 2

#: Days of "two weeks" a published star board must stay clear of a layout that
#: is already on disk. Back-to-back days sharing a star arrangement would be
#: playable from memory, which is the guessability `STAR_BATTLE_SIZE` removed.
#: The window is inclusive on both edges, so the farthest repeat allowed is a
#: pair fifteen days apart.
STAR_LAYOUT_WINDOW_DAYS: Final[int] = 14

#: (size, stars_per_row) pairs that admit any legal no-touching layout. Two
#: stars separated by one gap need a row span of 2*stars - 1 columns, and the
#: shadow a row casts on its neighbour (used columns plus their +/-1) shrinks
#: the next row further — the smallest boards that work are 8x8 and 9x9 for
#: two stars; three stars need at least 12x12, beyond the generator's range.
#: This is the placement gate, not an opinion: a brute-force search over row
#: combinations confirms every pair in sizes 5..9, x stars 2..4 satisfies this
#: table and only these entries do.
FEASIBLE_STAR_BATTLE: Final[frozenset[tuple[int, int]]] = frozenset({(8, 2), (9, 2)})

# Attempts to allow before giving up, per size. Uniqueness is a rare accident
# of region arrangement (see the M3 note in README), so bigger grids need
# progressively more tries; 9 is deliberately slow but achievable. The same
# budget table drives both puzzle types: Star Battle boards are rarer to find
# but cheaper to verify, and the totals hold either way.
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
    """Knobs for generation. `size` relates to capacity; see board.py.

    Queens implies one star per row/column/region. Star Battle requires
    `stars_per_row` in 2..size; every region then holds exactly that many
    stars, and there are still `size` regions.
    """

    size: int = DEFAULT_SIZE
    puzzle_type: PuzzleType = PuzzleType.QUEENS
    stars_per_row: int | None = None
    max_attempts: int | None = None


def generate_puzzle(*, seed: int, puzzle_id: str, config: GenerationConfig | None = None) -> Puzzle:
    """Generate a unique-solution puzzle from `seed`.

    `seed` must fit the schema's 0..2^32-1 range so it can be stored in a
    puzzle file and replayed later. See `GenerationConfig` for the puzzle-type
    knobs.
    """
    if not 0 <= seed <= MAX_SEED:
        raise GenerationError(f"seed {seed} outside [0, 2**32-1]")
    cfg = config or GenerationConfig()
    if not MIN_GENERATABLE_SIZE <= cfg.size <= MAX_GENERATABLE_SIZE:
        raise GenerationError(
            f"size {cfg.size} outside [{MIN_GENERATABLE_SIZE}, {MAX_GENERATABLE_SIZE}]"
        )
    stars_per_row = _resolve_stars_per_row(cfg)
    if (
        cfg.puzzle_type is PuzzleType.STAR_BATTLE
        and (cfg.size, stars_per_row) not in FEASIBLE_STAR_BATTLE
    ):
        raise GenerationError(
            f"no legal {cfg.size}x{cfg.size} star-battle board with "
            f"{stars_per_row} stars per row exists (feasible sizes within the "
            "generator's range: 8x8 and 9x9 for two stars)"
        )
    max_attempts = cfg.max_attempts or DEFAULT_ATTEMPTS[cfg.size]

    rng = Prng(seed)
    for _ in range(max_attempts):
        if cfg.puzzle_type is PuzzleType.QUEENS:
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
            generator_version = 1
        else:
            rows = _place_stars(cfg.size, stars_per_row, rng)
            if rows is None:
                continue
            regions = _grow_regions_star(cfg.size, _star_seeds(cfg.size, rows), rng)
            try:
                board = Board(
                    size=cfg.size,
                    regions=regions,
                    region_capacity=(stars_per_row,) * cfg.size,
                    puzzle_type=PuzzleType.STAR_BATTLE,
                )
            except BoardError:
                continue
            generator_version = 2
        if has_unique_solution(board):
            return Puzzle(
                id=puzzle_id,
                puzzle_type=board.puzzle_type,
                seed=seed,
                generator_version=generator_version,
                board=board,
            )

    raise GenerationError(f"no unique board found for seed {seed} in {max_attempts} attempts")


def _resolve_stars_per_row(cfg: GenerationConfig) -> int:
    if cfg.puzzle_type is PuzzleType.QUEENS:
        if cfg.stars_per_row not in (None, 1):
            raise GenerationError(f"queens implies one star per row, not {cfg.stars_per_row}")
        return 1
    if cfg.stars_per_row is None:
        raise GenerationError("star-battle requires stars_per_row")
    if not MIN_STARS_PER_ROW <= cfg.stars_per_row <= cfg.size:
        raise GenerationError(
            f"stars_per_row {cfg.stars_per_row} outside [{MIN_STARS_PER_ROW}, {cfg.size}]"
        )
    return cfg.stars_per_row


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


def _place_stars(size: int, stars: int, rng: Prng) -> list[frozenset[int]] | None:
    """One random Star Battle solution: `result[row]` is that row's star columns.

    `stars` stars per row and per column, no two of them touching (orthogonal
    or diagonal). Regions are not considered here — the stars are bucketed
    into regions afterwards, exactly as Queens treats each row as a region.
    """
    rows: list[frozenset[int]] = [frozenset() for _ in range(size)]
    col_usage = [0] * size

    def free_columns(prev: set[int] | frozenset[int]) -> list[int]:
        forbidden = set(prev)
        for col in prev:
            forbidden.add(col - 1)
            forbidden.add(col + 1)
        return [c for c in rng.shuffled(range(size)) if c not in forbidden and col_usage[c] < stars]

    def pick_in_row(row: int, free: list[int], needed: int, chosen: set[int]) -> bool:
        if needed == 0:
            rows[row] = frozenset(chosen)
            return True if row == size - 1 else pick_row(row + 1, rows[row])
        for i, col in enumerate(free):
            remaining = [c for j, c in enumerate(free) if j > i and c not in (col - 1, col + 1)]
            chosen.add(col)
            col_usage[col] += 1
            if pick_in_row(row, remaining, needed - 1, chosen):
                return True
            chosen.discard(col)
            col_usage[col] -= 1
        return False

    def pick_row(row: int, prev: set[int] | frozenset[int]) -> bool:
        return pick_in_row(row, free_columns(prev), stars, set())

    if not pick_row(0, set()):
        return None
    return rows


def _star_seeds(size: int, rows: list[frozenset[int]]) -> list[tuple[int, int]]:
    """Bucket the solution stars into `size` regions of `stars` each.

    Cells are visited in row-major order and cut into contiguous groups, so
    region `r` gets the `r`-th group. The cut is arbitrary (the regions then
    grow outward exactly like Queens regions do) but it is the seed ordering
    that pins the Star Battle stream, so it stays part of the contract.
    """
    cells = [row * size + col for row, cols in enumerate(rows) for col in sorted(cols)]
    stars = len(rows[0])
    return [
        (cell, region)
        for region, base in enumerate(range(0, len(cells), stars))
        for cell in cells[base : base + stars]
    ]


def _grow_regions_star(size: int, seeds: list[tuple[int, int]], rng: Prng) -> tuple[int, ...]:
    """Flood-fill the grid, growing every region from its seed cells.

    The address-shaped analogue of `_grow_regions`: each region seeds from the
    `stars` cells assigned to it, and the flood fill works cell by cell from a
    random frontier. A disconnected layout (two seed islands of one region cut
    off by other regions) is rejected by the caller via `Board` validation.
    """
    regions = [-1] * (size * size)
    frontier: list[tuple[int, int]] = []
    for cell, region in seeds:
        regions[cell] = region
        row, col = divmod(cell, size)
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


def _grow_regions(size: int, solution: list[int], rng: Prng) -> tuple[int, ...]:
    """Flood-fill the grid, growing every region from its queen's cell.

    Cells are claimed one at a time from a random frontier; a claimed cell adds
    its unclaimed neighbours to the frontier, so growth cannot strand a cell.
    Regions are 4-connected and each holds exactly its queen because the queen
    cells are the region seeds. Frozen for replay: the committed version-1
    puzzles were grown by this exact stream of draws.
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


def star_layout(board: Board) -> tuple[tuple[int, ...], ...]:
    """The star board's arrangement: each row's sorted star columns.

    Star boards are unique-solution, so the first solution is the arrangement a
    player has to produce; two boards with the same sequence of row-pairs are
    the same board to play, whatever their regions look like. This is what a
    repeat check compares: a board published inside `STAR_LAYOUT_WINDOW_DAYS` of
    one with the same arrangement would be playable from memory.

    Takes the `Board` rather than the `Puzzle`, so it reads the size off something
    that has one. A `Puzzle` no longer carries `size` — that is a property of the
    marks genres, and this function only ever has a marks board.
    """
    pairs: list[list[int]] = [[] for _ in range(board.size)]
    for cell in next(iter(iter_solutions(board))):
        pairs[cell // board.size].append(cell % board.size)
    return tuple(tuple(sorted(row)) for row in pairs)


__all__ = [
    "DEFAULT_ATTEMPTS",
    "DEFAULT_SIZE",
    "MAX_GENERATABLE_SIZE",
    "MIN_GENERATABLE_SIZE",
    "STAR_LAYOUT_WINDOW_DAYS",
    "GenerationConfig",
    "GenerationError",
    "generate_puzzle",
    "star_layout",
]
