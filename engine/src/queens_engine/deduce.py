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

Rules (each firings removes at least one candidate, so the engine terminates):

- ``single-region`` / ``single-row`` / ``single-column``: a region, row or
  column with exactly one candidate left must place its queen there. Weight 1.
- ``intersection``: if every candidate of a region lies in a single row (resp.
  column), or every candidate of a row (resp. column) lies in a single region,
  the two share the queen and the other's remaining candidates are dead.
  Weight 2.
- ``subset``: a pigeonhole step. If k regions between them can only place in k
  rows, those rows are exactly consumed by those regions, so every other region
  loses the cells it had in them (mirrored for columns). Weight 4.

Pure logic can still stall. `deduce` can then continue with a bounded
hypothesis search: hypothesise a queen on a candidate cell; if that leads to a
contradiction, the cell is proven dead (a genuine deduction, courtesy of the
unique solution the generator guarantees). Weight of any trial step is 5.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from itertools import combinations
from typing import Final, Literal

from queens_engine.board import Board, PuzzleType

SINGLE_REGION: Final[str] = "single-region"
SINGLE_ROW: Final[str] = "single-row"
SINGLE_COLUMN: Final[str] = "single-column"
INTERSECTION: Final[str] = "intersection"
SUBSET: Final[str] = "subset"
TRIAL: Final[str] = "trial"

#: How many branch states the hypothesis search may visit. Small and explicit:
#: the search exists to *score* a board, not to replace the exact solver.
DEFAULT_GUESS_CAP: Final[int] = 512

#: An intersection binds nothing unless the group has at least two candidates,
#: and a pigeonhole needs at least two groups. Both are "why bother" cutoffs.
MIN_FREE_TO_BIND: Final[int] = 2

#: Outcome codes for `_guess_search`: a solved branch, a proven dead end, or a
#: node budget reached. `_EXHAUSTED` means "could not conclude", not "wrong".
DEAD: Final[int] = 0
SOLVED: Final[int] = 1
EXHAUSTED: Final[int] = 2


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
    """Live candidate board: which cells could still hold a queen."""

    __slots__ = (
        "board",
        "cand",
        "cells_of_region",
        "col_has_queen",
        "contradict",
        "free_cols",
        "free_regions",
        "free_rows",
        "queens",
        "region_has_queen",
        "region_of",
        "row_has_queen",
    )

    def __init__(self, board: Board) -> None:
        self.board = board
        size = board.size
        self.region_of = board.regions
        self.cells_of_region = tuple(board.cells_of_region(region) for region in range(size))
        self.cand = bytearray([1] * board.cell_count)
        self.row_has_queen = bytearray(size)
        self.col_has_queen = bytearray(size)
        self.region_has_queen = bytearray(size)
        self.free_rows = [size] * size
        self.free_cols = [size] * size
        self.free_regions = [len(cells) for cells in self.cells_of_region]
        self.queens: list[int] = []
        self.contradict = False

    def fork(self) -> _State:
        clone = _State.__new__(_State)
        clone.board = self.board
        clone.region_of = self.region_of
        clone.cells_of_region = self.cells_of_region
        clone.cand = bytearray(self.cand)
        clone.row_has_queen = bytearray(self.row_has_queen)
        clone.col_has_queen = bytearray(self.col_has_queen)
        clone.region_has_queen = bytearray(self.region_has_queen)
        clone.free_rows = list(self.free_rows)
        clone.free_cols = list(self.free_cols)
        clone.free_regions = list(self.free_regions)
        clone.queens = list(self.queens)
        clone.contradict = self.contradict
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


def _touching(board: Board, cell: int) -> tuple[int, ...]:
    """All (up to eight) neighbours of `cell`, including diagonals."""
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
    """Place the queen at `cell` and kill everything it rules out.

    Returns the cells newly eliminated as a side effect of the placement.
    """
    row, col = state.board.coords(cell)
    region = state.region_of[cell]
    state.queens.append(cell)
    state.row_has_queen[row] = 1
    state.col_has_queen[col] = 1
    state.region_has_queen[region] = 1

    dead: list[int] = []
    for c in range(state.board.size):
        dead.extend(
            victim
            for victim in (state.board.index(row, c), state.board.index(c, col))
            if _eliminate(state, victim)
        )
    dead.extend(v for v in state.cells_of_region[region] if _eliminate(state, v))
    dead.extend(v for v in _touching(state.board, cell) if _eliminate(state, v))
    return tuple(dead)


def _contradiction(state: _State) -> bool:
    """A row, column or region still needs a queen but has no cell left."""
    size = state.board.size
    return (
        any(not state.row_has_queen[row] and state.free_rows[row] == 0 for row in range(size))
        or any(not state.col_has_queen[col] and state.free_cols[col] == 0 for col in range(size))
        or any(
            not state.region_has_queen[region] and state.free_regions[region] == 0
            for region in range(size)
        )
    )


def _solved(state: _State) -> bool:
    return len(state.queens) == state.board.size


def _single_candidate(state: _State, cells: tuple[int, ...]) -> int | None:
    found: list[int] = []
    for cell in cells:
        if state.cand[cell]:
            found.append(cell)
            if len(found) > 1:
                return None
    return found[0] if found else None


def _rule_singles(state: _State, trace: list[DeductionStep], round_num: int) -> bool:
    changed = False
    size = state.board.size
    for region in range(size):
        if state.region_has_queen[region]:
            continue
        if state.free_regions[region] == 1:
            cell = _single_candidate(state, state.cells_of_region[region])
            if cell is not None:
                _place_queen(state, cell)
                trace.append(DeductionStep(SINGLE_REGION, round_num, cell, ()))
                changed = True
    for row in range(size):
        if state.row_has_queen[row]:
            continue
        if state.free_rows[row] == 1:
            cell = _single_candidate(state, tuple(state.board.index(row, c) for c in range(size)))
            if cell is not None:
                _place_queen(state, cell)
                trace.append(DeductionStep(SINGLE_ROW, round_num, cell, ()))
                changed = True
    for col in range(size):
        if state.col_has_queen[col]:
            continue
        if state.free_cols[col] == 1:
            cell = _single_candidate(state, tuple(state.board.index(r, col) for r in range(size)))
            if cell is not None:
                _place_queen(state, cell)
                trace.append(DeductionStep(SINGLE_COLUMN, round_num, cell, ()))
                changed = True
    return changed


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


def _regions_claim_lines(state: _State, trace: list[DeductionStep], round_num: int) -> bool:
    """Region -> one row / one column: that line holds the region's queen."""
    changed = False
    size = state.board.size
    for region in range(size):
        if state.region_has_queen[region] or state.free_regions[region] < MIN_FREE_TO_BIND:
            continue
        rows: set[int] = set()
        cols: set[int] = set()
        for cell in state.cells_of_region[region]:
            if state.cand[cell]:
                row, col = state.board.coords(cell)
                rows.add(row)
                cols.add(col)
        if len(rows) == 1 and not state.row_has_queen[next(iter(rows))]:
            row = next(iter(rows))
            victims = [
                state.board.index(row, c)
                for c in range(size)
                if state.region_of[state.board.index(row, c)] != region
            ]
            changed = _kill(state, victims, trace, INTERSECTION, round_num) or changed
        if len(cols) == 1 and not state.col_has_queen[next(iter(cols))]:
            col = next(iter(cols))
            victims = [
                state.board.index(r, col)
                for r in range(size)
                if state.region_of[state.board.index(r, col)] != region
            ]
            changed = _kill(state, victims, trace, INTERSECTION, round_num) or changed
    return changed


def _lines_claim_regions(state: _State, trace: list[DeductionStep], round_num: int) -> bool:
    """Row / column -> one region: that region holds the line's queen."""
    changed = False
    size = state.board.size
    for row in range(size):
        if state.row_has_queen[row] or state.free_rows[row] < MIN_FREE_TO_BIND:
            continue
        regions = {
            state.region_of[state.board.index(row, c)]
            for c in range(size)
            if state.cand[state.board.index(row, c)]
        }
        if len(regions) == 1 and not state.region_has_queen[next(iter(regions))]:
            region = next(iter(regions))
            victims = [
                cell for cell in state.cells_of_region[region] if state.board.coords(cell)[0] != row
            ]
            changed = _kill(state, victims, trace, INTERSECTION, round_num) or changed
    for col in range(size):
        if state.col_has_queen[col] or state.free_cols[col] < MIN_FREE_TO_BIND:
            continue
        regions = {
            state.region_of[state.board.index(r, col)]
            for r in range(size)
            if state.cand[state.board.index(r, col)]
        }
        if len(regions) == 1 and not state.region_has_queen[next(iter(regions))]:
            region = next(iter(regions))
            victims = [
                cell for cell in state.cells_of_region[region] if state.board.coords(cell)[1] != col
            ]
            changed = _kill(state, victims, trace, INTERSECTION, round_num) or changed
    return changed


def _rule_subsets(state: _State, trace: list[DeductionStep], round_num: int) -> bool:
    """Pigeonhole across any pair of group types.

    If k groups of one type can only place inside k groups of another type,
    those k groups own the k targets, so every other group loses the cells it
    had there. Applied across regions, rows and columns in all six directions —
    the row↔column case is the X-wing players know; row↔region and
    region↔column are its locked-candidate cousins. If k groups fit within
    fewer than k targets, the state is impossible.
    """
    changed = False
    for source, home in _GROUP_PAIRS:
        if _subset_one(state, trace, round_num, source, home):
            changed = True
        if state.contradict:
            return True
    return changed


#: region=0, row=1, column=2. Every pair of distinct kinds, both directions.
_GROUP_PAIRS: Final[tuple[tuple[int, int], ...]] = (
    (0, 1),
    (0, 2),
    (1, 2),
    (2, 1),
    (1, 0),
    (2, 0),
)


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

    def source_index(cell: int) -> int:
        if source == 0:
            return region_of[cell]
        row, col = divmod(cell, size)
        return row if source == 1 else col

    def home_index(cell: int) -> int:
        if home == 0:
            return region_of[cell]
        row, col = divmod(cell, size)
        return row if home == 1 else col

    def source_has_queen(group: int) -> bool:
        if source == 0:
            return bool(state.region_has_queen[group])
        return bool(state.row_has_queen[group]) if source == 1 else bool(state.col_has_queen[group])

    def group_cells(group: int) -> tuple[int, ...]:
        if source == 0:
            return state.cells_of_region[group]
        start = group * size
        return (
            tuple(range(start, start + size))
            if source == 1
            else tuple(range(group, cell_count, size))
        )

    unplaced = [g for g in range(size) if not source_has_queen(g)]
    if len(unplaced) < MIN_FREE_TO_BIND:
        return False

    for k in range(2, len(unplaced) + 1):
        for combo in combinations(unplaced, k):
            combo_set = set(combo)
            homes: set[int] = set()
            for group in combo:
                for cell in group_cells(group):
                    if state.cand[cell]:
                        homes.add(home_index(cell))
            if len(homes) < k:
                state.contradict = True
                return True
            if len(homes) != k:
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
        "queen" if step.rule in (SINGLE_REGION, SINGLE_ROW, SINGLE_COLUMN) else "x"
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
    """The first candidate of the tightest unplaced region, by cell order."""
    size = state.board.size
    best = min(
        (region for region in range(size) if not state.region_has_queen[region]),
        key=lambda region: (state.free_regions[region], region),
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

    With `allow_guesses=False` the engine stops at the first fixpoint: a board
    it cannot finish is reported as `needs_guessing=True`. That is the "not
    proveable by this rule set" signal, not a proof of impossibility. With
    `allow_guesses=True` the engine continues by hypothesis and returns a full
    solution whenever one exists.
    """
    if board.puzzle_type is not PuzzleType.QUEENS:
        raise DeductionError("the deduction engine currently only supports queens boards")
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
    finished = len(state.queens) == state.board.size
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
