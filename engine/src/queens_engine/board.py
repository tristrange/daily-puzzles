"""Board geometry, plus the structural guarantees every puzzle board must satisfy.

These are the constraints *we* are responsible for, not the rules the player follows.
A board that breaks any of them is unfair or illegible even if it happens to be
logically solvable, so they are enforced at construction time.
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from enum import StrEnum
from typing import Final

MIN_SIZE: Final[int] = 2
MAX_SIZE: Final[int] = 16


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

        Neither type stores this number. Queens gets one per line because every
        region holds one star; Star Battle gets k because its regions hold k
        between them. Both fall out of the same arithmetic the solver already
        does: the regions partition the grid, so their capacities total
        `k * size`, and k is that total divided by the size.

        Deriving it from the capacities rather than reading a stored value means
        there is no second copy of k to fall out of step with the regions.
        """
        total = sum(self.region_capacity)
        if total % self.size != 0:
            raise BoardError(
                f"capacities total {total}, which is not divisible by the grid size {self.size}"
            )
        stars = total // self.size
        if not 1 <= stars <= self.size:
            raise BoardError(f"capacities imply {stars} stars per row, outside 1..{self.size}")
        return stars

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

    if board.puzzle_type is PuzzleType.QUEENS:
        if board.region_count != board.size:
            raise BoardError(
                f"queens needs exactly {board.size} regions, found {board.region_count}"
            )
        if any(capacity != 1 for capacity in board.region_capacity):
            raise BoardError("queens requires a capacity of exactly 1 per region")

    for region_id in range(board.region_count):
        cells = board.cells_of_region(region_id)
        capacity = board.region_capacity[region_id]
        if not 1 <= capacity <= len(cells):
            raise BoardError(f"region {region_id} capacity {capacity} outside [1, {len(cells)}]")
        if not _is_orthogonally_connected(board, cells):
            raise BoardError(f"region {region_id} is not orthogonally connected")


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
