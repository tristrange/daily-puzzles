"""What a puzzle file's contents are: its type, its board, and the envelope around them.

These are the constraints *we* are responsible for, not the rules the player follows.
A board that breaks any of them is unfair or illegible even if it happens to be
logically solvable, so they are enforced at construction time.

`Puzzle` lives here rather than in `puzzle.py` because of what it depends on.
`puzzle.py` reads a board through the type's rulebook, and the rulebook generates
through `generator.py`, which builds a `Puzzle` — so a `Puzzle` defined in `puzzle.py`
and imported from the top of that module makes the three a cycle. This module imports
nothing of ours, so anything defined here can be depended on from all three.
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from enum import StrEnum
from typing import Final, cast

MIN_SIZE: Final[int] = 2
MAX_SIZE: Final[int] = 16

#: Any value a puzzle file may hold. Defined here, beside the board a file's `board`
#: object describes, because `rulebook.py` needs it to type the dicts it writes and
#: importing it from `puzzle.py` would close a loop: `puzzle.py` reads a board
#: through the rulebook.
type JsonValue = str | int | float | bool | list[JsonValue] | dict[str, JsonValue] | None


class PuzzleType(StrEnum):
    QUEENS = "queens"
    STAR_BATTLE = "star-battle"


class BoardError(ValueError):
    """A board violates one of the structural guarantees."""


@dataclass(frozen=True, slots=True)
class Board:
    """An immutable `size` x `size` grid partitioned into regions.

    `regions` is row-major and holds one region id per cell. `region_capacity` holds the
    number of queens each region must hold; for Queens every entry is 1.
    """

    size: int
    regions: tuple[int, ...]
    region_capacity: tuple[int, ...]
    puzzle_type: PuzzleType

    def __post_init__(self) -> None:
        validate_board(self)

    @property
    def width(self) -> int:
        """The grid's width, in cells.

        Equal to `size`, and that is the point: it is the name a rectangular grid
        would use, so a third game that is not square can adopt the same vocabulary
        without every caller having to know which board it holds. `Board` stays
        square-only — see `validate_board` — and a Train Tracks board is a different
        class implementing the same concepts, not a wider `Board`.
        """
        return self.size

    @property
    def height(self) -> int:
        """The grid's height, in cells. See `width`."""
        return self.size

    @property
    def cell_count(self) -> int:
        return self.width * self.height

    @property
    def region_count(self) -> int:
        return len(self.region_capacity)

    @property
    def stars_per_row(self) -> int:
        """How many stars every row and every column must hold.

        Neither type stores this number, and neither needs to: see
        `derive_stars_per_row`, which both this property and `validate_board`
        go through so the two can never disagree about what k is.
        """
        return derive_stars_per_row(self.region_capacity, self.size)

    def index(self, row: int, col: int) -> int:
        return row * self.width + col

    def coords(self, index: int) -> tuple[int, int]:
        return divmod(index, self.width)

    def region_at(self, index: int) -> int:
        """The region holding `index`.

        Out of range raises `BoardError` rather than the `IndexError` a bare tuple
        index would give: it is the same failure the TypeScript `Board` reports, and a
        raw `IndexError` names neither the board nor the offending cell.
        """
        if not 0 <= index < self.cell_count:
            raise BoardError(f"cell index {index} out of range")
        return self.regions[index]

    def cells_of_region(self, region_id: int) -> tuple[int, ...]:
        return tuple(i for i, region in enumerate(self.regions) if region == region_id)

    def orthogonal_neighbours(self, index: int) -> tuple[int, ...]:
        return self._neighbours(index, (-1, 0), (1, 0), (0, -1), (0, 1))

    def diagonal_neighbours(self, index: int) -> tuple[int, ...]:
        return self._neighbours(index, (-1, -1), (-1, 1), (1, -1), (1, 1))

    def iter_indices(self) -> Iterator[int]:
        return iter(range(self.cell_count))

    def _neighbours(self, index: int, *deltas: tuple[int, int]) -> tuple[int, ...]:
        row, col = self.coords(index)
        found: list[int] = []
        for d_row, d_col in deltas:
            next_row, next_col = row + d_row, col + d_col
            if 0 <= next_row < self.height and 0 <= next_col < self.width:
                found.append(next_row * self.width + next_col)
        return tuple(found)


def require_int(value: object, field: str) -> int:
    """Return value as an int, using the schema's definition of "integer".

    JSON Schema 2020-12 counts a number with a zero fractional part as an integer,
    so `4.0` is as valid as `4`. json.loads hands us a float where ajv hands
    TypeScript a plain number, so rejecting floats here would make the two parsers
    disagree on files the schema accepts.

    These coercions live here rather than in `puzzle.py` because the rulebook reads a
    board record too, and `rulebook.py` already imports this module. Leaving them in
    `puzzle.py` would mean the rulebook importing the module that imports the
    rulebook.
    """
    if isinstance(value, bool) or not isinstance(value, int | float):
        raise BoardError(f"{field} must be an integer")
    if isinstance(value, float):
        # is_integer() is False for nan and inf, so those are rejected too.
        if not value.is_integer():
            raise BoardError(f"{field} must be an integer")
        return int(value)
    return value


def require_list(value: object, field: str) -> list[object]:
    if not isinstance(value, list):
        raise BoardError(f"{field} must be an array")
    # isinstance narrows `object` to `list[Unknown]`, which a strict checker will not
    # let a caller iterate as though it held values. The element type is decided by
    # whoever reads the list, through `require_int` on each entry.
    return cast("list[object]", value)


@dataclass(frozen=True, slots=True)
class Puzzle:
    """A puzzle file after structural and semantic validation.

    There is no `size` field, because a size is not a property of a puzzle: it is a
    property of the two square genres. A Train Tracks grid is `width` x `height` and
    has no `size` at all — 5x9 is not a size, and the board deliberately permits it.
    Widening the field to `int | None` would put a hole in something the tools read
    directly, and keeping it as the largest dimension would have a 5x9 file claiming
    to be 9x9. So callers ask the type's rulebook for `dimensions(puzzle)` instead,
    which is `(size, size)` here and `(width, height)` for a grid that is not square.
    """

    id: str
    puzzle_type: PuzzleType
    seed: int
    generator_version: int
    board: Board
    #: Band index, 1-based into `LEVEL_NAMES`. `None` for boards published
    #: before the weekly ramp, and for anything generated outside a target.
    difficulty: int | None = None


def derive_stars_per_row(region_capacity: tuple[int, ...], size: int) -> int:
    """How many marks every row and every column of a board must hold.

    Neither puzzle type stores this number. Queens gets one per line because
    every region holds one star; Star Battle gets k because its regions hold k
    between them. Both fall out of the same arithmetic the solver already does:
    the regions partition the grid, so their capacities total `k * size`, and k
    is that total divided by the size.

    Deriving it from the capacities rather than reading a stored value means
    there is no second copy of k to fall out of step with the regions. It also
    makes the derivation a *rule*: capacities that do not divide evenly describe
    no playable game. So both callers come here — `validate_board` to refuse a
    board that has no k, `Board.stars_per_row` to report the k that refusal
    already guaranteed — and they cannot disagree about it.

    Raises `BoardError` when the capacities imply no whole number in range.
    """
    total = sum(region_capacity)
    if total % size != 0:
        raise BoardError(
            f"capacities total {total}, which is not divisible by the grid size {size}"
        )
    stars = total // size
    if not 1 <= stars <= size:
        raise BoardError(f"capacities imply {stars} stars per row, outside 1..{size}")
    return stars


def validate_board(board: Board) -> None:
    """Raise `BoardError` unless `board` satisfies every structural guarantee."""
    if not MIN_SIZE <= board.size <= MAX_SIZE:
        raise BoardError(f"size {board.size} outside [{MIN_SIZE}, {MAX_SIZE}]")

    # `width`/`height` are derived from `size`, so this cannot fail today. It is
    # here so that the square-only promise of `Board` is stated in the one place
    # that decides what a board may be, rather than implied by the two properties
    # agreeing. A future rectangular board is a separate class, and if anyone ever
    # widens this one instead, this is the line that says so out loud.
    if board.width != board.height:
        raise BoardError(f"board must be square, got {board.width}x{board.height}")

    if len(board.regions) != board.cell_count:
        raise BoardError(f"regions has {len(board.regions)} entries, expected {board.cell_count}")

    if board.region_count < 1:
        raise BoardError("board must have at least one region")

    present = set(board.regions)
    if present != set(range(board.region_count)):
        raise BoardError("region ids must be exactly 0..regionCount-1, with no gaps")

    violation = _genre_violation(board)
    if violation is not None:
        raise BoardError(violation)

    for region_id in range(board.region_count):
        cells = board.cells_of_region(region_id)
        capacity = board.region_capacity[region_id]
        if not 1 <= capacity <= len(cells):
            raise BoardError(f"region {region_id} capacity {capacity} outside [1, {len(cells)}]")
        if not _is_orthogonally_connected(board, cells):
            raise BoardError(f"region {region_id} is not orthogonally connected")

    # Last, because it is the only rule that reads every capacity at once rather
    # than each against its own region. The regions partition the grid, so a set
    # of capacities is only playable if it totals a whole multiple of the size;
    # otherwise there is no whole number of marks per line and the game cannot
    # end. That failure is silent in a way the checks above are not: the app
    # divides anyway, gets a fractional stars-per-row, and asks the player for a
    # piece count the row limits make unreachable — a puzzle that can never be
    # won and never says why.
    #
    # Given the capacity check in the loop above, divisibility is the whole
    # rule: the capacities sum to at least one and at most `size * size`, so a
    # total that divides by the size lands the quotient in `1..size` on its own.
    #
    # Both genres already force a uniform capacity across exactly `size` regions,
    # so the total always divides and this can never fire for a `Board`. It stays
    # as the guard for direct `derive_stars_per_row` callers and any future genre
    # that does not pin its capacities this way.
    derive_stars_per_row(board.region_capacity, board.size)


def _genre_violation(board: Board) -> str | None:
    """The genre contract `board` breaks, or `None` if it keeps every rule.

    Queens and Star Battle both pin the region structure: exactly `size` regions
    that all share one capacity, with Queens fixing that capacity at 1. Runs
    before the per-region loop so a genre violation is named over a shape
    detail: a two-region star board says so, rather than pointing at one of its
    regions first.
    """
    if board.puzzle_type is PuzzleType.QUEENS:
        if board.region_count != board.size:
            return f"queens needs exactly {board.size} regions, found {board.region_count}"
        if any(capacity != 1 for capacity in board.region_capacity):
            return "queens requires a capacity of exactly 1 per region"
        return None
    if board.puzzle_type is PuzzleType.STAR_BATTLE:
        if board.region_count != board.size:
            return f"star battle needs exactly {board.size} regions, found {board.region_count}"
        if any(capacity != board.region_capacity[0] for capacity in board.region_capacity):
            return "star battle requires one capacity shared by every region"
    return None


def _is_orthogonally_connected(board: Board, cells: tuple[int, ...]) -> bool:
    members = set(cells)
    seen = {cells[0]}
    stack = [cells[0]]
    while stack:
        for neighbour in board.orthogonal_neighbours(stack.pop()):
            if neighbour in members and neighbour not in seen:
                seen.add(neighbour)
                stack.append(neighbour)
    return len(seen) == len(members)


# Regions are only required to be 4-connected. An earlier version also rejected
# a region that touched itself diagonally, on the theory that it would be
# ambiguous which blob was which. That rule is degenerate: a 4-connected set
# with no diagonal self-contact is necessarily a straight line, because a path
# that ever turns step p -> q -> r puts p and r diagonally adjacent. So the
# check silently reduced every puzzle to parallel stripes, rejecting the L, T
# and block shapes the genre is actually made of. Connectivity already prevents
# the ambiguity it was meant to prevent.
