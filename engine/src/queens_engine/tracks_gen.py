"""Train Tracks board generation: a seed in, a uniquely-solvable grid out.

Generation is the same shape as the marks genres — draw something legal, prove it has
one solution, and redraw if it does not — but it can do better than blind redrawing,
because a Train Tracks board has *givens* and each one is a clue that shrinks the
solution space. So rather than throw a whole route away when it comes out ambiguous,
the generator freezes more of the route into `givens` and tries again on the same
route. That turns a coin flip into a short climb.

Both end pieces are always given, which the format requires and which is what pins the
line's two ends to the grid edge.

`generate_grid` deliberately returns a `TrackGrid` rather than a `Puzzle`: a puzzle file
needs a type, a schema and a rulebook, and this type is not registered yet. Producing
the grid is the part with the algorithm in it.
"""

from __future__ import annotations

from typing import Final

from .prng import Prng
from .tracks import (
    EAST,
    LINE_ENDS,
    NORTH,
    PIECE_ENDS,
    SOUTH,
    WEST,
    TrackGrid,
    TrackGridError,
    count_solutions,
)

#: Directions in clockwise order, which is the order a random walk should prefer.
_CLOCKWISE: Final[tuple[int, ...]] = (EAST, SOUTH, WEST, NORTH)

#: How many givens to aim for, as a fraction of the cells the route uses. Enough to
#: make a route uniquely solvable on a grid this size without giving the whole line.
_GIVEN_SHARE: Final = 3

#: Draws to make per attempt before giving up on a route.
_ROUTE_TRIES: Final = 200

#: How many routes to try before reporting that this seed produced nothing.
_ROUTES: Final = 12

#: The smallest route worth publishing: two end cells and one between them.
_MIN_ROUTE: Final = 3

#: How much of the grid the line should fill, as a fraction. A sparse line is easy to
#: pin down and dull to solve — a handful of cells on a 7x7 has one answer and no
#: decision to make — so the walk aims high and lets uniqueness be the binding
#: constraint rather than the length.
_FILL_LOW: Final = 2
_FILL_HIGH: Final = 4

#: A route shorter than this share of what it aimed for is thrown away rather than
#: published. A greedy walk boxes itself in often enough that some routes come out at
#: a third of the target, and a line that short has one obvious answer and nothing to
#: decide — technically a puzzle, and not worth a day's slot.
_MIN_FILL: Final = 2

#: The floor is a share of the *grid*, not of what the walk happened to aim for. Held
#: only against the target, a low draw slips under it: seed 54 came out with a six-cell
#: line on a 7x7, which is what the tests here claim to reject.
_FLOOR_SHARE: Final = 5

#: Enough of a grid to hold one. The real limits are much larger; this only stops a
#: nonsensical call before the walk starts.
_MIN_SIDE: Final = 2


class TrackGenerationError(ValueError):
    """No uniquely-solvable grid could be produced from this seed."""


def _piece_index(a: int, b: int) -> int:
    for index, ends in enumerate(PIECE_ENDS):
        if set(ends) == {a, b}:
            return index
    raise TrackGridError(f"no piece joins {a} and {b}")


def _step(grid_width: int, grid_height: int, cell: int, direction: int) -> int | None:
    row, col = divmod(cell, grid_width)
    match direction:
        case 0:
            return None if row == 0 else cell - grid_width
        case 1:
            return None if col == grid_width - 1 else cell + 1
        case 2:
            return None if row == grid_height - 1 else cell + grid_width
        case _:
            return None if col == 0 else cell - 1


def _facing(grid_width: int, grid_height: int, cell: int, other: int) -> int:
    for direction in _CLOCKWISE:
        if _step(grid_width, grid_height, cell, direction) == other:
            return direction
    raise TrackGridError(f"cell {cell} is not adjacent to {other}")


def _grow_route(grid_width: int, grid_height: int, rng: Prng, target: int) -> list[int]:
    """A self-avoiding route from the left edge to somewhere it can run off.

    Grown from a left-edge cell so the first end can face west into the void, and
    stopped only where a piece would have an end facing off the grid, so the last end
    is legal too. Every cell of the route will take exactly one piece later.
    """
    start = rng.below(grid_height) * grid_width
    route = [start]
    cell, back = start, WEST
    while len(route) < target:
        options = [
            direction
            for direction in _CLOCKWISE
            if direction != back
            and (step := _step(grid_width, grid_height, cell, direction)) is not None
            and step not in route
        ]
        if not options:
            break
        direction = options[rng.below(len(options))]
        step = _step(grid_width, grid_height, cell, direction)
        assert step is not None, "the options are exactly the steps that exist"
        route.append(step)
        cell, back = step, (direction + 2) % 4
    return route


def _route_pieces(
    grid_width: int, grid_height: int, route: list[int], rng: Prng
) -> list[int] | None:
    """The piece each route cell must hold, or `None` if the route cannot end cleanly."""
    last_cell = route[-1]
    exits = [
        direction
        for direction in _CLOCKWISE
        if _step(grid_width, grid_height, last_cell, direction) is None
    ]
    if not exits:
        return None
    exit_dir = exits[rng.below(len(exits))]

    pieces = [0] * (grid_width * grid_height)
    final = len(route) - 1
    for position, cell in enumerate(route):
        if position == 0:
            # Facing west into the void, and joining whatever the route does next —
            # which is not always east, so it is read from the route rather than assumed.
            facing = _facing(grid_width, grid_height, cell, route[1])
            pieces[cell] = _piece_index(WEST, facing)
        elif position == final:
            pieces[cell] = _piece_index(
                exit_dir, _facing(grid_width, grid_height, cell, route[position - 1])
            )
        else:
            pieces[cell] = _piece_index(
                _facing(grid_width, grid_height, cell, route[position - 1]),
                _facing(grid_width, grid_height, cell, route[position + 1]),
            )
    return pieces


def _build(
    grid_width: int, grid_height: int, pieces: list[int], route: list[int], givens: int
) -> TrackGrid:
    """Assemble a grid from a route's pieces and a number of givens."""
    rows = [0] * grid_height
    cols = [0] * grid_width
    for cell in route:
        row, col = divmod(cell, grid_width)
        rows[row] += 1
        cols[col] += 1

    frozen = [0] * (grid_width * grid_height)
    frozen[route[0]] = pieces[route[0]]
    frozen[route[-1]] = pieces[route[-1]]
    interior = [
        cell
        for cell in route[1:-1]
        if rows[divmod(cell, grid_width)[0]] and cols[divmod(cell, grid_width)[1]]
    ]
    for cell in interior[:givens]:
        frozen[cell] = pieces[cell]
    return TrackGrid(grid_width, grid_height, tuple(rows), tuple(cols), tuple(frozen))


def generate_grid(
    *, seed: int, width: int, height: int, max_givens: int | None = None
) -> TrackGrid:
    """A grid with exactly one solution, drawn from `seed`.

    `givens` are added one at a time until the grid is unambiguous, so a route that is
    nearly determined costs one grid and a route that is wide open costs several —
    cheaper than redrawing the route, which throws away the part that was already right.

    Raises `TrackGenerationError` if no route from this seed could be pinned down.
    """
    cells = width * height
    floor = max(_MIN_ROUTE, cells // _FLOOR_SHARE)
    if width < _MIN_SIDE or height < _MIN_SIDE:
        raise TrackGenerationError(f"a track grid needs at least 2x2, got {width}x{height}")
    rng = Prng(seed)

    for _ in range(_ROUTES):
        for _ in range(_ROUTE_TRIES):
            span = max(1, cells // _FILL_LOW)
            target = max(_MIN_ROUTE, cells // _FILL_HIGH + rng.below(span))
            route = _grow_route(width, height, rng, target)
            if len(route) < floor or len(route) * _MIN_FILL < target:
                continue
            pieces = _route_pieces(width, height, route, rng)
            if pieces is None:
                continue
            interior = len(route) - LINE_ENDS
            share = interior // _GIVEN_SHARE
            limit = share if max_givens is None else min(share, max_givens)
            for givens in range(0, limit + 1):
                try:
                    grid = _build(width, height, pieces, route, givens)
                except TrackGridError:
                    break
                if count_solutions(grid, limit=2) == 1:
                    return grid
    raise TrackGenerationError(f"no unique grid from seed {seed}")
