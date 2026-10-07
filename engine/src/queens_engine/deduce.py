"""Deduction engine: what does a board *force*, given the rules?

The solver knows a board's solutions; it cannot say how a human might reach one.
This module replays deduction instead of search: it applies sound rules to the
candidate cells until no rule fires (a fixpoint), recording each application.
A board whose fixpoint leaves every row, column and region decided is provably
solvable by logic alone. One that stalls is not *wrong* — the rule set is finite
— it just needs reasoning this engine does not have, which is exactly the "soft
signal" the difficulty note in the README describes. We do not pretend
"solvable without guessing" is formally decidable; we measure what this engine
can prove.

The engine works in *counts*, not booleans. Every rule is stated in terms of how
many stars a group still needs (`need`) and how many cells it has left (`free`),
so the same rules cover a one-star group (Queens) and a two-star group (Star
Battle) with no per-type branching in the rules themselves. `Board.stars_per_row`
supplies k. Where a rule is genuinely a one-star rule, the docstring says so and
explains why the general form would be unsound.

Rules (each firing removes at least one candidate, so the engine terminates):

- ``single-region`` / ``single-row`` / ``single-column``: a region, row or
  column with exactly one candidate left, and exactly one star still to place,
  must place it there. Weight 1.
- ``fill``: a group that still needs exactly as many stars as it has candidate
  cells has no slack — every one of those cells is a star. Only reachable when
  k > 1, since a one-star group that hits this case is the single rule above.
  Weight 2.
- ``intersection``: if every candidate of a region lies in a single row (resp.
  column), the two share all their remaining stars, and when those counts match
  the other group's spare candidates are dead. Mirrored for lines. Weight 2.
- ``subset``: a pigeonhole step. If k groups between them still need n stars and
  can only place them in fewer than n groups, the board is impossible; if they
  can only place them in exactly n, those n own every one, so every other group
  loses the cells it had there. Weight 4.

Pure logic can still stall. `deduce` can then continue with a bounded
hypothesis search: hypothesise a star on a candidate cell; if that leads to a
contradiction, the cell is proven dead (a genuine deduction, courtesy of the
unique solution the generator guarantees). Weight of any trial step is 5.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from itertools import combinations
from typing import Final, Literal

from queens_engine.board import Board

SINGLE_REGION: Final[str] = "single-region"
SINGLE_ROW: Final[str] = "single-row"
SINGLE_COLUMN: Final[str] = "single-column"
FILL: Final[str] = "fill"
INTERSECTION: Final[str] = "intersection"
SUBSET: Final[str] = "subset"
TRIAL: Final[str] = "trial"

#: How many branch states the hypothesis search may visit. Small and explicit:
#: the search exists to *score* a board, not to replace the exact solver.
DEFAULT_GUESS_CAP: Final[int] = 512

#: An intersection binds nothing unless it spans at least two groups, and a
#: pigeonhole needs at least two groups. Both are "why bother" cutoffs. Neither
#: is about stars per group: a region needing two stars and confined to one row
#: is already a claim, and saying so early only makes the trace noisier.
MIN_FREE_TO_BIND: Final[int] = 2

#: Outcome codes for `_guess_search`: a solved branch, a proven dead end, or a
#: node budget reached. `_EXHAUSTED` means "could not conclude", not "wrong".
DEAD: Final[int] = 0
SOLVED: Final[int] = 1
EXHAUSTED: Final[int] = 2

#: Group kinds, for the rules that reason across two kinds at once.
_REGION: Final[int] = 0
_ROW: Final[int] = 1
_COL: Final[int] = 2

#: Every pair of distinct kinds, both directions: region↔row, region↔column and
#: row↔column. The row↔column case is the X-wing players know; the other two are
#: its locked-candidate cousins.
_GROUP_PAIRS: Final[tuple[tuple[int, int], ...]] = (
    (_REGION, _ROW),
    (_REGION, _COL),
    (_ROW, _COL),
    (_COL, _ROW),
    (_ROW, _REGION),
    (_COL, _REGION),
)


class DeductionError(ValueError):
    """The deduction engine cannot make sense of a board."""


@dataclass(frozen=True, slots=True)
class DeductionStep:
    """One rule application that changed the candidate cells."""

    rule: str
    round: int
    queen: int | None
    cells: tuple[int, ...]


@dataclass(frozen=True, slots=True)
class DeductionTrace:
    """Ordered record of how a board was (or was not) logically solved."""

    solved: bool
    needs_guessing: bool
    steps: tuple[DeductionStep, ...]
    rounds: int
    guesses: int
    exhausted: bool
    solution: tuple[int, ...] | None

    @property
    def rule_counts(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for step in self.steps:
            counts[step.rule] = counts.get(step.rule, 0) + 1
        return counts


class _State:
    """Live candidate board: which cells could still hold a star.

    `*_need` counts the stars a group still has to place; `free_*` counts the
    cells it has left to put them in. A group is finished when its need reaches
    zero, which is the only condition any rule needs to test — so a one-star
    group and a two-star group travel through exactly the same code.
    """

    __slots__ = (
        "board",
        "cand",
        "cells_of_region",
        "col_need",
        "contradict",
        "free_cols",
        "free_regions",
        "free_rows",
        "queens",
        "region_need",
        "region_of",
        "row_need",
        "total",
    )

    def __init__(self, board: Board) -> None:
        self.board = board
        size = board.size
        stars = board.stars_per_row
        self.region_of = board.regions
        self.cells_of_region = tuple(
            board.cells_of_region(region) for region in range(board.region_count)
        )
        self.cand = bytearray([1] * board.cell_count)
        self.row_need = [stars] * size
        self.col_need = [stars] * size
        self.region_need = list(board.region_capacity)
        self.free_rows = [size] * size
        self.free_cols = [size] * size
        self.free_regions = [len(cells) for cells in self.cells_of_region]
        self.queens: list[int] = []
        self.contradict = False
        self.total = stars * size

    def fork(self) -> _State:
        clone = _State.__new__(_State)
        clone.board = self.board
        clone.region_of = self.region_of
        clone.cells_of_region = self.cells_of_region
        clone.cand = bytearray(self.cand)
        clone.row_need = list(self.row_need)
        clone.col_need = list(self.col_need)
        clone.region_need = list(self.region_need)
        clone.free_rows = list(self.free_rows)
        clone.free_cols = list(self.free_cols)
        clone.free_regions = list(self.free_regions)
        clone.queens = list(self.queens)
        clone.contradict = self.contradict
        clone.total = self.total
        return clone


def _eliminate(state: _State, cell: int) -> bool:
    """Return True if `cell` was still a candidate and is now dead."""
    if not state.cand[cell]:
        return False
    state.cand[cell] = 0
    row, col = state.board.coords(cell)
    state.free_rows[row] -= 1
    state.free_cols[col] -= 1
    state.free_regions[state.region_of[cell]] -= 1
    return True


def _adjacent(board: Board, cell: int) -> tuple[int, ...]:
    """Every cell a star at `cell` rules out by the no-touching rule.

    The rule is the same for both puzzle types: no two stars in neighbouring
    cells, including diagonally. Only the *count* per row, column and region
    changes from one star to k.
    """
    row, col = board.coords(cell)
    found: list[int] = []
    for d_row in (-1, 0, 1):
        for d_col in (-1, 0, 1):
            if d_row == 0 and d_col == 0:
                continue
            next_row, next_col = row + d_row, col + d_col
            if 0 <= next_row < board.size and 0 <= next_col < board.size:
                found.append(board.index(next_row, next_col))
    return tuple(found)


def _place_queen(state: _State, cell: int) -> tuple[int, ...]:
    """Place a star at `cell` and kill everything it rules out.

    A group only empties when its last star lands, so at k > 1 the row, column
    and region survive their earlier stars — which is the whole difference
    between a one-star and a many-star board.

    Returns the cells newly eliminated as a side effect of the placement.
    """
    row, col = state.board.coords(cell)
    region = state.region_of[cell]
    state.queens.append(cell)
    state.row_need[row] -= 1
    state.col_need[col] -= 1
    state.region_need[region] -= 1

    # Consume the cell itself. At k = 1 the sweeps below already do it, because
    # the last star empties its row and column; at k > 1 they do not, and a cell
    # left as a candidate can be placed a second time — so the engine would fill
    # its state with repeats and report a solution the solver never found. Done
    # last, after the sweeps, so the reported elimination set stays exactly what
    # a one-star board has always reported.
    dead: list[int] = []
    row_full = state.row_need[row] == 0
    col_full = state.col_need[col] == 0
    if row_full or col_full:
        for c in range(state.board.size):
            if row_full:
                in_row = state.board.index(row, c)
                if _eliminate(state, in_row):
                    dead.append(in_row)
            if col_full:
                in_col = state.board.index(c, col)
                if _eliminate(state, in_col):
                    dead.append(in_col)
    if state.region_need[region] == 0:
        dead.extend(v for v in state.cells_of_region[region] if _eliminate(state, v))
    dead.extend(v for v in _adjacent(state.board, cell) if _eliminate(state, v))

    if state.cand[cell]:
        state.cand[cell] = 0
        state.free_rows[row] -= 1
        state.free_cols[col] -= 1
        state.free_regions[region] -= 1
    return tuple(dead)


def _contradiction(state: _State) -> bool:
    """A group that still needs stars but has fewer cells left than stars."""
    return (
        _short(state.row_need, state.free_rows)
        or _short(state.col_need, state.free_cols)
        or _short(state.region_need, state.free_regions)
    )


def _short(need: list[int], free: list[int]) -> bool:
    return any(n > 0 and f < n for n, f in zip(need, free, strict=True))


def _solved(state: _State) -> bool:
    return len(state.queens) == state.total


def _single_candidate(state: _State, cells: tuple[int, ...]) -> int | None:
    found: list[int] = []
    for cell in cells:
        if state.cand[cell]:
            found.append(cell)
            if len(found) > 1:
                return None
    return found[0] if found else None


def _group_cells(state: _State, kind: int, group: int) -> tuple[int, ...]:
    """Every cell belonging to `group` of the given kind, row-major."""
    if kind == _REGION:
        return state.cells_of_region[group]
    return _row_cells(state.board, group) if kind == _ROW else _col_cells(state.board, group)


def _rule_singles(state: _State, trace: list[DeductionStep], round_num: int) -> bool:
    """Groups with no slack left, and groups down to their last cell.

    Two shapes, and the first is a special case of the second at k = 1:

    - one star to place and one cell to put it in: place it there;
    - no slack at all — the group still needs exactly as many stars as it has
      candidate cells, so every one of them is a star. This is the rule that
      makes many-star boards tractable, and it is unreachable at k = 1, where
      "one star, one cell" is already the single above.

    The three kinds of group are identical in form, so one loop covers them
    rather than three copies that could drift apart.
    """
    needs = (state.region_need, state.row_need, state.col_need)
    frees = (state.free_regions, state.free_rows, state.free_cols)
    singles = (SINGLE_REGION, SINGLE_ROW, SINGLE_COLUMN)
    changed = False
    for kind in (_REGION, _ROW, _COL):
        need_by_group, free_by_group = needs[kind], frees[kind]
        for group in range(_group_count(state, kind)):
            need = need_by_group[group]
            if need == 0:
                continue
            if need == 1 and free_by_group[group] == 1:
                cell = _single_candidate(state, _group_cells(state, kind, group))
                if cell is not None:
                    _place_queen(state, cell)
                    trace.append(DeductionStep(singles[kind], round_num, cell, ()))
                    changed = True
            elif need == free_by_group[group]:
                for cell in _group_cells(state, kind, group):
                    if state.cand[cell]:
                        _place_queen(state, cell)
                        trace.append(DeductionStep(FILL, round_num, cell, ()))
                        changed = True
    return changed


def _row_cells(board: Board, row: int) -> tuple[int, ...]:
    start = row * board.size
    return tuple(range(start, start + board.size))


def _col_cells(board: Board, col: int) -> tuple[int, ...]:
    return tuple(range(col, board.cell_count, board.size))


def _rule_intersections(state: _State, trace: list[DeductionStep], round_num: int) -> bool:
    changed: list[bool] = []
    changed.append(_regions_claim_lines(state, trace, round_num))
    changed.append(_lines_claim_regions(state, trace, round_num))
    return any(changed)


def _kill(
    state: _State, victims: list[int], trace: list[DeductionStep], rule: str, round_num: int
) -> bool:
    dead = [cell for cell in victims if _eliminate(state, cell)]
    if dead:
        trace.append(DeductionStep(rule, round_num, None, tuple(dead)))
        return True
    return False


def _homes_capacity(state: _State, kind: int, homes: set[int]) -> int:
    """How many stars the given groups can still take between them.

    A pigeonhole has to compare like with like: k regions needing n stars are
    only impossible if the rows they can reach have room for fewer than n, and
    "room" is each row's *remaining need*, not its existence. At k = 1 the two
    coincide, which is why the original rule could count rows.
    """
    need = _needs(state, kind)
    return sum(need[group] for group in homes)


def _needs(state: _State, kind: int) -> list[int]:
    if kind == _REGION:
        return state.region_need
    return state.row_need if kind == _ROW else state.col_need


def _group_count(state: _State, kind: int) -> int:
    """How many groups of `kind` this board has.

    Rows and columns are always `size`. Regions are whatever the board declares.
    Every board `Board` accepts ties the two counts together — Queens forces one
    region per row, Star Battle forces `size` regions sharing one capacity — but
    the machinery still reads the region count it was handed rather than trusting
    `size`, so a future genre that decouples them is counted correctly on day one.
    Iterating regions over `size` was a real crash on a board with fewer regions
    and quietly skipped some on a board with more.
    """
    return state.board.region_count if kind == _REGION else state.board.size


def _regions_claim_lines(state: _State, trace: list[DeductionStep], round_num: int) -> bool:
    """Region -> rows / columns: those lines hold the region's remaining stars.

    A region needing n stars whose candidates reach fewer than n stars' worth of
    line space is impossible. That is a contradiction, not an elimination.

    The elimination needs the counts to *balance*: if the region can only reach
    lines with room for exactly n, those lines are spoken for, so nothing else
    may use the cells it had in them. At k = 1 this is the familiar "the region's
    queen is in that row, so the rest of the row is dead" — n = 1, and a single
    reachable line. Spreading it the other way, "the region has candidates in
    exactly n lines", would be unsound at k > 1, because a region may put both
    its stars in one row and none in another.

    Groups with no slack are skipped: a region whose free cells equal its need
    has already been dealt with by the single or fill rule, and a claim about it
    would only restate them.
    """
    changed = False
    size = state.board.size
    for region in range(_group_count(state, _REGION)):
        need = state.region_need[region]
        if need == 0 or state.free_regions[region] <= need:
            continue
        rows: set[int] = set()
        cols: set[int] = set()
        for cell in state.cells_of_region[region]:
            if state.cand[cell]:
                row, col = state.board.coords(cell)
                rows.add(row)
                cols.add(col)
        room_rows = _homes_capacity(state, _ROW, rows)
        room_cols = _homes_capacity(state, _COL, cols)
        if room_rows < need or room_cols < need:
            state.contradict = True
            return True
        if room_rows == need:
            victims = [
                state.board.index(row, c)
                for row in rows
                for c in range(size)
                if state.region_of[state.board.index(row, c)] != region
            ]
            changed = _kill(state, victims, trace, INTERSECTION, round_num) or changed
        if room_cols == need:
            victims = [
                state.board.index(r, col)
                for col in cols
                for r in range(size)
                if state.region_of[state.board.index(r, col)] != region
            ]
            changed = _kill(state, victims, trace, INTERSECTION, round_num) or changed
    return changed


def _lines_claim_regions(state: _State, trace: list[DeductionStep], round_num: int) -> bool:
    """Row / column -> regions: those regions hold the line's remaining stars.

    The mirror of `_regions_claim_lines`, with the same counting rule: a line
    needing n stars cannot reach less than n stars' worth of region room, and it
    consumes that room only when the counts balance. As there, a line with no
    slack left is the single or fill rule's business, not this one's.
    """
    changed = False
    size = state.board.size
    for kind in (_ROW, _COL):
        need_by_group = _needs(state, kind)
        free_by_group = state.free_rows if kind == _ROW else state.free_cols
        for group in range(size):
            need = need_by_group[group]
            if need == 0 or free_by_group[group] <= need:
                continue
            regions = {
                state.region_of[cell]
                for cell in _group_cells(state, kind, group)
                if state.cand[cell]
            }
            room = _homes_capacity(state, _REGION, regions)
            if room < need:
                state.contradict = True
                return True
            if room == need:
                axis = 0 if kind == _ROW else 1
                victims = [
                    cell
                    for region in regions
                    for cell in state.cells_of_region[region]
                    if state.board.coords(cell)[axis] != group
                ]
                changed = _kill(state, victims, trace, INTERSECTION, round_num) or changed
    return changed


def _rule_subsets(state: _State, trace: list[DeductionStep], round_num: int) -> bool:
    """Pigeonhole across any pair of group types.

    Take some groups of one kind that still need a total of n stars, and see
    which groups of the other kind they can reach. If those have room for fewer
    than n, the board is impossible. If they have room for exactly n, every one
    of those stars lands there, so every other group loses the cells it had in
    them. Applied across regions, rows and columns in all six directions — the
    row↔column case is the X-wing players know; row↔region and region↔column are
    its locked-candidate cousins. At k = 1 the room is just the number of groups
    reached, which is the original formulation.
    """
    changed = False
    for source, home in _GROUP_PAIRS:
        if _subset_one(state, trace, round_num, source, home):
            changed = True
        if state.contradict:
            return True
    return changed


def _subset_one(
    state: _State,
    trace: list[DeductionStep],
    round_num: int,
    source: int,
    home: int,
) -> bool:
    size = state.board.size
    changed = False
    region_of = state.region_of
    cell_count = state.board.cell_count
    needs = (state.region_need, state.row_need, state.col_need)
    source_need = needs[source]

    def source_index(cell: int) -> int:
        if source == _REGION:
            return region_of[cell]
        row, col = divmod(cell, size)
        return row if source == _ROW else col

    def home_index(cell: int) -> int:
        if home == _REGION:
            return region_of[cell]
        row, col = divmod(cell, size)
        return row if home == _ROW else col

    unplaced = [g for g in range(_group_count(state, source)) if source_need[g] > 0]
    if len(unplaced) < MIN_FREE_TO_BIND:
        return False

    for k in range(2, len(unplaced) + 1):
        for combo in combinations(unplaced, k):
            combo_set = set(combo)
            homes: set[int] = set()
            stars = 0
            for group in combo:
                stars += source_need[group]
                for cell in _group_cells(state, source, group):
                    if state.cand[cell]:
                        homes.add(home_index(cell))
            room = _homes_capacity(state, home, homes)
            if room < stars:
                state.contradict = True
                return True
            if room != stars:
                continue
            victims = [
                cell
                for cell in range(cell_count)
                if state.cand[cell]
                and home_index(cell) in homes
                and source_index(cell) not in combo_set
            ]
            dead = [cell for cell in victims if _eliminate(state, cell)]
            if dead:
                trace.append(DeductionStep(SUBSET, round_num, None, tuple(dead)))
                changed = True
    return changed


@dataclass(frozen=True, slots=True)
class ForcedMove:
    """One hinted move: place a queen at `cell`, or mark `cell` dead."""

    cell: int
    action: Literal["queen", "x"]
    rule: str


def first_forced_move(
    board: Board, *, queens: Iterable[int] = (), marks: Iterable[int] = ()
) -> ForcedMove | None:
    """The first move the pure rules force from a player state, or `None`.

    This is the engine's half of the app's hint engine: the app's TypeScript
    `firstHint` is a port of this function's rule order (singles, then
    intersections, then subsets, all within the first round), pinned by the
    shared `conformance/hint-cases/` suite asserted from both languages.

    `None` means nothing is forced — either the board is complete or the rules
    have stalled. A contradictory *queen* position must be rejected by the caller
    before calling: the app validates queens with `conflicts` first, because a
    poisoned candidate state would produce nonsense hints.

    The `queens` argument holds the stars already placed. The name predates Star
    Battle, where the same list is a set of stars; it is kept so the engine and
    the app name the same thing.
    """
    state = _State(board)
    for cell in marks:
        _eliminate(state, cell)
    for queen in queens:
        _place_queen(state, queen)

    trace: list[DeductionStep] = []
    if _rule_singles(state, trace, 1) or _rule_intersections(state, trace, 1):
        pass
    else:
        _rule_subsets(state, trace, 1)
    if not trace:
        return None
    step = trace[0]
    cell = step.queen if step.queen is not None else step.cells[0]
    action: Literal["queen", "x"] = (
        "queen" if step.rule in (SINGLE_REGION, SINGLE_ROW, SINGLE_COLUMN, FILL) else "x"
    )
    return ForcedMove(cell=cell, action=action, rule=step.rule)


def _run_pure_rules(state: _State, trace: list[DeductionStep], rounds_seen: list[int]) -> None:
    """Apply rules to a fixpoint; nothing here ever guesses."""
    round_num = 0
    while not state.contradict and not _solved(state):
        round_num += 1
        changed = _rule_singles(state, trace, round_num)
        changed = _rule_intersections(state, trace, round_num) or changed
        changed = _rule_subsets(state, trace, round_num) or changed
        if not changed:
            break
    rounds_seen[0] = max(rounds_seen[0], round_num)


def _pick_guess(state: _State) -> int | None:
    """The first candidate of the most constrained unfinished region.

    Ranked by *slack* — candidate cells beyond the ones it must fill — rather
    than by cell count, so a region that needs both of its stars placed soon
    beats a wide one that only needs one.
    """
    best = min(
        (region for region in range(_group_count(state, _REGION)) if state.region_need[region] > 0),
        key=lambda region: (state.free_regions[region] - state.region_need[region], region),
        default=None,
    )
    if best is None:
        return None
    for cell in state.cells_of_region[best]:
        if state.cand[cell]:
            return cell
    return None


def _guess_search(
    state: _State,
    trace: list[DeductionStep],
    rounds_seen: list[int],
    used: list[int],
    cap: int,
) -> tuple[int, _State | None]:
    """Depth-first hypothesis search with contradiction-based elimination.

    Returns `(SOLVED, solved_state)` if a solution was completed, `(DEAD,
    None)` if this branch is a proven dead end, or `(EXHAUSTED, None)` if the
    node budget ran out.
    """
    used[0] += 1
    if used[0] > cap:
        return EXHAUSTED, None

    _run_pure_rules(state, trace, rounds_seen)
    if _solved(state):
        return SOLVED, state
    if state.contradict or _contradiction(state):
        return DEAD, None

    cell = _pick_guess(state)
    branch = state.fork() if cell is not None else None
    if cell is not None and branch is not None:
        dead = _place_queen(branch, cell)
        trace.append(DeductionStep(TRIAL, rounds_seen[0], cell, dead))
        outcome, solved_state = _guess_search(branch, trace, rounds_seen, used, cap)
        if outcome == SOLVED:
            return SOLVED, solved_state
        if outcome == DEAD:
            # A queen here contradicts the rules, so the cell is proven dead.
            if _eliminate(state, cell):
                trace.append(DeductionStep(TRIAL, rounds_seen[0], None, (cell,)))
            return _guess_search(state, trace, rounds_seen, used, cap)
    return EXHAUSTED, None


def deduce(
    board: Board,
    *,
    allow_guesses: bool = True,
    guess_cap: int = DEFAULT_GUESS_CAP,
) -> DeductionTrace:
    """Deduce everything the board forces, optionally confirming the rest.

    Works for both puzzle types: the rules read `Board.stars_per_row`, so a
    Queens board (k = 1) and a Star Battle board (k = 2) run the same code.

    With `allow_guesses=False` the engine stops at the first fixpoint: a board
    it cannot finish is reported as `needs_guessing=True`. That is the "not
    proveable by this rule set" signal, not a proof of impossibility. With
    `allow_guesses=True` the engine continues by hypothesis and returns a full
    solution whenever one exists.
    """
    if guess_cap < 1:
        raise DeductionError(f"guess_cap must be at least 1, got {guess_cap}")

    state = _State(board)
    steps: list[DeductionStep] = []
    rounds_seen = [0]
    _run_pure_rules(state, steps, rounds_seen)

    if _solved(state):
        return _finalize(
            state, steps, rounds_seen, guesses=0, exhausted=False, needs_guessing=False
        )

    if not allow_guesses:
        return _finalize(
            state,
            steps,
            rounds_seen,
            guesses=0,
            exhausted=False,
            needs_guessing=True,
        )

    used = [0]
    outcome, solved_state = _guess_search(state, steps, rounds_seen, used, guess_cap)
    guesses = sum(1 for step in steps if step.rule == TRIAL)
    if outcome == SOLVED and solved_state is not None:
        return _finalize(
            solved_state,
            steps,
            rounds_seen,
            guesses=guesses,
            exhausted=False,
            needs_guessing=guesses > 0,
        )
    return _finalize(
        state,
        steps,
        rounds_seen,
        guesses=guesses,
        exhausted=outcome == EXHAUSTED,
        needs_guessing=True,
    )


def _finalize(
    state: _State,
    steps: list[DeductionStep],
    rounds_seen: list[int],
    *,
    guesses: int,
    exhausted: bool,
    needs_guessing: bool,
) -> DeductionTrace:
    finished = len(state.queens) == state.total
    return DeductionTrace(
        solved=finished,
        needs_guessing=needs_guessing,
        steps=tuple(steps),
        rounds=rounds_seen[0],
        guesses=guesses,
        exhausted=exhausted,
        solution=tuple(sorted(state.queens)) if finished else None,
    )


__all__ = [
    "DEFAULT_GUESS_CAP",
    "FILL",
    "INTERSECTION",
    "SINGLE_COLUMN",
    "SINGLE_REGION",
    "SINGLE_ROW",
    "SUBSET",
    "TRIAL",
    "DeductionError",
    "DeductionStep",
    "DeductionTrace",
    "deduce",
]
