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

import json
from abc import ABC, abstractmethod
from dataclasses import replace
from datetime import date
from pathlib import Path
from typing import Any, Final, cast

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
    MAX_SEED,
    GenerationConfig,
    GenerationError,
    generate_puzzle,
)
from .killer_sudoku import Cage, KillerGrid
from .killer_sudoku import solve as solve_killer
from .killer_sudoku_gen import LogicResult as KillerLogicResult
from .killer_sudoku_gen import deduce as deduce_killer
from .killer_sudoku_gen import generate as generate_killer
from .nurikabe import NurikabeGrid
from .nurikabe import solve as solve_nurikabe
from .nurikabe_gen import GENERATOR_VERSION as NURIKABE_GENERATOR_VERSION
from .nurikabe_gen import SIDE as NURIKABE_SIZE
from .nurikabe_gen import NurikabeGenerationError
from .nurikabe_gen import generate as generate_nurikabe_grid
from .render import render_board, render_grid
from .solver import DEFAULT_LIMIT, iter_solutions
from .solver import count_solutions as count_board_solutions
from .sudoku import SIDE as SUDOKU_SIZE
from .sudoku import Level, SudokuGrid
from .sudoku import solve as solve_sudoku
from .sudoku_deduce import DeductionResult
from .sudoku_deduce import deduce as deduce_sudoku
from .sudoku_gen import GENERATOR_VERSION as SUDOKU_GENERATOR_VERSION
from .sudoku_gen import MAX_ATTEMPTS as SUDOKU_SEED_BATCH_SIZE
from .sudoku_gen import SudokuGenerationError
from .sudoku_gen import generate as generate_sudoku_grid
from .sudoku_levels import SUDOKU_START, SUDOKU_VARIANTS, sudoku_variant
from .tents import TentsGrid
from .tents import solutions as tents_solutions
from .tents_gen import GENERATOR_VERSION as TENTS_GENERATOR_VERSION
from .tents_gen import SIDE as TENTS_SIZE
from .tents_gen import TENT_COUNT, TentsGenerationError
from .tents_gen import generate as generate_tents_grid
from .track_sizes import TRACK_SIZES_START, TRACK_VARIANTS, TrackSize, track_variant
from .tracks import TrackGrid
from .tracks import count_solutions as count_track_solutions
from .tracks_gen import TrackGenerationError, generate_grid
from .trio import SIDE as TRIO_SIZE
from .trio import LogicResult, Relation, TrioGrid
from .trio import count_solutions as count_trio_solutions
from .trio import deduce as deduce_trio
from .trio_gen import GENERATOR_VERSION as TRIO_GENERATOR_VERSION
from .trio_gen import TrioGenerationError
from .trio_gen import generate as generate_trio_grid
from .word_paths import (
    SearchBudget,
    WordGrid,
    WordSearchLimitError,
    v1_vocabulary,
    vocabulary_for_version,
)
from .word_paths import count_solutions as count_word_solutions
from .word_paths_gen import generate_grid as generate_word_grid
from .word_paths_gen_v2 import generate_grid as generate_word_grid_v2

#: Star Battle stays at one size until the deduction engine can rate a star board,
#: so there is nothing to ramp towards and the size is pinned rather than tuned.
#: It pins at 9x9, not 8x8: two-star 8x8 boards admit only two mirror-image row
#: patterns, so the board gives itself away after a star or two, while 9x9 keeps
#: 664 distinct arrangements to solve.
STAR_BATTLE_SIZE: Final[int] = 9

#: A Star Battle board is played with two stars per row and column.
STAR_BATTLE_STARS: Final[int] = 2

#: The grid Train Tracks publishes at, in cells.
#:
#: The legacy board size. Named variants use the shared ID contract instead.
TRACKS_WIDTH: Final[int] = 7
TRACKS_HEIGHT: Final[int] = 7

#: Train Tracks versions are independent of other genres: 1 permits zero clues;
#: 2 requires every row and column; 3 scatters givens and bounds search work.
#: All three remain replayable through their original policies.
TRACKS_GENERATOR_VERSION: Final[int] = 3


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

    #: Board size this type publishes at when nothing else says otherwise. A marks
    #: fact: a genre whose grid is not square has no size, and says so through its
    #: own `generate`.
    default_size: int = DEFAULT_SIZE

    #: Whether the daily publisher writes this type's files.
    #:
    #: False for a type that can be generated, parsed, rendered and verified but is
    #: not yet something to serve. Train Tracks registers with this off until the app
    #: can play it: publishing first would put files in the archive that
    #: `tools.hint_baseline` — which runs the *marks* solver over every committed
    #: puzzle — and the app's own parser would both choke on.
    published: bool = True

    #: Move beyond a failed generation batch instead of retrying its rejected seeds.
    seed_batch_size: int = 1

    #: Stars per line, or `None` when the type's regions each hold exactly one.
    default_stars_per_row: int | None = None

    def daily_ids(self, day: date) -> tuple[str, ...]:
        """The slots this family publishes on a calendar day."""
        return (puzzle_id(day, self.puzzle_type),)

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
    def count_solutions(
        self,
        board: Board
        | TrackGrid
        | WordGrid
        | TrioGrid
        | TentsGrid
        | SudokuGrid
        | NurikabeGrid
        | KillerGrid,
        *,
        limit: int = DEFAULT_LIMIT,
    ) -> int:
        """Count this type's solutions on `board`, stopping at `limit`."""

    @abstractmethod
    def deduce(
        self,
        board: Board
        | TrackGrid
        | WordGrid
        | TrioGrid
        | TentsGrid
        | SudokuGrid
        | NurikabeGrid
        | KillerGrid,
        *,
        allow_guesses: bool = True,
    ) -> DeductionTrace | LogicResult | DeductionResult | KillerLogicResult | None:
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
    def parse_board(
        self, record: dict[str, Any], *, generator_version: int = 1
    ) -> (
        Board | TrackGrid | WordGrid | TrioGrid | TentsGrid | SudokuGrid | NurikabeGrid | KillerGrid
    ):
        """The board a file's `board` object describes.

        The schema has already refused the shapes it can express, so this reads the
        fields that are left and applies the invariants it cannot state — array
        lengths tied to a dimension, contiguous region ids, a clue within its line's
        length. It lives here so `parse_puzzle` holds no branch on the enum: a genre
        whose board is not made of regions cannot be parsed by a module that reads
        `regions` itself.
        """

    @abstractmethod
    def board_to_dict(
        self,
        board: Board
        | TrackGrid
        | WordGrid
        | TrioGrid
        | TentsGrid
        | SudokuGrid
        | NurikabeGrid
        | KillerGrid,
    ) -> dict[str, JsonValue]:
        """The schema-shaped `board` object for `board`.

        The counterpart to `parse_board`, and the other half of removing that branch
        from `puzzle_to_dict`, which used to decide per type which optional keys to
        write.
        """


def as_marks_board(
    board: Board
    | TrackGrid
    | WordGrid
    | TrioGrid
    | TentsGrid
    | SudokuGrid
    | NurikabeGrid
    | KillerGrid,
) -> Board:
    """`board`, if it is a marks board.

    A caller is handed whatever the file carried, so anything that reads marks
    fields has to check rather than assume. Narrowing here names the mismatch at
    the boundary; reaching a marks field on a track grid would otherwise fail deep
    inside the solver, where nothing says which of the two kinds was expected.

    Public because the marks-only tools need it too — the ramp, the hint and trace
    baselines, and the two repeat checks all read regions and capacities.
    """
    if not isinstance(board, Board):
        raise BoardError(f"expected a marks board, got a {type(board).__name__}")
    return board


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

    def count_solutions(
        self,
        board: Board
        | TrackGrid
        | WordGrid
        | TrioGrid
        | TentsGrid
        | SudokuGrid
        | NurikabeGrid
        | KillerGrid,
        *,
        limit: int = DEFAULT_LIMIT,
    ) -> int:
        return count_board_solutions(as_marks_board(board), limit=limit)

    def deduce(
        self,
        board: Board
        | TrackGrid
        | WordGrid
        | TrioGrid
        | TentsGrid
        | SudokuGrid
        | NurikabeGrid
        | KillerGrid,
        *,
        allow_guesses: bool = True,
    ) -> DeductionTrace | None:
        return deduce_board(as_marks_board(board), allow_guesses=allow_guesses)

    def replay(self, puzzle: Puzzle) -> Puzzle:
        # A mark family either plays one mark per line or k per line, and the rulebook
        # already says which it is. So the board's own capacity is the answer for the
        # second case and nothing is the answer for the first — no branch on the enum.
        board = as_marks_board(puzzle.board)
        return generate_puzzle(
            seed=puzzle.seed,
            puzzle_id=puzzle.id,
            config=GenerationConfig(
                size=board.size,
                puzzle_type=self.puzzle_type,
                stars_per_row=(
                    board.region_capacity[0] if self.default_stars_per_row is not None else None
                ),
                generator_version=puzzle.generator_version,
            ),
        )

    def dimensions(self, puzzle: Puzzle) -> tuple[int, int]:
        board = as_marks_board(puzzle.board)
        return (board.size, board.size)

    def render(self, puzzle: Puzzle) -> str:
        board = as_marks_board(puzzle.board)
        best = next(iter_solutions(board), None)
        header = f"{puzzle.id} seed={puzzle.seed} size={board.size}x{board.size}"
        if best is not None:
            return f"{header}\n{render_board(board, best)}"
        return f"{header}\n{render_board(board)}"

    def parse_board(self, record: dict[str, Any], *, generator_version: int = 1) -> Board:
        del generator_version
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

    def board_to_dict(
        self,
        board: Board
        | TrackGrid
        | WordGrid
        | TrioGrid
        | TentsGrid
        | SudokuGrid
        | NurikabeGrid
        | KillerGrid,
    ) -> dict[str, JsonValue]:
        marks = as_marks_board(board)
        data: dict[str, JsonValue] = {
            "size": marks.size,
            "regions": list(marks.regions),
        }
        if self.default_stars_per_row is not None:
            data["regionCapacity"] = list(marks.region_capacity)
        return data


class TrackRulebook(Rulebook):
    """Train Tracks: a continuous line across a grid that need not be square.

    A companion, on Star Battle's reasoning rather than by omission. The generator
    proves exactly one solution, which is the guarantee worth publishing; it cannot
    promise a board solvable without a hypothesis, because there is no deduction
    engine for this genre yet and `deduce` returns `None`. So no band is recorded
    and the ramp does not apply — the same position Star Battle is in, for the same
    reason.

    Not a `MarkRulebook`, and not a marks board with a different subject. A cell
    here holds one of six pieces or nothing, the line obeys reciprocity rather than
    a capacity, and the grid may be 7x9, which is why `Board` stayed square.
    """

    def __init__(self) -> None:
        self.puzzle_type = PuzzleType.TRAIN_TRACKS
        self.id_suffix = "-tracks"
        self.on_ramp = False
        self.rated = False
        self.logic_only = False

    def daily_ids(self, day: date) -> tuple[str, ...]:
        if day < TRACK_SIZES_START:
            return super().daily_ids(day)
        return tuple(puzzle_id(day, self.puzzle_type, track_size=v.name) for v in TRACK_VARIANTS)

    def generate(
        self,
        *,
        seed: int,
        puzzle_id: str,
        size: int | None = None,
        stars_per_row: int | None = None,
        max_attempts: int | None = None,
    ) -> Puzzle:
        # The ID owns dimensions; marks-only knobs cannot silently override it.
        if size is not None or stars_per_row is not None:
            raise GenerationError(
                "Train Tracks dimensions come from the puzzle id; "
                "use a named size ID instead of --size or --stars"
            )
        # `max_attempts` bounds how many boards the marks generator retries for a
        # unique solution. Tracks placement is a deterministic fill from the seed,
        # so there is one board per seed and nothing to retry.
        del max_attempts
        # `generate_puzzle` checks this for the marks types because it hands the
        # seed to `Prng`, which masks an out-of-range one to 64 bits rather than
        # refusing it. `generate_grid` does the same, so the check belongs here:
        # without it a file can be written recording a seed its own schema refuses.
        if not 0 <= seed <= MAX_SEED:
            raise GenerationError(f"seed {seed} outside [0, 2**32-1]")
        try:
            variant = track_variant(puzzle_id)
            if variant is not None and split_puzzle_id(puzzle_id) is None:
                raise GenerationError(f"{puzzle_id} is not a canonical sized puzzle id")
            width = TRACKS_WIDTH if variant is None else variant.side
            height = TRACKS_HEIGHT if variant is None else variant.side
            grid = generate_grid(seed=seed, width=width, height=height)
        except TrackGenerationError as error:
            raise GenerationError(str(error)) from error
        return Puzzle(
            id=puzzle_id,
            puzzle_type=self.puzzle_type,
            seed=seed,
            generator_version=TRACKS_GENERATOR_VERSION,
            board=grid,
        )

    def count_solutions(
        self,
        board: Board
        | TrackGrid
        | WordGrid
        | TrioGrid
        | TentsGrid
        | SudokuGrid
        | NurikabeGrid
        | KillerGrid,
        *,
        limit: int = DEFAULT_LIMIT,
    ) -> int:
        if not isinstance(board, TrackGrid):
            raise GenerationError("train-tracks count needs a track grid")
        return count_track_solutions(board, limit=limit)

    def deduce(
        self,
        board: Board
        | TrackGrid
        | WordGrid
        | TrioGrid
        | TentsGrid
        | SudokuGrid
        | NurikabeGrid
        | KillerGrid,
        *,
        allow_guesses: bool = True,
    ) -> DeductionTrace | None:
        # No engine for this genre yet. `None` is the honest answer and is what the
        # contract allows: a family without one plays without hints rather than
        # with wrong ones. The arguments are part of the contract every rulebook
        # answers to, and a genre with no engine has nothing to say about either.
        del board, allow_guesses
        return None

    def replay(self, puzzle: Puzzle) -> Puzzle:
        # Archived versions select their own policy, independent of the version
        # currently written by generate(). Keep these branches when adding one.
        match puzzle.generator_version:
            case 1:
                require_nonzero_clues = False
            case 2:
                require_nonzero_clues = True
            case 3:
                require_nonzero_clues = True
            case _:
                raise GenerationError(
                    f"unsupported train-tracks generator version {puzzle.generator_version}"
                )
        board = self._grid(puzzle)
        try:
            regenerated = generate_grid(
                seed=puzzle.seed,
                width=board.width,
                height=board.height,
                require_nonzero_clues=require_nonzero_clues,
                generator_version=puzzle.generator_version,
            )
        except TrackGenerationError as error:
            raise GenerationError(str(error)) from error
        return replace(
            puzzle,
            board=regenerated,
        )

    def dimensions(self, puzzle: Puzzle) -> tuple[int, int]:
        grid = self._grid(puzzle)
        return (grid.width, grid.height)

    def render(self, puzzle: Puzzle) -> str:
        grid = self._grid(puzzle)
        header = f"{puzzle.id} seed={puzzle.seed} size={grid.width}x{grid.height}"
        return f"{header}\n{render_grid(grid)}"

    def _grid(self, puzzle: Puzzle) -> TrackGrid:
        """The track grid `puzzle` holds, or a message saying what it holds instead."""
        board = puzzle.board
        if not isinstance(board, TrackGrid):
            raise GenerationError(f"{puzzle.id} carries a {type(board).__name__}, not a track grid")
        return board

    def parse_board(self, record: dict[str, Any], *, generator_version: int = 1) -> TrackGrid:
        del generator_version
        width = require_int(record.get("width"), "board.width")
        height = require_int(record.get("height"), "board.height")
        row_clues = tuple(
            require_int(value, "board.rowClues[]")
            for value in require_list(record.get("rowClues"), "board.rowClues")
        )
        col_clues = tuple(
            require_int(value, "board.colClues[]")
            for value in require_list(record.get("colClues"), "board.colClues")
        )
        givens = tuple(
            require_int(value, "board.givens[]")
            for value in require_list(record.get("givens"), "board.givens")
        )
        # `TrackGrid`'s constructor checks the array lengths against these
        # dimensions, the clue ranges, the two running totals, the piece numbers
        # and the two open ends — so there is nothing left to check here.
        return TrackGrid(width, height, row_clues, col_clues, givens)

    def board_to_dict(
        self,
        board: Board
        | TrackGrid
        | WordGrid
        | TrioGrid
        | TentsGrid
        | SudokuGrid
        | NurikabeGrid
        | KillerGrid,
    ) -> dict[str, JsonValue]:
        if not isinstance(board, TrackGrid):
            raise GenerationError("train-tracks writes a track grid, not a marks board")
        return {
            "width": board.width,
            "height": board.height,
            "rowClues": list(board.row_clues),
            "colClues": list(board.col_clues),
            "givens": list(board.givens),
        }


WORD_PATHS_START: Final = date.fromisoformat(
    json.loads(
        (Path(__file__).resolve().parents[3] / "conformance/id-cases/manifest.json").read_text(
            encoding="utf-8"
        )
    )["wordPaths"]["activationDay"]
)


class WordPathRulebook(Rulebook):
    """Frozen English recipe with a dated daily launch."""

    puzzle_type = PuzzleType.WORD_PATHS
    id_suffix = "-words"
    published = True
    rated = False
    on_ramp = False
    logic_only = False

    def daily_ids(self, day: date) -> tuple[str, ...]:
        return super().daily_ids(day) if day >= WORD_PATHS_START else ()

    def generate(
        self,
        *,
        seed: int,
        puzzle_id: str,
        size: int | None = None,
        stars_per_row: int | None = None,
        max_attempts: int | None = None,
    ) -> Puzzle:
        if any(value is not None for value in (size, stars_per_row, max_attempts)):
            raise GenerationError("word-paths uses fixed versioned recipes, without overrides")
        return self._generate(seed, puzzle_id, 2)

    def _generate(self, seed: int, identifier: str, version: int) -> Puzzle:
        parsed = split_puzzle_id(identifier)
        if parsed is None or parsed[1] is not self.puzzle_type:
            raise GenerationError("word-paths requires a canonical date-words id")
        try:
            grid = (
                generate_word_grid(
                    seed=seed,
                    vocabulary=v1_vocabulary(),
                    budget=SearchBudget(250_000),
                    max_attempts=50,
                )
                if version == 1
                else generate_word_grid_v2(seed=seed, budget=SearchBudget(500_000))
            )
        except (ValueError, WordSearchLimitError) as error:
            raise GenerationError(str(error)) from error
        return Puzzle(identifier, self.puzzle_type, seed, version, grid)

    def count_solutions(
        self,
        board: Board
        | TrackGrid
        | WordGrid
        | TrioGrid
        | TentsGrid
        | SudokuGrid
        | NurikabeGrid
        | KillerGrid,
        *,
        limit: int = DEFAULT_LIMIT,
    ) -> int:
        grid = self._grid(board)
        return count_word_solutions(
            grid, vocabulary_for_version(grid.vocabulary_version), limit=limit
        )

    def deduce(
        self,
        board: Board
        | TrackGrid
        | WordGrid
        | TrioGrid
        | TentsGrid
        | SudokuGrid
        | NurikabeGrid
        | KillerGrid,
        *,
        allow_guesses: bool = True,
    ) -> None:
        del board, allow_guesses

    def replay(self, puzzle: Puzzle) -> Puzzle:
        if puzzle.generator_version not in (1, 2):
            raise GenerationError(
                f"unsupported word-paths generator version {puzzle.generator_version}"
            )
        self._grid(puzzle.board)
        return self._generate(puzzle.seed, puzzle.id, puzzle.generator_version)

    def dimensions(self, puzzle: Puzzle) -> tuple[int, int]:
        grid = self._grid(puzzle.board)
        return grid.width, grid.height

    def render(self, puzzle: Puzzle) -> str:
        grid = self._grid(puzzle.board)
        rows = [
            "".join((letter or "#") + " " for letter in grid.letters[r : r + grid.width])
            for r in range(0, grid.cell_count, grid.width)
        ]
        return "\n".join([f"{puzzle.id} seed={puzzle.seed} size={grid.width}x{grid.height}", *rows])

    @staticmethod
    def _grid(
        board: Board
        | TrackGrid
        | WordGrid
        | TrioGrid
        | TentsGrid
        | SudokuGrid
        | NurikabeGrid
        | KillerGrid,
    ) -> WordGrid:
        if not isinstance(board, WordGrid):
            raise GenerationError("word-paths needs a word grid")
        return board

    def parse_board(self, record: dict[str, Any], *, generator_version: int = 1) -> WordGrid:
        letters: list[str | None] = []
        for letter in require_list(record.get("letters"), "board.letters"):
            if letter is not None and not isinstance(letter, str):
                raise BoardError("board.letters[] must be a letter or null")
            letters.append(letter)
        return WordGrid(
            require_int(record.get("width"), "board.width"),
            require_int(record.get("height"), "board.height"),
            tuple(letters),
            tuple(
                require_int(n, "board.wordLengths[]")
                for n in require_list(record.get("wordLengths"), "board.wordLengths")
            ),
            vocabulary_version=generator_version,
        )

    def board_to_dict(
        self,
        board: Board
        | TrackGrid
        | WordGrid
        | TrioGrid
        | TentsGrid
        | SudokuGrid
        | NurikabeGrid
        | KillerGrid,
    ) -> dict[str, JsonValue]:
        grid = self._grid(board)
        return {
            "width": grid.width,
            "height": grid.height,
            "letters": list(grid.letters),
            "wordLengths": list(grid.word_lengths),
        }


TRIO_START: Final = date.fromisoformat(
    json.loads(
        (Path(__file__).resolve().parents[3] / "conformance/id-cases/manifest.json").read_text(
            encoding="utf-8"
        )
    )["trio"]["activationDay"]
)


class TrioRulebook(Rulebook):
    """The frozen pilot recipe, certified unique and complete by direct deduction."""

    puzzle_type = PuzzleType.TRIO
    id_suffix = "-trio"
    on_ramp = False
    rated = False
    logic_only = True
    default_size = TRIO_SIZE

    def daily_ids(self, day: date) -> tuple[str, ...]:
        return super().daily_ids(day) if day >= TRIO_START else ()

    def generate(
        self,
        *,
        seed: int,
        puzzle_id: str,
        size: int | None = None,
        stars_per_row: int | None = None,
        max_attempts: int | None = None,
    ) -> Puzzle:
        if any(value is not None for value in (size, stars_per_row, max_attempts)):
            raise GenerationError("trio uses a fixed versioned recipe, without overrides")
        parsed = split_puzzle_id(puzzle_id)
        if parsed is None or parsed[1] is not self.puzzle_type:
            raise GenerationError("trio requires a canonical date-trio id")
        try:
            grid = generate_trio_grid(seed)
        except (ValueError, TrioGenerationError) as error:
            raise GenerationError(str(error)) from error
        if not deduce_trio(grid).solved:
            raise GenerationError("trio board does not complete through direct deductions")
        return Puzzle(puzzle_id, self.puzzle_type, seed, TRIO_GENERATOR_VERSION, grid)

    def count_solutions(
        self,
        board: Board
        | TrackGrid
        | WordGrid
        | TrioGrid
        | TentsGrid
        | SudokuGrid
        | NurikabeGrid
        | KillerGrid,
        *,
        limit: int = DEFAULT_LIMIT,
    ) -> int:
        return count_trio_solutions(self._grid(board), limit=limit)

    def deduce(
        self,
        board: Board
        | TrackGrid
        | WordGrid
        | TrioGrid
        | TentsGrid
        | SudokuGrid
        | NurikabeGrid
        | KillerGrid,
        *,
        allow_guesses: bool = True,
    ) -> LogicResult:
        del allow_guesses
        return deduce_trio(self._grid(board))

    def replay(self, puzzle: Puzzle) -> Puzzle:
        if puzzle.generator_version != TRIO_GENERATOR_VERSION:
            raise GenerationError(f"unsupported trio generator version {puzzle.generator_version}")
        self._grid(puzzle.board)
        return self.generate(seed=puzzle.seed, puzzle_id=puzzle.id)

    def dimensions(self, puzzle: Puzzle) -> tuple[int, int]:
        self._grid(puzzle.board)
        return TRIO_SIZE, TRIO_SIZE

    def render(self, puzzle: Puzzle) -> str:
        grid = self._grid(puzzle.board)
        rows = [
            "".join(f" {value or '.'}" for value in grid.givens[start : start + TRIO_SIZE])
            for start in range(0, len(grid.givens), TRIO_SIZE)
        ]
        return "\n".join([f"{puzzle.id} seed={puzzle.seed} size={TRIO_SIZE}x{TRIO_SIZE}", *rows])

    @staticmethod
    def _grid(
        board: Board
        | TrackGrid
        | WordGrid
        | TrioGrid
        | TentsGrid
        | SudokuGrid
        | NurikabeGrid
        | KillerGrid,
    ) -> TrioGrid:
        if not isinstance(board, TrioGrid):
            raise GenerationError("trio needs a trio grid")
        return board

    def parse_board(self, record: dict[str, Any], *, generator_version: int = 1) -> TrioGrid:
        if generator_version != TRIO_GENERATOR_VERSION:
            raise BoardError(f"unsupported trio generator version {generator_version}")
        if require_int(record.get("size"), "board.size") != TRIO_SIZE:
            raise BoardError("trio size must be 9")
        relations: list[Relation] = []
        for edge in require_list(record.get("relations"), "board.relations"):
            if not isinstance(edge, dict):
                raise BoardError("board.relations[] must be an object")
            relation = cast("dict[str, JsonValue]", edge)
            kind = relation.get("kind")
            if not isinstance(kind, str) or kind not in ("same", "different"):
                raise BoardError("relation kind must be same or different")
            relations.append(
                Relation(
                    require_int(relation.get("first"), "board.relations[].first"),
                    require_int(relation.get("second"), "board.relations[].second"),
                    kind,
                )
            )
        return TrioGrid(
            tuple(
                require_int(value, "board.givens[]")
                for value in require_list(record.get("givens"), "board.givens")
            ),
            tuple(relations),
        )

    def board_to_dict(
        self,
        board: Board
        | TrackGrid
        | WordGrid
        | TrioGrid
        | TentsGrid
        | SudokuGrid
        | NurikabeGrid
        | KillerGrid,
    ) -> dict[str, JsonValue]:
        grid = self._grid(board)
        return {
            "size": TRIO_SIZE,
            "givens": list(grid.givens),
            "relations": [
                {"first": edge.first, "second": edge.second, "kind": edge.kind}
                for edge in grid.relations
            ],
        }


TENTS_START: Final = date.fromisoformat(
    json.loads(
        (Path(__file__).resolve().parents[3] / "conformance/id-cases/manifest.json").read_text(
            encoding="utf-8"
        )
    )["tents"]["activationDay"]
)


class TentsRulebook(Rulebook):
    """A fixed daily grid certified offline; app hints have their own rule set."""

    puzzle_type = PuzzleType.TENTS
    id_suffix = "-tents"
    on_ramp = False
    rated = False
    logic_only = False
    default_size = TENTS_SIZE

    def daily_ids(self, day: date) -> tuple[str, ...]:
        return super().daily_ids(day) if day >= TENTS_START else ()

    def generate(
        self,
        *,
        seed: int,
        puzzle_id: str,
        size: int | None = None,
        stars_per_row: int | None = None,
        max_attempts: int | None = None,
    ) -> Puzzle:
        if any(value is not None for value in (size, stars_per_row, max_attempts)):
            raise GenerationError("tents uses a fixed versioned recipe, without overrides")
        parsed = split_puzzle_id(puzzle_id)
        if parsed is None or parsed[1] is not self.puzzle_type:
            raise GenerationError("tents requires a canonical date-tents id")
        try:
            grid = generate_tents_grid(seed)
        except (ValueError, TentsGenerationError) as error:
            raise GenerationError(str(error)) from error
        return Puzzle(puzzle_id, self.puzzle_type, seed, TENTS_GENERATOR_VERSION, grid)

    def count_solutions(
        self,
        board: Board
        | TrackGrid
        | WordGrid
        | TrioGrid
        | TentsGrid
        | SudokuGrid
        | NurikabeGrid
        | KillerGrid,
        *,
        limit: int = DEFAULT_LIMIT,
    ) -> int:
        return len(tents_solutions(self._grid(board), limit=limit))

    def deduce(
        self,
        board: Board
        | TrackGrid
        | WordGrid
        | TrioGrid
        | TentsGrid
        | SudokuGrid
        | NurikabeGrid
        | KillerGrid,
        *,
        allow_guesses: bool = True,
    ) -> None:
        del allow_guesses
        self._grid(board)

    def replay(self, puzzle: Puzzle) -> Puzzle:
        if puzzle.generator_version != TENTS_GENERATOR_VERSION:
            raise GenerationError(f"unsupported tents generator version {puzzle.generator_version}")
        self._grid(puzzle.board)
        return self.generate(seed=puzzle.seed, puzzle_id=puzzle.id)

    def dimensions(self, puzzle: Puzzle) -> tuple[int, int]:
        grid = self._grid(puzzle.board)
        return grid.width, grid.height

    def render(self, puzzle: Puzzle) -> str:
        grid = self._grid(puzzle.board)
        trees = set(grid.trees)
        rows = [
            "".join(" T" if cell in trees else " ." for cell in range(start, start + grid.size))
            for start in range(0, grid.cell_count, grid.size)
        ]
        return "\n".join([f"{puzzle.id} seed={puzzle.seed} size={grid.size}x{grid.size}", *rows])

    @staticmethod
    def _grid(
        board: Board
        | TrackGrid
        | WordGrid
        | TrioGrid
        | TentsGrid
        | SudokuGrid
        | NurikabeGrid
        | KillerGrid,
    ) -> TentsGrid:
        if not isinstance(board, TentsGrid):
            raise GenerationError("tents needs a tents grid")
        return board

    def parse_board(self, record: dict[str, Any], *, generator_version: int = 1) -> TentsGrid:
        if generator_version != TENTS_GENERATOR_VERSION:
            raise BoardError(f"unsupported tents generator version {generator_version}")
        size = require_int(record.get("size"), "board.size")
        trees = tuple(
            require_int(value, "board.trees[]")
            for value in require_list(record.get("trees"), "board.trees")
        )
        rows = tuple(
            require_int(value, "board.rowClues[]")
            for value in require_list(record.get("rowClues"), "board.rowClues")
        )
        cols = tuple(
            require_int(value, "board.colClues[]")
            for value in require_list(record.get("colClues"), "board.colClues")
        )
        if size != TENTS_SIZE or len(trees) != TENT_COUNT or min((*rows, *cols), default=0) < 1:
            raise BoardError("daily tents requires a 10x10 grid, 18 trees and nonzero clues")
        return TentsGrid(size, trees, rows, cols)

    def board_to_dict(
        self,
        board: Board
        | TrackGrid
        | WordGrid
        | TrioGrid
        | TentsGrid
        | SudokuGrid
        | NurikabeGrid
        | KillerGrid,
    ) -> dict[str, JsonValue]:
        grid = self._grid(board)
        return {
            "size": grid.size,
            "trees": list(grid.trees),
            "rowClues": list(grid.rows),
            "colClues": list(grid.cols),
        }


NURIKABE_START: Final = date.fromisoformat(
    json.loads(
        (Path(__file__).resolve().parents[3] / "conformance/id-cases/manifest.json").read_text(
            encoding="utf-8"
        )
    )["nurikabe"]["activationDay"]
)


class NurikabeRulebook(Rulebook):
    puzzle_type = PuzzleType.NURIKABE
    id_suffix = "-nurikabe"
    on_ramp = False
    rated = False
    logic_only = False
    default_size = NURIKABE_SIZE

    def daily_ids(self, day: date) -> tuple[str, ...]:
        return super().daily_ids(day) if day >= NURIKABE_START else ()

    def generate(
        self,
        *,
        seed: int,
        puzzle_id: str,
        size: int | None = None,
        stars_per_row: int | None = None,
        max_attempts: int | None = None,
    ) -> Puzzle:
        if any(value is not None for value in (size, stars_per_row, max_attempts)):
            raise GenerationError("nurikabe uses a fixed versioned recipe, without overrides")
        parsed = split_puzzle_id(puzzle_id)
        if parsed is None or parsed[1] is not self.puzzle_type:
            raise GenerationError("nurikabe requires a canonical date-nurikabe id")
        try:
            grid = generate_nurikabe_grid(seed)
        except (ValueError, NurikabeGenerationError) as error:
            raise GenerationError(str(error)) from error
        return Puzzle(puzzle_id, self.puzzle_type, seed, NURIKABE_GENERATOR_VERSION, grid)

    def count_solutions(
        self,
        board: Board
        | TrackGrid
        | WordGrid
        | TrioGrid
        | TentsGrid
        | SudokuGrid
        | NurikabeGrid
        | KillerGrid,
        *,
        limit: int = DEFAULT_LIMIT,
    ) -> int:
        if type(limit) is not int or limit not in (1, 2):
            raise ValueError("nurikabe supports solution limits of 1 or 2")
        return min(limit, len(solve_nurikabe(self._grid(board)).solutions))

    def deduce(
        self,
        board: Board
        | TrackGrid
        | WordGrid
        | TrioGrid
        | TentsGrid
        | SudokuGrid
        | NurikabeGrid
        | KillerGrid,
        *,
        allow_guesses: bool = True,
    ) -> None:
        del allow_guesses
        self._grid(board)

    def replay(self, puzzle: Puzzle) -> Puzzle:
        if puzzle.generator_version != NURIKABE_GENERATOR_VERSION:
            raise GenerationError(
                f"unsupported nurikabe generator version {puzzle.generator_version}"
            )
        self._grid(puzzle.board)
        return self.generate(seed=puzzle.seed, puzzle_id=puzzle.id)

    def dimensions(self, puzzle: Puzzle) -> tuple[int, int]:
        grid = self._grid(puzzle.board)
        return grid.width, grid.height

    def render(self, puzzle: Puzzle) -> str:
        grid = self._grid(puzzle.board)
        rows = [
            "".join(f"{clue:2}" if clue else " ." for clue in grid.clues[start : start + grid.size])
            for start in range(0, grid.cell_count, grid.size)
        ]
        return "\n".join([f"{puzzle.id} seed={puzzle.seed} size={grid.size}x{grid.size}", *rows])

    @staticmethod
    def _grid(
        board: Board
        | TrackGrid
        | WordGrid
        | TrioGrid
        | TentsGrid
        | SudokuGrid
        | NurikabeGrid
        | KillerGrid,
    ) -> NurikabeGrid:
        if not isinstance(board, NurikabeGrid):
            raise GenerationError("nurikabe needs a nurikabe grid")
        return board

    def parse_board(self, record: dict[str, Any], *, generator_version: int = 1) -> NurikabeGrid:
        if generator_version != NURIKABE_GENERATOR_VERSION:
            raise BoardError(f"unsupported nurikabe generator version {generator_version}")
        size = require_int(record.get("size"), "board.size")
        clues = tuple(
            require_int(value, "board.clues[]")
            for value in require_list(record.get("clues"), "board.clues")
        )
        if size != NURIKABE_SIZE:
            raise BoardError("daily nurikabe requires a 7x7 grid")
        return NurikabeGrid(size, clues)

    def board_to_dict(
        self,
        board: Board
        | TrackGrid
        | WordGrid
        | TrioGrid
        | TentsGrid
        | SudokuGrid
        | NurikabeGrid
        | KillerGrid,
    ) -> dict[str, JsonValue]:
        grid = self._grid(board)
        return {"size": grid.size, "clues": list(grid.clues)}


class SudokuRulebook(Rulebook):
    """Three daily levels, each unique and certified by its own logical band."""

    puzzle_type = PuzzleType.SUDOKU
    id_suffix = "-sudoku"
    on_ramp = False
    rated = False
    logic_only = True
    default_size = SUDOKU_SIZE
    seed_batch_size = SUDOKU_SEED_BATCH_SIZE

    def daily_ids(self, day: date) -> tuple[str, ...]:
        return (
            tuple(f"{day.isoformat()}{v.suffix}" for v in SUDOKU_VARIANTS)
            if day >= SUDOKU_START
            else ()
        )

    def generate(
        self,
        *,
        seed: int,
        puzzle_id: str,
        size: int | None = None,
        stars_per_row: int | None = None,
        max_attempts: int | None = None,
    ) -> Puzzle:
        if any(value is not None for value in (size, stars_per_row, max_attempts)):
            raise GenerationError("sudoku uses a fixed versioned recipe, without overrides")
        parsed = split_puzzle_id(puzzle_id)
        variant = sudoku_variant(puzzle_id)
        if parsed is None or parsed[1] is not self.puzzle_type or variant is None:
            raise GenerationError("sudoku requires a canonical date-sudoku-level id")
        try:
            accepted_seed, grid = generate_sudoku_grid(seed, variant.name)
        except (ValueError, SudokuGenerationError) as error:
            raise GenerationError(str(error)) from error
        return Puzzle(puzzle_id, self.puzzle_type, accepted_seed, SUDOKU_GENERATOR_VERSION, grid)

    def count_solutions(
        self,
        board: Board
        | TrackGrid
        | WordGrid
        | TrioGrid
        | TentsGrid
        | SudokuGrid
        | NurikabeGrid
        | KillerGrid,
        *,
        limit: int = DEFAULT_LIMIT,
    ) -> int:
        if type(limit) is not int or not 1 <= limit <= DEFAULT_LIMIT:
            raise ValueError("Sudoku solution limit must be 1 or 2")
        return min(limit, len(solve_sudoku(self._grid(board)).solutions))

    def deduce(
        self,
        board: Board
        | TrackGrid
        | WordGrid
        | TrioGrid
        | TentsGrid
        | SudokuGrid
        | NurikabeGrid
        | KillerGrid,
        *,
        allow_guesses: bool = True,
    ) -> DeductionResult:
        del allow_guesses
        grid = self._grid(board)
        return deduce_sudoku(grid, grid.level)

    def replay(self, puzzle: Puzzle) -> Puzzle:
        if puzzle.generator_version != SUDOKU_GENERATOR_VERSION:
            raise GenerationError(
                f"unsupported sudoku generator version {puzzle.generator_version}"
            )
        grid = self._grid(puzzle.board)
        variant = sudoku_variant(puzzle.id)
        if variant is None or grid.level != variant.name:
            raise GenerationError("sudoku id level must match board level")
        try:
            accepted_seed, regenerated = generate_sudoku_grid(
                puzzle.seed, grid.level, max_attempts=1
            )
        except ValueError as error:
            raise GenerationError(str(error)) from error
        return Puzzle(
            puzzle.id, self.puzzle_type, accepted_seed, SUDOKU_GENERATOR_VERSION, regenerated
        )

    def dimensions(self, puzzle: Puzzle) -> tuple[int, int]:
        self._grid(puzzle.board)
        return 9, 9

    def render(self, puzzle: Puzzle) -> str:
        grid = self._grid(puzzle.board)
        rows = [
            "".join(f" {v}" if v else " ." for v in grid.givens[start : start + 9])
            for start in range(0, 81, 9)
        ]
        return "\n".join([f"{puzzle.id} seed={puzzle.seed} size=9x9", *rows])

    @staticmethod
    def _grid(
        board: Board
        | TrackGrid
        | WordGrid
        | TrioGrid
        | TentsGrid
        | SudokuGrid
        | NurikabeGrid
        | KillerGrid,
    ) -> SudokuGrid:
        if not isinstance(board, SudokuGrid):
            raise GenerationError("sudoku needs a sudoku grid")
        return board

    def parse_board(self, record: dict[str, Any], *, generator_version: int = 1) -> SudokuGrid:
        if generator_version != SUDOKU_GENERATOR_VERSION:
            raise BoardError(f"unsupported sudoku generator version {generator_version}")
        if require_int(record.get("size"), "board.size") != SUDOKU_SIZE:
            raise BoardError("sudoku size must be 9")
        level = record.get("level")
        if level not in ("easy", "medium", "hard"):
            raise BoardError("sudoku level must be easy, medium or hard")
        return SudokuGrid(
            tuple(
                require_int(v, "board.givens[]")
                for v in require_list(record.get("givens"), "board.givens")
            ),
            level,
        )

    def board_to_dict(
        self,
        board: Board
        | TrackGrid
        | WordGrid
        | TrioGrid
        | TentsGrid
        | SudokuGrid
        | NurikabeGrid
        | KillerGrid,
    ) -> dict[str, JsonValue]:
        grid = self._grid(board)
        return {"size": 9, "level": grid.level, "givens": list(grid.givens)}


_KILLER_CONTRACT = json.loads(
    (Path(__file__).resolve().parents[3] / "conformance/id-cases/manifest.json").read_text()
)["killerSudoku"]
KILLER_START = date.fromisoformat(_KILLER_CONTRACT["activationDay"])
KILLER_VARIANTS = tuple((v["name"], v["suffix"]) for v in _KILLER_CONTRACT["variants"])


def killer_variant(identifier: str) -> Level | None:
    return next(
        (cast("Level", name) for name, suffix in KILLER_VARIANTS if identifier.endswith(suffix)),
        None,
    )


class KillerRulebook(Rulebook):
    """Three levels certified by cage and Sudoku single deductions."""

    puzzle_type = PuzzleType.KILLER_SUDOKU
    id_suffix = "-killer"
    on_ramp = False
    rated = False
    logic_only = True
    default_size = 9
    seed_batch_size = 256

    def daily_ids(self, day: date) -> tuple[str, ...]:
        return (
            tuple(f"{day.isoformat()}{suffix}" for _, suffix in KILLER_VARIANTS)
            if day >= KILLER_START
            else ()
        )

    def generate(
        self,
        *,
        seed: int,
        puzzle_id: str,
        size: int | None = None,
        stars_per_row: int | None = None,
        max_attempts: int | None = None,
    ) -> Puzzle:
        variant = killer_variant(puzzle_id)
        parsed = split_puzzle_id(puzzle_id)
        if (
            any(v is not None for v in (size, stars_per_row, max_attempts))
            or variant is None
            or parsed is None
            or parsed[1] is not self.puzzle_type
        ):
            raise GenerationError("killer sudoku requires a canonical level id without overrides")
        try:
            accepted, grid = generate_killer(seed, variant)
        except ValueError as error:
            raise GenerationError(str(error)) from error
        return Puzzle(puzzle_id, self.puzzle_type, accepted, 1, grid)

    @staticmethod
    def _grid(
        board: Board
        | TrackGrid
        | WordGrid
        | TrioGrid
        | TentsGrid
        | SudokuGrid
        | NurikabeGrid
        | KillerGrid,
    ) -> KillerGrid:
        if not isinstance(board, KillerGrid):
            raise GenerationError("killer sudoku needs a killer grid")
        return board

    def count_solutions(
        self,
        board: Board
        | TrackGrid
        | WordGrid
        | TrioGrid
        | TentsGrid
        | SudokuGrid
        | NurikabeGrid
        | KillerGrid,
        *,
        limit: int = DEFAULT_LIMIT,
    ) -> int:
        if type(limit) is not int or not 1 <= limit <= DEFAULT_LIMIT:
            raise ValueError("solution limit must be 1 or 2")
        return min(limit, len(solve_killer(self._grid(board)).solutions))

    def deduce(
        self,
        board: Board
        | TrackGrid
        | WordGrid
        | TrioGrid
        | TentsGrid
        | SudokuGrid
        | NurikabeGrid
        | KillerGrid,
        *,
        allow_guesses: bool = True,
    ) -> KillerLogicResult:
        del allow_guesses
        grid = self._grid(board)
        return deduce_killer(grid, hidden_singles=grid.level != "easy")

    def replay(self, puzzle: Puzzle) -> Puzzle:
        grid = self._grid(puzzle.board)
        if puzzle.generator_version != 1 or killer_variant(puzzle.id) != grid.level:
            raise GenerationError("killer sudoku version or level mismatch")
        try:
            accepted, regenerated = generate_killer(puzzle.seed, grid.level, max_attempts=1)
        except ValueError as error:
            raise GenerationError(str(error)) from error
        return Puzzle(puzzle.id, self.puzzle_type, accepted, 1, regenerated)

    def dimensions(self, puzzle: Puzzle) -> tuple[int, int]:
        self._grid(puzzle.board)
        return 9, 9

    def render(self, puzzle: Puzzle) -> str:
        grid = self._grid(puzzle.board)
        return "\n".join(
            [
                f"{puzzle.id} seed={puzzle.seed} size=9x9",
                *(
                    "".join(f" {v}" if v else " ." for v in grid.givens[i : i + 9])
                    for i in range(0, 81, 9)
                ),
            ]
        )

    def parse_board(self, record: dict[str, Any], *, generator_version: int = 1) -> KillerGrid:
        if generator_version != 1 or require_int(record.get("size"), "board.size") != SUDOKU_SIZE:
            raise BoardError("unsupported killer sudoku version or size")
        level = record.get("level")
        if level not in ("easy", "medium", "hard"):
            raise BoardError("invalid killer sudoku level")
        cages: list[Cage] = []
        for value in require_list(record.get("cages"), "board.cages"):
            if not isinstance(value, dict):
                raise BoardError("invalid cage")
            cage_record = cast("dict[str, JsonValue]", value)
            cages.append(
                Cage(
                    require_int(cage_record.get("sum"), "cage.sum"),
                    tuple(
                        require_int(c, "cage.cells[]")
                        for c in require_list(cage_record.get("cells"), "cage.cells")
                    ),
                )
            )
        return KillerGrid(
            tuple(
                require_int(v, "board.givens[]")
                for v in require_list(record.get("givens"), "board.givens")
            ),
            tuple(cages),
            level,
        )

    def board_to_dict(
        self,
        board: Board
        | TrackGrid
        | WordGrid
        | TrioGrid
        | TentsGrid
        | SudokuGrid
        | NurikabeGrid
        | KillerGrid,
    ) -> dict[str, JsonValue]:
        grid = self._grid(board)
        return {
            "size": 9,
            "level": grid.level,
            "givens": list(grid.givens),
            "cages": [{"sum": c.total, "cells": list(c.cells)} for c in grid.cages],
        }


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
    PuzzleType.TRAIN_TRACKS: TrackRulebook(),
    PuzzleType.WORD_PATHS: WordPathRulebook(),
    PuzzleType.TRIO: TrioRulebook(),
    PuzzleType.TENTS: TentsRulebook(),
    PuzzleType.SUDOKU: SudokuRulebook(),
    PuzzleType.NURIKABE: NurikabeRulebook(),
    PuzzleType.KILLER_SUDOKU: KillerRulebook(),
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
        # Only a marks board carries a band, and only a rated type writes one, so a
        # track grid never reaches this. Narrowed rather than cast: if a future type
        # ever does, this says so here instead of failing inside the scorer.
        achieved = score_difficulty(as_marks_board(regenerated.board)).level
        if achieved != puzzle.difficulty:
            raise GenerationError(
                f"difficulty mismatch for {puzzle.id}: recorded level {puzzle.difficulty}, "
                f"the board scores {achieved}"
            )
    return regenerated


def puzzle_id(
    day: date,
    puzzle_type: PuzzleType,
    *,
    track_size: TrackSize | None = None,
    sudoku_level: Level | None = None,
) -> str:
    """Name a family slot, optionally selecting a named Train Tracks board."""
    book = rulebook_for(puzzle_type)
    if sudoku_level is not None and book.puzzle_type not in (
        PuzzleType.SUDOKU,
        PuzzleType.KILLER_SUDOKU,
    ):
        raise RulebookError("only sudoku has named logical levels")
    if book.puzzle_type is PuzzleType.KILLER_SUDOKU:
        if track_size is not None:
            raise RulebookError("only train-tracks has named board sizes")
        variant = next(
            (suffix for name, suffix in KILLER_VARIANTS if name == (sudoku_level or "easy")), None
        )
        if variant is None:
            raise RulebookError("unknown killer sudoku level")
        return f"{day.isoformat()}{variant}"
    if book.puzzle_type is PuzzleType.SUDOKU:
        if track_size is not None:
            raise RulebookError("only train-tracks has named board sizes")
        variant = next((v for v in SUDOKU_VARIANTS if v.name == (sudoku_level or "easy")), None)
        if variant is None:
            raise RulebookError(f"unknown sudoku level {sudoku_level}")
        return f"{day.isoformat()}{variant.suffix}"
    if track_size is None:
        return f"{day.isoformat()}{book.id_suffix}"
    if book.puzzle_type is not PuzzleType.TRAIN_TRACKS:
        raise RulebookError("only train-tracks has named board sizes")
    variant = next((v for v in TRACK_VARIANTS if v.name == track_size), None)
    if variant is None:
        raise RulebookError(f"unknown train-tracks size {track_size}")
    return f"{day.isoformat()}{variant.suffix}"


def split_puzzle_id(value: str) -> tuple[date, PuzzleType] | None:
    """The day and type a puzzle id names, or `None` if it names neither.

    The type comes from the suffix, so this is the one place that reads a type out
    of a name. Callers that have the file's contents should still prefer the
    declared `type`; `tools/verify.py` compares the two rather than choosing, which
    is how a mislabelled file gets caught instead of trusted.
    """
    for book in rulebooks():
        suffixes = (book.id_suffix,)
        if book.puzzle_type is PuzzleType.TRAIN_TRACKS:
            suffixes += tuple(v.suffix for v in TRACK_VARIANTS)
        elif book.puzzle_type is PuzzleType.SUDOKU:
            suffixes = tuple(v.suffix for v in SUDOKU_VARIANTS)
        elif book.puzzle_type is PuzzleType.KILLER_SUDOKU:
            suffixes = tuple(suffix for _, suffix in KILLER_VARIANTS)
        for suffix in suffixes:
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
    "TentsRulebook",
    "TrioRulebook",
    "puzzle_id",
    "rulebook_for",
    "rulebooks",
    "split_puzzle_id",
]
