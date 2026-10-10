"""Everything that differs between puzzle types, in one place.

A new game has to answer six questions before the pipeline can publish it: what
its files are called, whether the weekly ramp applies to it, whether difficulty is
rated, whether a board can be required to need no guessing, what size and star
count it starts at, and how it generates, solves and deduces. Those answers are
facts about the *type*, so they are collected here rather than re-derived by each
caller.

`tools/verify.py` had the sharpest version of the problem. It decided whether a
file was exempt from the ramp check by looking for `-star` in the filename, which
is a proxy for the type declared inside the file: a 7x7 Queens board named
`2026-10-12-star.json` was accepted on a Monday that targets Medium, because the
name said "star" and the ramp check never ran. Asking the rulebook removes the
guessing, and the id helpers below make the filename and the declared type agree
by construction.

`MarkRulebook` serves both live types because their rules really are the same —
they differ in how many stars a line holds, which `Board.stars_per_row` already
reads. A game whose rules are not mark-based brings its own `Rulebook` and its own
board class, which is why #31 left `Board` square instead of widening it.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date
from typing import Any, Final

from .board import (
    Board,
    BoardError,
    JsonValue,
    Puzzle,
    PuzzleType,
    require_int,
    require_list,
)
from .deduce import DeductionTrace
from .deduce import deduce as deduce_board
from .difficulty import score_difficulty
from .generator import (
    DEFAULT_SIZE,
    GenerationConfig,
    GenerationError,
    generate_puzzle,
)
from .render import render_board
from .solver import DEFAULT_LIMIT, iter_solutions
from .solver import count_solutions as count_board_solutions

#: Star Battle stays at one size until the deduction engine can rate a star board,
#: so there is nothing to ramp towards and the size is pinned rather than tuned.
#: It pins at 9x9, not 8x8: two-star 8x8 boards admit only two mirror-image row
#: patterns, so the board gives itself away after a star or two, while 9x9 keeps
#: 664 distinct arrangements to solve.
STAR_BATTLE_SIZE: Final[int] = 9

#: A Star Battle board is played with two stars per row and column.
STAR_BATTLE_STARS: Final[int] = 2


class RulebookError(ValueError):
    """A puzzle type has no rulebook, or a puzzle id is not a puzzle id."""


class Rulebook(ABC):
    """How one puzzle type is generated, solved, rated, named and published.

    The attributes are the per-type facts, read by the tools; the methods are the
    operations a caller can no longer perform directly, because for a game without
    marks the shared `deduce` and `count_solutions` do not apply.
    """

    #: The type this rulebook describes.
    puzzle_type: PuzzleType

    #: Appended to a date to name this type's files: `2026-10-01-star.json`. The
    #: queens entry is empty, which is what makes the unsuffixed name the queens one.
    id_suffix: str = ""

    #: Whether `WEEKLY_RAMP` applies. The ramp aims at a band per weekday, so a
    #: genre cannot join it until it can record one. Star Battle cannot, for the
    #: reason given under `rated` below.
    on_ramp: bool = True

    #: Whether difficulty is scored and written to the file.
    #:
    #: Star Battle is `False` because the score does not mean what a band claims.
    #: Measured over 25 generated 9x9 two-star boards: 24 scored Nightmare and one
    #: Expert, and every one needed a hypothesis. The score is a weighted count of
    #: deduction firings, so a board with 18 pieces does roughly twice the work of a
    #: 9x9 Queens board and saturates the top band regardless of how the puzzle was
    #: made. Recalibrating the bands per genre would not help either: with almost no
    #: spread in the distribution, any table would call nearly every board the same
    #: thing, which is not a difficulty signal.
    #:
    #: So this stays off until the score measures hardness rather than work — see
    #: the measurement in `docs/journal.md`. Nothing false reaches the player today:
    #: a star file carries no `difficulty`, so the chooser card shows no band.
    rated: bool = True

    #: Whether a board can be required to finish without guessing. The rules do run
    #: on a two-star board, but 0.1% of generated 8x8 boards finish that way, so
    #: offering the gate would reject essentially all of them.
    logic_only: bool = True

    #: Board size this type publishes at when nothing else says otherwise.
    default_size: int = DEFAULT_SIZE

    #: Stars per line, or `None` when the type's regions each hold exactly one.
    default_stars_per_row: int | None = None

    @abstractmethod
    def generate(
        self,
        *,
        seed: int,
        puzzle_id: str,
        size: int | None = None,
        stars_per_row: int | None = None,
        max_attempts: int | None = None,
    ) -> Puzzle:
        """Generate a unique-solution puzzle of this type from `seed`.

        `size` and `stars_per_row` default to this type's published values. Passing
        them overrides for one call — a CLI flag, mostly — and the type still has
        the last word: a queens board asked for two stars per row is an error, not
        a differently-shaped puzzle.
        """

    @abstractmethod
    def count_solutions(self, board: Board, *, limit: int = DEFAULT_LIMIT) -> int:
        """Count this type's solutions on `board`, stopping at `limit`."""

    @abstractmethod
    def deduce(self, board: Board, *, allow_guesses: bool = True) -> DeductionTrace | None:
        """Deduce what `board` forces, or `None` if this type has no such engine."""

    @abstractmethod
    def replay(self, puzzle: Puzzle) -> Puzzle:
        """Regenerate `puzzle` from its own seed.

        This returns a `Puzzle` rather than the generator's config, and that is the
        whole point of the change. `replay_config` used to return a `GenerationConfig`,
        which is `size`-and-stars shaped: it cannot describe a grid that is not square,
        because there is no single number to put in it. Asking each type to rebuild its
        own board is what lets a non-square genre register at all, and it is why
        `verify_replay` holds no branch on the enum.

        How a file maps back onto its generator's knobs is itself a per-type fact: a
        Star Battle file carries its stars-per-row in the first region's capacity, a
        Queens file carries none, and a Train Tracks file carries its width and height.
        """

    @abstractmethod
    def dimensions(self, puzzle: Puzzle) -> tuple[int, int]:
        """The puzzle's grid as `(width, height)`.

        `Puzzle` has no `size` field, because a size is not a property of a puzzle —
        it is a property of the two square genres. A grid that is 5x9 has no size at
        all, and widening the field to `int | None` would put a hole in something the
        tools read directly, while keeping the largest dimension would have the file
        claim to be 9x9. Every reader asks here instead, so a genre that is not square
        is not an exception in any of them.

        Takes the puzzle rather than the board because that is what the callers hold:
        `verify` and `render` have a `Puzzle`, and threading a second argument through
        them to reach a field on the board inside it would be noise.
        """

    @abstractmethod
    def render(self, puzzle: Puzzle) -> str:
        """The puzzle as ASCII, for the CLI, a test failure and the CI log.

        Required rather than optional because `tools.generate` prints a rendering of
        whatever it generated, for every type, without asking whether there is one: a
        type that had none would not fail at generation, it would fail while
        *printing* a result it had already produced, which points the reader at the
        printer rather than at whatever made the puzzle unrenderable.

        It used to be a free function in `render.py` that read `puzzle.size` for its
        header, which is why this is on the contract at all: a caller further out that
        a grep of `puzzle.size` readers would not find is exactly how it got missed.
        """

    @abstractmethod
    def parse_board(self, record: dict[str, Any]) -> Board:
        """The board a file's `board` object describes.

        The schema has already refused the shapes it can express, so this reads the
        fields that are left and applies the invariants it cannot state — array
        lengths tied to a dimension, contiguous region ids, a clue within its line's
        length. It lives here so `parse_puzzle` holds no branch on the enum: a genre
        whose board is not made of regions cannot be parsed by a module that reads
        `regions` itself.
        """

    @abstractmethod
    def board_to_dict(self, board: Board) -> dict[str, JsonValue]:
        """The schema-shaped `board` object for `board`.

        The counterpart to `parse_board`, and the other half of removing that branch
        from `puzzle_to_dict`, which used to decide per type which optional keys to
        write.
        """


class MarkRulebook(Rulebook):
    """The shared rulebook for a game played by placing marks in regions.

    One implementation serves both live types because the mark rules are the same
    code; only the per-type facts differ, and they are set at construction. A game
    that is not played with marks does not use this class.
    """

    def __init__(
        self,
        *,
        puzzle_type: PuzzleType,
        id_suffix: str = "",
        on_ramp: bool = True,
        rated: bool = True,
        logic_only: bool = True,
        default_size: int = DEFAULT_SIZE,
        default_stars_per_row: int | None = None,
    ) -> None:
        self.puzzle_type = puzzle_type
        self.id_suffix = id_suffix
        self.on_ramp = on_ramp
        self.rated = rated
        self.logic_only = logic_only
        self.default_size = default_size
        self.default_stars_per_row = default_stars_per_row

    def generate(
        self,
        *,
        seed: int,
        puzzle_id: str,
        size: int | None = None,
        stars_per_row: int | None = None,
        max_attempts: int | None = None,
    ) -> Puzzle:
        return generate_puzzle(
            seed=seed,
            puzzle_id=puzzle_id,
            config=GenerationConfig(
                size=self.default_size if size is None else size,
                puzzle_type=self.puzzle_type,
                stars_per_row=self.default_stars_per_row
                if stars_per_row is None
                else stars_per_row,
                max_attempts=max_attempts,
            ),
        )

    def count_solutions(self, board: Board, *, limit: int = DEFAULT_LIMIT) -> int:
        return count_board_solutions(board, limit=limit)

    def deduce(self, board: Board, *, allow_guesses: bool = True) -> DeductionTrace | None:
        return deduce_board(board, allow_guesses=allow_guesses)

    def replay(self, puzzle: Puzzle) -> Puzzle:
        # A mark family either plays one mark per line or k per line, and the rulebook
        # already says which it is. So the board's own capacity is the answer for the
        # second case and nothing is the answer for the first — no branch on the enum.
        return generate_puzzle(
            seed=puzzle.seed,
            puzzle_id=puzzle.id,
            config=GenerationConfig(
                size=puzzle.board.size,
                puzzle_type=self.puzzle_type,
                stars_per_row=(
                    puzzle.board.region_capacity[0]
                    if self.default_stars_per_row is not None
                    else None
                ),
            ),
        )

    def dimensions(self, puzzle: Puzzle) -> tuple[int, int]:
        return (puzzle.board.size, puzzle.board.size)

    def render(self, puzzle: Puzzle) -> str:
        best = next(iter_solutions(puzzle.board), None)
        header = f"{puzzle.id} seed={puzzle.seed} size={puzzle.board.size}x{puzzle.board.size}"
        if best is not None:
            return f"{header}\n{render_board(puzzle.board, best)}"
        return f"{header}\n{render_board(puzzle.board)}"

    def parse_board(self, record: dict[str, Any]) -> Board:
        size = require_int(record.get("size"), "board.size")
        regions = tuple(
            require_int(value, "board.regions[]")
            for value in require_list(record.get("regions"), "board.regions")
        )

        # `validate_board` states the same rule with the same wording, so this looks
        # redundant. It is not: the schema allows an empty `regions` array, and the
        # `max()` below would raise "max() arg is an empty sequence" on one before a
        # `Board` was ever constructed to reject it. The check is here to give that
        # case the message a player can act on.
        if len(regions) != size * size:
            raise BoardError(f"regions has {len(regions)} entries, expected {size * size}")

        region_count = max(regions) + 1
        declared = record.get("regionCapacity")
        capacity = (
            tuple(
                require_int(value, "board.regionCapacity[]")
                for value in require_list(declared, "board.regionCapacity")
            )
            if declared is not None
            else (1,) * region_count
        )
        return Board(
            size=size,
            regions=regions,
            region_capacity=capacity,
            puzzle_type=self.puzzle_type,
        )

    def board_to_dict(self, board: Board) -> dict[str, JsonValue]:
        data: dict[str, JsonValue] = {
            "size": board.size,
            "regions": list(board.regions),
        }
        if self.default_stars_per_row is not None:
            data["regionCapacity"] = list(board.region_capacity)
        return data


_RULEBOOKS: Final[dict[PuzzleType, Rulebook]] = {
    PuzzleType.QUEENS: MarkRulebook(puzzle_type=PuzzleType.QUEENS),
    PuzzleType.STAR_BATTLE: MarkRulebook(
        puzzle_type=PuzzleType.STAR_BATTLE,
        id_suffix="-star",
        on_ramp=False,
        rated=False,
        logic_only=False,
        default_size=STAR_BATTLE_SIZE,
        default_stars_per_row=STAR_BATTLE_STARS,
    ),
}


def rulebook_for(puzzle_type: PuzzleType) -> Rulebook:
    """The rulebook for `puzzle_type`.

    Raises rather than returning a default, because a type with no rulebook is a
    type the tools cannot publish, and a default would quietly publish it wrongly.
    """
    book = _RULEBOOKS.get(puzzle_type)
    if book is None:
        raise RulebookError(f"no rulebook registered for {puzzle_type}")
    return book


def rulebooks() -> tuple[Rulebook, ...]:
    """Every registered rulebook, in publication order."""
    return tuple(_RULEBOOKS.values())


def verify_replay(puzzle: Puzzle) -> Puzzle:
    """Regenerate `puzzle` from its seed and confirm the file describes it exactly.

    This is the CI check in the daily pipeline: a puzzle file is trustworthy
    only if the committed regions are exactly what the seed produces, under the
    algorithm the file claims. The config comes from the type's own rulebook, so a
    Star Battle file replays through the Star Battle path without this function
    knowing that Star Battle exists.

    All three recorded facts are compared, not just the board. The version check
    is the one that was missing: `generator_version` exists to say which
    algorithm produced the puzzle, and nothing compared it, so a file could carry
    another algorithm's number and still verify — which is precisely the
    corruption a future schema migration would introduce by relabelling files it
    did not regenerate.
    """
    book = rulebook_for(puzzle.puzzle_type)
    regenerated = book.replay(puzzle)
    if regenerated.board != puzzle.board:
        raise GenerationError(
            f"replay mismatch for {puzzle.id}: seed {puzzle.seed} produced a different board"
        )
    if regenerated.generator_version != puzzle.generator_version:
        raise GenerationError(
            f"version mismatch for {puzzle.id}: file records generator version "
            f"{puzzle.generator_version}, but a {puzzle.puzzle_type.value} board replays "
            f"through version {regenerated.generator_version}"
        )
    if puzzle.difficulty is not None:
        achieved = score_difficulty(regenerated.board).level
        if achieved != puzzle.difficulty:
            raise GenerationError(
                f"difficulty mismatch for {puzzle.id}: recorded level {puzzle.difficulty}, "
                f"the board scores {achieved}"
            )
    return regenerated


def puzzle_id(day: date, puzzle_type: PuzzleType) -> str:
    """The id this type's file carries for `day`, e.g. `2026-10-01-star`."""
    return f"{day.isoformat()}{rulebook_for(puzzle_type).id_suffix}"


def split_puzzle_id(value: str) -> tuple[date, PuzzleType] | None:
    """The day and type a puzzle id names, or `None` if it names neither.

    The type comes from the suffix, so this is the one place that reads a type out
    of a name. Callers that have the file's contents should still prefer the
    declared `type`; `tools/verify.py` compares the two rather than choosing, which
    is how a mislabelled file gets caught instead of trusted.
    """
    for book in rulebooks():
        suffix = book.id_suffix
        if suffix and not value.endswith(suffix):
            continue
        stem = value[: len(value) - len(suffix)] if suffix else value
        try:
            day = date.fromisoformat(stem)
        except ValueError:
            continue
        # `fromisoformat` also accepts the compact and ISO-week spellings
        # ("20261012", "2026-W42-1"). The app's `isPuzzleId` only routes the
        # canonical `YYYY-MM-DD`, so a file named any other way would be a puzzle
        # `verify` approves and the app can never load.
        if stem != day.isoformat():
            continue
        return day, book.puzzle_type
    return None


__all__ = [
    "STAR_BATTLE_SIZE",
    "STAR_BATTLE_STARS",
    "MarkRulebook",
    "Rulebook",
    "RulebookError",
    "puzzle_id",
    "rulebook_for",
    "rulebooks",
    "split_puzzle_id",
]
