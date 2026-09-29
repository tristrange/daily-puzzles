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
    def cell_count(self) -> int:
        return self.size * self.size

    @property
    def region_count(self) -> int:
        return len(self.region_capacity)

    def index(self, row: int, col: int) -> int:
        return row * self.size + col

    def coords(self, index: int) -> tuple[int, int]:
        return divmod(index, self.size)

    def region_at(self, index: int) -> int:
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
            if 0 <= next_row < self.size and 0 <= next_col < self.size:
                found.append(next_row * self.size + next_col)
        return tuple(found)


def validate_board(board: Board) -> None:
    """Raise `BoardError` unless `board` satisfies every structural guarantee."""
    if not MIN_SIZE <= board.size <= MAX_SIZE:
        raise BoardError(f"size {board.size} outside [{MIN_SIZE}, {MAX_SIZE}]")

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
        if _touches_itself_diagonally(board, cells):
            raise BoardError(f"region {region_id} touches itself diagonally")


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


def _touches_itself_diagonally(board: Board, cells: tuple[int, ...]) -> bool:
    members = set(cells)
    return any(
        neighbour in members for cell in cells for neighbour in board.diagonal_neighbours(cell)
    )
