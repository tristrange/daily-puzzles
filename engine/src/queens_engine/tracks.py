"""Train Tracks: one continuous line, counted by row and by column.

A board is a rectangular grid with a number on the right of each row and a number
under each column. A solution draws a single track from the entrance cell on the
left edge to the exit cell on the bottom edge, using each cell at most once, never
branching, crossing itself, closing a loop, or stopping short. The row and column
numbers say how many cells the track occupies in each.

**A solution is the set of cells the track runs through**, and every other property
follows from that set rather than being stored beside it:

- two on-track cells that are neighbours are joined, because each cell's piece is
  whichever way its neighbours lie — the edge is implied, not chosen,
- the piece in a cell is the straight or the curve those neighbours imply,
- no branching and no crossing are both the rule that an on-track cell touches
  exactly two others, or one at each open end,
- one unbroken line is the rule that the cells form a single component running
  from the entrance to the exit.

That representation is the whole design. The first version of this search chose
each cell's *edges* as it went, and was wrong: it could emit a cell set whose
implied degrees disagreed with the edges it had recorded, because two adjacent
on-track cells are always joined whether or not the walk chose to say so. Deciding
one yes/no per cell has no such freedom, and it is also a smaller search.
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from typing import Final

from .solver import DEFAULT_LIMIT

#: How many on-track neighbours an open end carries, against one elsewhere. Named
#: because "1" and "2" recur throughout the search and read as nothing at a glance.
END_DEGREE: Final = 1
BODY_DEGREE: Final = 2

#: A solution is the sorted cells the track runs through.
type Track = tuple[int, ...]


class TrackBoardError(ValueError):
    """A track board violates one of the structural guarantees."""


@dataclass(frozen=True, slots=True)
class TrackBoard:
    """A rectangular grid with row and column counts and two open ends.

    `entrance` sits in the leftmost column and `exit` in the bottom row, matching
    the printed puzzle where the line runs in from one side and out of another.
    """

    width: int
    height: int
    row_counts: tuple[int, ...]
    col_counts: tuple[int, ...]
    entrance: int
    exit: int

    def __post_init__(self) -> None:
        _validate(self)

    @property
    def cell_count(self) -> int:
        return self.width * self.height

    @property
    def total(self) -> int:
        """How many cells the track occupies, the same whichever way it is counted."""
        return sum(self.row_counts)

    def index(self, row: int, col: int) -> int:
        return row * self.width + col

    def coords(self, index: int) -> tuple[int, int]:
        return divmod(index, self.width)

    def orthogonal_neighbours(self, index: int) -> tuple[int, ...]:
        row, col = self.coords(index)
        found: list[int] = []
        for d_row, d_col in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            next_row, next_col = row + d_row, col + d_col
            if 0 <= next_row < self.height and 0 <= next_col < self.width:
                found.append(next_row * self.width + next_col)
        return tuple(found)


def _check_counts(counts: tuple[int, ...], length: int, name: str) -> None:
    """Every line's count must be a number of cells that line actually holds."""
    for position, count in enumerate(counts):
        if not 0 <= count <= length:
            raise TrackBoardError(
                f"{name} {position} counts {count} cells, but a {name} holds {length}"
            )


def _validate(board: TrackBoard) -> None:
    if board.width < 1 or board.height < 1:
        raise TrackBoardError(
            f"a track board needs a positive size, got {board.width}x{board.height}"
        )
    if len(board.row_counts) != board.height:
        raise TrackBoardError(f"{board.height} rows, got {len(board.row_counts)} row counts")
    if len(board.col_counts) != board.width:
        raise TrackBoardError(f"{board.width} columns, got {len(board.col_counts)} column counts")
    _check_counts(board.row_counts, board.width, "row")
    _check_counts(board.col_counts, board.height, "column")
    if sum(board.row_counts) != sum(board.col_counts):
        raise TrackBoardError(
            f"rows count {sum(board.row_counts)} cells and columns count "
            f"{sum(board.col_counts)}; a track is counted both ways and cannot "
            "disagree with itself"
        )
    if board.entrance == board.exit:
        raise TrackBoardError(f"the entrance and the exit are both cell {board.entrance}")
    for name, cell in (("entrance", board.entrance), ("exit", board.exit)):
        if not 0 <= cell < board.cell_count:
            raise TrackBoardError(f"{name} cell {cell} is off the board")
    if board.coords(board.entrance)[1] != 0:
        raise TrackBoardError("the entrance is not in the leftmost column")
    if board.coords(board.exit)[0] != board.height - 1:
        raise TrackBoardError("the exit is not in the bottom row")

    # The entrance is on the track and lives in the leftmost column, so that column
    # cannot count zero. No such claim holds for any row: the entrance may sit in
    # any of them, and the top row in particular need not hold it at all.
    if board.col_counts[0] < END_DEGREE:
        raise TrackBoardError("the first column counts 0 cells but holds the entrance")
    if board.total < END_DEGREE + END_DEGREE:
        raise TrackBoardError("a track needs at least an entrance and an exit")


def _opens(board: TrackBoard, cell: int) -> int:
    """How many on-track neighbours a cell must have.

    Two everywhere, except one at each open end: the track starts and finishes, and
    a cell it merely passes through joins a neighbour on each side. Two at an end
    would let the line pass through the entrance and go back out; one elsewhere
    would strand it.
    """
    return END_DEGREE if cell in (board.entrance, board.exit) else BODY_DEGREE


class _Undo:
    """Everything one decision changed, so it can be put back."""

    __slots__ = ("cells", "counts", "degrees", "line", "slots")

    def __init__(
        self,
        cells: int,
        degrees: list[tuple[int, int]],
        slots: list[tuple[int, int]],
        line: tuple[int, int],
        counts: tuple[int, int],
    ) -> None:
        self.cells = cells
        self.degrees = degrees
        self.slots = slots
        self.line = line
        self.counts = counts


class _Search:
    """Mutable state of one depth-first walk over the board's cells.

    Held on an object rather than passed as eight arguments, because the walk
    recurses and every level needs all of it.
    """

    __slots__ = ("board", "col_used", "degree", "on_path", "parent", "row_used")

    def __init__(self, board: TrackBoard) -> None:
        self.board = board
        self.on_path: list[int] = []
        # Neighbours of an on-track cell that are already known to be on the track.
        # It reaches its required count only once its last neighbour is decided,
        # which `_settled` below is where that is checked.
        self.degree: list[int] = [0] * board.cell_count
        self.parent: list[int] = list(range(board.cell_count))
        self.row_used: list[int] = [0] * board.height
        self.col_used: list[int] = [0] * board.width

    def is_on(self, cell: int) -> bool:
        return cell in self.on_path

    def find(self, cell: int) -> int:
        """The root of `cell`'s component.

        Deliberately no path compression. Compression is the standard speed-up, and
        here it is a correctness trap: it rewrites `parent` entries along the path,
        while a decision only records the slots its own merge touched. A cell
        compressed toward a root that the next decision discards is left pointing at
        a root that no longer holds its component, so the abandoned branch leaves
        the array describing a different partition than it started from.

        Leaving compression out makes the merge the only writer of `parent`, so
        recording its writes is enough to restore the array exactly.
        """
        root = cell
        while self.parent[root] != root:
            root = self.parent[root]
        return root

    def commit(self, cell: int) -> _Undo:
        """Put the track through `cell`, joining it to its settled on-track neighbours.

        Only `up` and `left` are settled: the cells are walked in row-major order,
        so a cell's down and right neighbours are decided after it. `degree` counts
        what is known so far and is not required to have reached its target yet.
        """
        board = self.board
        row, col = board.coords(cell)
        degrees = [(cell, self.degree[cell])]
        slots: list[tuple[int, int]] = []
        for neighbour in board.orthogonal_neighbours(cell):
            if neighbour >= cell or not self.is_on(neighbour):
                continue
            degrees.append((neighbour, self.degree[neighbour]))
            a, b = self.find(cell), self.find(neighbour)
            slots.append((b, self.parent[b]))
            if a != b:
                self.parent[b] = a
            self.degree[cell] += 1
            self.degree[neighbour] += 1
        self.on_path.append(cell)
        counts = (self.row_used[row], self.col_used[col])
        self.row_used[row] += 1
        self.col_used[col] += 1
        return _Undo(len(self.on_path) - 1, degrees, slots, (row, col), counts)

    def rollback(self, undo: _Undo) -> None:
        del self.on_path[undo.cells :]
        for cell, value in undo.degrees:
            self.degree[cell] = value
        for cell, value in undo.slots:
            self.parent[cell] = value
        (row, col), (used_row, used_col) = undo.line, undo.counts
        self.row_used[row], self.col_used[col] = used_row, used_col


def _counts_allow(search: _Search, cell: int) -> bool:
    """Whether the row and column counts can still be met after deciding `cell`.

    This is the pruning that makes the search cheap. The cells are walked in
    row-major order, so at `cell` every cell to its right in this row is still
    undecided and every row below is untouched, which puts a hard ceiling on what
    this row and column can still reach. Without it the walk would fill rows in
    every order and only discover the counts at the end.

    Reads the running totals, so it is called once the decision has been applied and
    sees this cell already counted. Whether the cell is on the track is not asked
    here: a cell left off changes no total, and a cell put on has changed it.
    """
    board = search.board
    row, col = board.coords(cell)
    used_row = search.row_used[row]
    used_col = search.col_used[col]
    return (
        used_row <= board.row_counts[row]
        and used_col <= board.col_counts[col]
        and used_row + (board.width - 1 - col) >= board.row_counts[row]
        and used_col + (board.height - 1 - row) >= board.col_counts[col]
    )


def _row_closed(search: _Search, cell: int) -> bool:
    """Whether the row above a newly started one was filled to its count.

    Nothing after this point can change a finished row, so this is the last moment
    its count can be checked.
    """
    board = search.board
    row, _ = board.coords(cell)
    return row == 0 or search.row_used[row - 1] == board.row_counts[row - 1]


def _settled(search: _Search, cell: int) -> bool:
    """Whether every cell whose last neighbour `cell` decides has its degree.

    A cell's last undecided neighbour is the one below it, or — in the bottom row,
    where there is none — the one to its right. So deciding `cell` settles the cell
    directly above, and in the bottom row also the one to its left. The bottom-right
    cell has no neighbour left to decide at all, so it is settled by itself.

    Checking here rather than at the end is what keeps the search small: a cell with
    too few or too many on-track neighbours is usually found while its row is still
    being built, not after the whole board is decided. It is checked whether `cell`
    went on the track or not, since a cell left off settles its neighbours just as
    firmly as one that went on.
    """
    board = search.board
    row, col = board.coords(cell)
    checked: list[int] = []
    if row > 0:
        checked.append(cell - board.width)
    if row == board.height - 1:
        if col > 0:
            checked.append(cell - 1)
        if col == board.width - 1:
            checked.append(cell)
    for other in checked:
        if search.is_on(other) and search.degree[other] != _opens(board, other):
            return False
    return True


def _sealed_short_of_all(search: _Search, cell: int) -> bool:
    """Whether `cell`'s component is finished and is not the whole track.

    Every cell to the right of or below `cell` is still undecided, so a component is
    finished once none of its cells has such a neighbour. A finished component that
    does not hold both open ends can never grow into the whole track, so the walk
    stops there.
    """
    board = search.board
    component = search.find(cell)
    if any(
        neighbour > cell
        for member in search.on_path
        if search.find(member) == component
        for neighbour in board.orthogonal_neighbours(member)
    ):
        return False
    return not (
        search.is_on(board.entrance)
        and search.is_on(board.exit)
        and search.find(board.entrance) == component
    )


def _single_component(search: _Search) -> bool:
    """Whether the track is one unbroken line from the entrance to the exit."""
    root = search.find(search.board.entrance)
    if search.find(search.board.exit) != root:
        return False
    return all(search.find(member) == root for member in search.on_path)


def _walk(search: _Search, cell: int) -> Iterator[Track]:
    board = search.board
    if cell == board.cell_count:
        exit_ = board.exit
        if (
            search.is_on(exit_)
            and search.degree[exit_] == _opens(board, exit_)
            and _single_component(search)
        ):
            yield tuple(sorted(search.on_path))
        return

    if not _row_closed(search, cell):
        return

    for on in (False, True):
        undo = search.commit(cell) if on else None
        keep = _counts_allow(search, cell) and _settled(search, cell)
        if keep and on:
            keep = not _sealed_short_of_all(search, cell)
        if keep:
            yield from _walk(search, cell + 1)
        if undo is not None:
            search.rollback(undo)


def iter_solutions(board: TrackBoard) -> Iterator[Track]:
    """Yield every solution, each as its sorted cells.

    Unbounded and uncached, for callers that need the solutions themselves. Use
    `count_solutions` when only the number matters.
    """
    search = _Search(board)
    yield from _walk(search, 0)


def count_solutions(board: TrackBoard, *, limit: int = DEFAULT_LIMIT) -> int:
    """Count solutions, stopping at `limit`.

    Returns `min(actual, limit)`, so the default limit of 2 distinguishes zero, one
    and many without paying to enumerate the many — the only question the generator
    asks. Proving a board has *exactly* one solution means exhausting the search,
    which is why the counts in `row_counts` and `col_counts` matter as much to the
    solver as they do to the player.
    """
    if limit < 1:
        raise TrackBoardError(f"limit must be at least 1, got {limit}")
    total = 0
    for _ in iter_solutions(board):
        total += 1
        if total >= limit:
            break
    return total


def has_unique_solution(board: TrackBoard) -> bool:
    """Whether the board has exactly one solution."""
    return count_solutions(board, limit=2) == 1
