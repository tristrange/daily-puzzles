"""Train Tracks: one continuous line, counted by row and by column.

A grid holds a piece in some cells and nothing in the rest. Six pieces exist: a
horizontal straight, a vertical straight, and the four curves. Every piece has two
ends, and three rules decide which arrangements are legal:

- **Reciprocity.** A piece's end must be met by a neighbour's end facing back. This
  is the rule that makes the puzzle a puzzle. Without it, adjacency would decide
  everything, and a line running alongside itself would be indistinguishable from one
  turning — the piece is what says which, and the distinction is the whole difficulty.
- **One path.** The pieces form a single connected line, so there are exactly two
  ends, and both run off the edge of the grid rather than stopping at a cell.
- **Counts.** `row_clues` and `col_clues` say how many cells each line occupies.

Both end pieces are given, which is what pins the line's two ends to the grid edge
before a single cell is decided. `givens` may hold other pieces too, and those are
clues rather than decoration: a search that ignored them would count routes that
contradict the board, turning a unique puzzle into an apparently ambiguous one.

The counts are what make the search affordable. Proving uniqueness means exhausting
it, and because the cells are walked in row-major order, every cell to the right in
the current row and every row below are still undecided — a hard ceiling on what
this row and column can still reach. That is the difference between a 6x6 decided in
a millisecond and one that never finishes.

This implements the format and rules recorded in `docs/puzzle-model.md`, which
records them as verified against real puzzles.
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from typing import Final

from .solver import DEFAULT_LIMIT

#: Compass order, so a direction's opposite is `(d + 2) % 4` and the deltas line up.
NORTH: Final = 0
EAST: Final = 1
SOUTH: Final = 2
WEST: Final = 3

#: Four directions, so a direction's opposite is its index plus this, wrapped.
DIRECTIONS: Final = 4
OPPOSITE: Final = 2

#: The piece in each cell, indexed by the number the format uses. Index 0 is an empty
#: cell and has no ends, so every "does this piece end here" test is one lookup.
#: Straight pieces have opposite ends and curves adjacent ones, which is the whole
#: difference between them and the reason six is the right number.
PIECE_ENDS: Final[tuple[tuple[int, ...], ...]] = (
    (),
    (EAST, WEST),
    (NORTH, SOUTH),
    (NORTH, EAST),
    (EAST, SOUTH),
    (SOUTH, WEST),
    (WEST, NORTH),
)

#: How many pieces a cell may hold, and the last piece's number.
PIECE_COUNT: Final = len(PIECE_ENDS) - 1

#: A line has two ends, and both run off the grid rather than stopping at a cell.
LINE_ENDS: Final = 2

#: A solution is one piece number per cell, row-major, `0` for an empty cell.
type Assignment = tuple[int, ...]


class TrackGridError(ValueError):
    """A track grid violates one of the structural guarantees."""


@dataclass(frozen=True, slots=True)
class TrackGrid:
    """A rectangular grid of pieces with row and column counts.

    `givens` is row-major and holds one piece number per cell, `0` for empty. Both
    ends of the line are always among the givens, so the two open ends are fixed
    before anything else is decided.
    """

    width: int
    height: int
    row_clues: tuple[int, ...]
    col_clues: tuple[int, ...]
    givens: tuple[int, ...]

    def __post_init__(self) -> None:
        _validate(self)

    @property
    def cell_count(self) -> int:
        return self.width * self.height

    @property
    def total(self) -> int:
        """How many cells the line occupies, the same whichever way it is counted."""
        return sum(self.row_clues)

    def index(self, row: int, col: int) -> int:
        return row * self.width + col

    def coords(self, index: int) -> tuple[int, int]:
        return divmod(index, self.width)

    def piece_at(self, index: int) -> int:
        if not 0 <= index < self.cell_count:
            raise TrackGridError(f"cell index {index} out of range")
        return self.givens[index]

    def ends_at(self, index: int) -> tuple[int, ...]:
        """Which directions the piece in `index` ends in."""
        return PIECE_ENDS[self.piece_at(index)]

    def neighbour(self, index: int, direction: int) -> int | None:
        """The cell in `direction` of `index`, or `None` off the edge of the grid.

        `None` is the answer that matters: an end facing `None` is one of the line's
        two open ends, and there are exactly two of those in a solved grid.
        """
        row, col = self.coords(index)
        match direction:
            case 0:
                return None if row == 0 else index - self.width
            case 1:
                return None if col == self.width - 1 else index + 1
            case 2:
                return None if row == self.height - 1 else index + self.width
            case _:
                return None if col == 0 else index - 1


def ends_towards(piece: int, direction: int) -> bool:
    """Whether `piece` has an end facing `direction`."""
    return direction in PIECE_ENDS[piece]


def _check_clues(clues: tuple[int, ...], length: int, name: str) -> None:
    """Every clue must be a count of cells that line actually holds."""
    for position, count in enumerate(clues):
        if not 0 <= count <= length:
            raise TrackGridError(
                f"{name} clue {position} is {count}, but a {name} holds {length} cells"
            )


def _validate(grid: TrackGrid) -> None:
    if grid.width < 1 or grid.height < 1:
        raise TrackGridError(f"a track grid needs a positive size, got {grid.width}x{grid.height}")
    if len(grid.row_clues) != grid.height:
        raise TrackGridError(f"{grid.height} rows, got {len(grid.row_clues)} row clues")
    if len(grid.col_clues) != grid.width:
        raise TrackGridError(f"{grid.width} columns, got {len(grid.col_clues)} column clues")
    _check_clues(grid.row_clues, grid.width, "row")
    _check_clues(grid.col_clues, grid.height, "column")
    if sum(grid.row_clues) != sum(grid.col_clues):
        raise TrackGridError(
            f"rows count {sum(grid.row_clues)} cells and columns count "
            f"{sum(grid.col_clues)}; one line cannot disagree with itself"
        )
    if len(grid.givens) != grid.cell_count:
        raise TrackGridError(
            f"{grid.width}x{grid.height} holds {grid.cell_count} cells, "
            f"got {len(grid.givens)} givens"
        )
    for index, piece in enumerate(grid.givens):
        if not 0 <= piece <= PIECE_COUNT:
            raise TrackGridError(
                f"cell {index} holds piece {piece}, but pieces run 0 to {PIECE_COUNT}"
            )

    # Both ends of the line are givens, so exactly two of them face off the grid.
    # Anything else and the grid either cannot be finished or has ends in the middle
    # of the board, which no solution would explain.
    open_ends = sum(
        1
        for index, piece in enumerate(grid.givens)
        if piece and any(grid.neighbour(index, end) is None for end in PIECE_ENDS[piece])
    )
    if open_ends != LINE_ENDS:
        raise TrackGridError(
            f"{open_ends} given pieces run off the grid, but a line has exactly 2 ends"
        )
    if grid.total < LINE_ENDS:
        raise TrackGridError("a line needs at least its two end cells")


class _Undo:
    """Everything one decision changed, so it can be put back."""

    __slots__ = ("at", "before", "line", "slots")

    def __init__(
        self,
        at: tuple[int, int],
        slots: list[tuple[int, int]],
        line: tuple[int, int],
        before: tuple[int, int, int, int],
    ) -> None:
        self.at = at
        self.slots = slots
        self.line = line
        self.before = before


class _Search:
    """Mutable state of one depth-first walk over the grid's cells.

    Held on an object rather than passed as seven arguments, because the walk
    recurses and every level needs all of it.
    """

    __slots__ = ("col_used", "grid", "open_ends", "parent", "piece", "row_used", "used")

    def __init__(self, grid: TrackGrid) -> None:
        self.grid = grid
        self.piece: list[int] = [0] * grid.cell_count
        self.parent: list[int] = list(range(grid.cell_count))
        self.row_used: list[int] = [0] * grid.height
        self.col_used: list[int] = [0] * grid.width
        self.used = 0
        self.open_ends = 0

    def is_on(self, cell: int) -> bool:
        return self.piece[cell] != 0

    def find(self, cell: int) -> int:
        """The root of `cell`'s component.

        Deliberately no path compression. Compression is the standard speed-up, and
        here it is a correctness trap: it rewrites `parent` entries along the path,
        while a decision only records the slots its own merges touched. A cell
        compressed toward a root that the next decision discards is left pointing at a
        root that no longer holds its component, so an abandoned branch leaves the
        array describing a different partition than it started from.

        Leaving compression out makes the merge the only writer of `parent`, so
        recording its writes is enough to restore the array exactly.
        """
        root = cell
        while self.parent[root] != root:
            root = self.parent[root]
        return root

    def commit(self, cell: int, piece: int) -> _Undo:
        """Put `piece` in `cell`, checking reciprocity against its settled neighbours."""
        grid = self.grid
        row, col = grid.coords(cell)
        # Captured before anything changes: an undo that restores post-change values
        # restores nothing, and the running totals then drift upward across every
        # abandoned branch until no cell can hold a piece at all.
        before = (self.row_used[row], self.col_used[col], self.used, self.open_ends)
        slots: list[tuple[int, int]] = []
        off_grid = 0
        for direction in PIECE_ENDS[piece]:
            other = grid.neighbour(cell, direction)
            if other is None:
                off_grid += 1
            elif other < cell and self.is_on(other):
                a, b = self.find(cell), self.find(other)
                slots.append((b, self.parent[b]))
                if a != b:
                    self.parent[b] = a
        self.piece[cell] = piece
        if piece:
            self.used += 1
            self.row_used[row] += 1
            self.col_used[col] += 1
        self.open_ends += off_grid
        return _Undo((cell, piece), slots, (row, col), before)

    def rollback(self, undo: _Undo) -> None:
        cell, _ = undo.at
        self.piece[cell] = 0
        for other, value in undo.slots:
            self.parent[other] = value
        (row, col) = undo.line
        used_row, used_col, used, open_ends = undo.before
        self.row_used[row], self.col_used[col] = used_row, used_col
        self.used = used
        self.open_ends = open_ends


def _fits(search: _Search, cell: int, piece: int) -> bool:
    """Whether `piece` can go in `cell` given its settled neighbours.

    Only `up` and `left` are settled in row-major order, so those are the only ends
    that can be checked now; an end facing an undecided cell is the neighbour's
    problem when it is decided.
    """
    grid = search.grid
    for direction, other in ((NORTH, cell - grid.width), (WEST, cell - 1)):
        if other < 0:
            continue
        row, col = grid.coords(cell)
        if direction == NORTH and row == 0:
            continue
        if direction == WEST and col == 0:
            continue
        back = (direction + OPPOSITE) % DIRECTIONS
        if ends_towards(piece, direction) != ends_towards(search.piece[other], back):
            return False
    return True


def _fits_clues(search: _Search, cell: int, piece: int) -> bool:
    """Whether the row and column clues can still be met with `piece` in `cell`."""
    grid = search.grid
    row, col = grid.coords(cell)
    used_row = search.row_used[row] + bool(piece)
    used_col = search.col_used[col] + bool(piece)
    return (
        used_row <= grid.row_clues[row]
        and used_col <= grid.col_clues[col]
        and used_row + (grid.width - 1 - col) >= grid.row_clues[row]
        and used_col + (grid.height - 1 - row) >= grid.col_clues[col]
    )


def _row_closed(search: _Search, cell: int) -> bool:
    """Whether the row above a newly started one was filled to its clue.

    Nothing later can change a finished row, so this is the last moment to check.
    """
    row, _ = search.grid.coords(cell)
    return row == 0 or search.row_used[row - 1] == search.grid.row_clues[row - 1]


def _closed_early(search: _Search, cell: int) -> bool:
    """Whether `cell`'s piece can never be joined by anything still undecided.

    A line is one path, so a run of track that can no longer reach an undecided cell
    is finished. It is only acceptable if it is the whole line: if cells remain that
    must hold track, they would form a second path, and if fewer than two ends have
    run off the grid there is no line to finish at all.
    """
    grid = search.grid
    component = search.find(cell)
    for other in range(cell + 1):
        if not search.is_on(other) or search.find(other) != component:
            continue
        for direction in PIECE_ENDS[search.piece[other]]:
            ahead = grid.neighbour(other, direction)
            if ahead is not None and ahead > cell:
                return False
    return search.used != grid.total or search.open_ends != LINE_ENDS


def _one_path(search: _Search) -> bool:
    """Whether every piece belongs to the single line."""
    cells = range(search.grid.cell_count)
    first = next((c for c in cells if search.is_on(c)), None)
    if first is None:
        return False
    root = search.find(first)
    return all(not search.is_on(c) or search.find(c) == root for c in cells)


def _walk(search: _Search, cell: int) -> Iterator[Assignment]:
    grid = search.grid
    if cell == grid.cell_count:
        if search.open_ends == LINE_ENDS and _one_path(search):
            yield tuple(search.piece)
        return

    if not _row_closed(search, cell):
        return

    given = grid.givens[cell]
    for piece in (given,) if given else range(PIECE_COUNT + 1):
        if _fits(search, cell, piece) and _fits_clues(search, cell, piece):
            off_grid = sum(1 for d in PIECE_ENDS[piece] if grid.neighbour(cell, d) is None)
            if search.open_ends + off_grid <= LINE_ENDS:
                undo = search.commit(cell, piece)
                if not (piece and _closed_early(search, cell)):
                    yield from _walk(search, cell + 1)
                search.rollback(undo)


def iter_solutions(grid: TrackGrid) -> Iterator[Assignment]:
    """Yield every solution, each as one piece number per cell.

    Unbounded and uncached, for callers that need the solutions themselves. Use
    `count_solutions` when only the number matters.
    """
    search = _Search(grid)
    yield from _walk(search, 0)


def count_solutions(grid: TrackGrid, *, limit: int = DEFAULT_LIMIT) -> int:
    """Count solutions, stopping at `limit`.

    Returns `min(actual, limit)`, so the default limit of 2 distinguishes zero, one
    and many without paying to enumerate the many — the only question the generator
    asks. Proving a grid has *exactly* one solution means exhausting the search.
    """
    if limit < 1:
        raise TrackGridError(f"limit must be at least 1, got {limit}")
    total = 0
    for _ in iter_solutions(grid):
        total += 1
        if total >= limit:
            break
    return total


def has_unique_solution(grid: TrackGrid) -> bool:
    """Whether the grid has exactly one solution."""
    return count_solutions(grid, limit=2) == 1
