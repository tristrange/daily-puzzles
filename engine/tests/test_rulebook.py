"""Tests for the per-type rulebook registry.

The registry exists so that adding a puzzle type is a single registration rather
than an audit of every `if puzzle_type is` in the tools. That is only true if the
registry is complete and the ids it produces are unambiguous, which is what most
of this file checks.
"""

from __future__ import annotations

import json
from dataclasses import replace
from datetime import date
from pathlib import Path

import pytest

from helpers import marks_board
from queens_engine import (
    RAMP_TYPE,
    STAR_BATTLE_STARS,
    TRACKS_HEIGHT,
    TRACKS_WIDTH,
    GenerationConfig,
    GenerationError,
    MarkRulebook,
    Puzzle,
    PuzzleType,
    Rulebook,
    dumps_puzzle,
    generate_puzzle,
    load_puzzle,
    parse_puzzle,
    puzzle_id,
    rulebook_for,
    rulebooks,
    score_difficulty,
    split_puzzle_id,
    verify_replay,
)
from queens_engine.rulebook import RulebookError
from queens_engine.sudoku import SudokuGrid
from queens_engine.tracks_gen import TrackGenerationError
from queens_engine.trio import SIDE as TRIO_SIZE
from queens_engine.trio import TrioGrid

#: 5x5 is the cheapest board the generator makes and nothing here depends on size.
SMALL = 5

#: A size every type can build. Two stars per row need at least 8x8, so a test that
#: compares two types has to start higher than the cheap per-type ones do.
SHARED_SIZE = 8


@pytest.fixture(scope="module")
def generated_puzzles() -> dict[PuzzleType, Puzzle]:
    # Seed 2 avoids Star Battle's slow rejection search; replay still regenerates for real.
    return {
        book.puzzle_type: book.generate(
            seed=2 if book.puzzle_type is PuzzleType.STAR_BATTLE else 7,
            puzzle_id=puzzle_id(date(2026, 10, 12), book.puzzle_type),
        )
        for book in rulebooks()
    }


class TestCompleteness:
    def test_every_type_has_a_rulebook(self) -> None:
        # The test that makes a third type safe: a new PuzzleType member with no
        # rulebook would otherwise be published by nothing and verified by nothing,
        # and the failure would only show up as a skipped file.
        assert {book.puzzle_type for book in rulebooks()} == set(PuzzleType)

    def test_an_unregistered_type_raises_rather_than_defaulting(self) -> None:
        # A default would be the worst outcome: it would publish a new type using
        # another type's rules, which is wrong in a way that still succeeds.
        with pytest.raises(RulebookError):
            rulebook_for("light-up")  # type: ignore[arg-type]

    def test_every_type_names_its_files_distinctly(self) -> None:
        # `split_puzzle_id` reads the type out of the suffix, so a shared suffix
        # would make one name mean two types. Queens is the empty suffix, which is
        # what makes the unsuffixed name its own.
        suffixes = [book.id_suffix for book in rulebooks()]
        assert len(set(suffixes)) == len(suffixes)
        assert "" in suffixes

    def test_the_ramp_builds_exactly_the_types_marked_on_the_ramp(self) -> None:
        # `Rulebook.on_ramp` tells `verify` and `publish` to check a type's band, and
        # `ramp.generate_ramped` is the only thing that can produce one. If a type
        # were marked `on_ramp` that the ramp cannot build, `publish` would send it
        # down the band-recording path and the board would come back unrated.
        assert {book.puzzle_type for book in rulebooks() if book.on_ramp} == {RAMP_TYPE}

    def test_being_rated_is_the_same_thing_as_being_on_the_ramp(self) -> None:
        # The ramp is the only thing in the engine that produces a difficulty band,
        # so a type on the ramp is rated and a type off it is not. If a future type
        # could be on the ramp without being rated, `publish` would write a band it
        # cannot justify and `verify` would have nothing to check it against.
        for book in rulebooks():
            assert book.rated == book.on_ramp


class TestIds:
    def test_ids_round_trip_through_the_registry(self) -> None:
        day = date(2026, 10, 12)
        for book in rulebooks():
            name = puzzle_id(day, book.puzzle_type)
            assert split_puzzle_id(name) == (day, book.puzzle_type)

    def test_a_star_companion_is_its_own_puzzle(self) -> None:
        # The reason ids carry a suffix at all: a solve is recorded against an id,
        # so the two puzzles of one day must not collide.
        day = date(2026, 10, 12)
        assert puzzle_id(day, PuzzleType.QUEENS) == "2026-10-12"
        assert puzzle_id(day, PuzzleType.STAR_BATTLE) == "2026-10-12-star"

    @pytest.mark.parametrize(
        "value",
        [
            "",
            "2026-10-12.json",
            "2026-13-01",
            "not-a-date",
            "2026-10-12-nightmare",
            "12-10-2026",
            # `date.fromisoformat` accepts these two spellings of 2026-10-12, and the
            # app's `isPuzzleId` routes neither: a file named this way would be a
            # puzzle `verify` approves and the app can never load, and `publish`
            # would count it as an archive date and fill past it.
            "20261012",
            "2026-W42-1",
        ],
    )
    def test_names_that_are_not_puzzle_ids_are_rejected(self, value: str) -> None:
        assert split_puzzle_id(value) is None

    def test_the_type_comes_from_the_name_not_the_date(self) -> None:
        # Two files can share a date, and which is which is the suffix's job.
        assert split_puzzle_id("2026-10-12") == (date(2026, 10, 12), PuzzleType.QUEENS)
        assert split_puzzle_id("2026-10-12-star") == (date(2026, 10, 12), PuzzleType.STAR_BATTLE)


class TestGeneration:
    def test_generating_through_the_rulebook_matches_the_generator(self) -> None:
        # The rulebook is meant to be a place to record facts, not a second
        # implementation. If this ever diverges, the two paths would disagree about
        # what a type is, and the archive would depend on which one ran.
        # Marks types only: the claim is that `Rulebook.generate` adds nothing to
        # the generator it wraps, and a type with its own generator has no second
        # implementation for that comparison to be against.
        for book in rulebooks():
            if not isinstance(book, MarkRulebook):
                continue
            direct = generate_puzzle(
                seed=7,
                puzzle_id="2026-10-12",
                config=GenerationConfig(
                    size=SHARED_SIZE,
                    puzzle_type=book.puzzle_type,
                    stars_per_row=book.default_stars_per_row,
                ),
            )
            through = book.generate(seed=7, puzzle_id="2026-10-12", size=SHARED_SIZE)
            assert through == direct

    def test_a_type_publishes_at_its_own_size(self) -> None:
        # Star Battle is pinned to 9x9 (8x8 would degenerate to two mirror-image
        # row patterns) and Queens defaults to the generator's; the point is that
        # neither is hardcoded in a tool.
        assert rulebook_for(PuzzleType.QUEENS).default_size == 8
        assert rulebook_for(PuzzleType.STAR_BATTLE).default_size == 9
        assert rulebook_for(PuzzleType.QUEENS).default_stars_per_row is None
        assert rulebook_for(PuzzleType.STAR_BATTLE).default_stars_per_row == 2

    def test_the_type_still_has_the_last_word_on_its_own_rules(self) -> None:
        # A CLI flag may override a default, but it cannot make a queens board into
        # a two-star board: the type is what decides what its regions mean.
        book = rulebook_for(PuzzleType.QUEENS)
        with pytest.raises(ValueError):
            book.generate(seed=7, puzzle_id="2026-10-12", size=SMALL, stars_per_row=2)

    def test_every_type_can_replay_the_puzzles_it_generates(
        self, generated_puzzles: dict[PuzzleType, Puzzle]
    ) -> None:
        # The point of `replay_config` is that CI replays a file without the replay
        # code naming the type. Every registered type has to survive its own
        # round-trip, or a new family would publish files that fail verification.
        for book in rulebooks():
            puzzle = generated_puzzles[book.puzzle_type]
            assert verify_replay(puzzle) == puzzle

    def test_replay_recovers_the_stars_per_row_from_the_board(self) -> None:
        # A Star Battle file records its stars-per-row only in the first region's
        # capacity, so replay has to read it back from there. Asserting the replayed
        # board is what catches a rulebook that replays every type at one star per
        # row — which generates fine and verifies against nothing. The second half
        # is the same claim from the other side: a queens board replayed as a star
        # board would produce a different region capacity and be caught by it.
        book = rulebook_for(PuzzleType.STAR_BATTLE)
        puzzle = book.generate(
            seed=7, puzzle_id=puzzle_id(date(2026, 10, 12), book.puzzle_type), size=SHARED_SIZE
        )
        replayed = book.replay(puzzle)
        assert marks_board(replayed).region_capacity[0] == STAR_BATTLE_STARS
        assert marks_board(replayed).region_capacity == marks_board(puzzle).region_capacity
        # Replaying the star board through the queens rulebook must not work: the
        # capacities it would rebuild are one per region, not two.
        queens_replay = rulebook_for(PuzzleType.QUEENS).replay(puzzle)
        assert marks_board(queens_replay).region_capacity[0] == 1
        assert marks_board(queens_replay).region_capacity != marks_board(puzzle).region_capacity

    def test_counting_and_deducing_go_through_the_rulebook(self) -> None:
        book = rulebook_for(PuzzleType.QUEENS)
        puzzle = book.generate(seed=7, puzzle_id="2026-10-12", size=SMALL)
        assert book.count_solutions(puzzle.board) == 1
        traced = book.deduce(puzzle.board, allow_guesses=False)
        assert traced is not None
        assert traced.solved

    def test_rated_boards_can_actually_be_scored(self) -> None:
        # `rated` is a claim the tools make about a board, so it has to be a claim
        # the difficulty engine can honour. `score_difficulty` reads the shared
        # mark rules, so it returns a band for both types today; the point of the
        # check is that a type marked rated does not quietly become unscoreable.
        for book in rulebooks():
            if not book.rated:
                continue
            puzzle = book.generate(seed=7, puzzle_id="2026-10-12", size=SMALL)
            assert 1 <= score_difficulty(marks_board(puzzle)).level <= 3


class TestTheShapeOfAPuzzle:
    """What every type promises about a puzzle, independent of its rules.

    These are the two answers the tools read instead of a `size` field. Both were
    added because a reader that was left out would fail at a distance: the render
    inventory was once built from a grep that found the *readers* of `puzzle.size`
    and missed the callers further out, so `render.py` was skipped and a generation
    that had already succeeded would then fail while printing its result.

    So each case here is driven by the registry rather than by a list of types
    someone remembered, and each asserts against the board the puzzle actually
    holds rather than against a restatement of the implementation.
    """

    @pytest.mark.parametrize("book", rulebooks(), ids=lambda b: b.puzzle_type.value)
    def test_dimensions_agree_with_the_board(
        self, book: Rulebook, generated_puzzles: dict[PuzzleType, Puzzle]
    ) -> None:
        puzzle = generated_puzzles[book.puzzle_type]
        width, height = book.dimensions(puzzle)
        # Read off the board, not off the size the generator was asked for: the claim
        # is that the rulebook describes the board it was handed.
        if isinstance(puzzle.board, TrioGrid | SudokuGrid):
            assert (width, height) == (TRIO_SIZE, TRIO_SIZE)
            assert width * height == len(puzzle.board.givens)
        else:
            assert (width, height) == (puzzle.board.width, puzzle.board.height)

    @pytest.mark.parametrize("book", rulebooks(), ids=lambda b: b.puzzle_type.value)
    def test_every_type_can_render_a_puzzle(
        self, book: Rulebook, generated_puzzles: dict[PuzzleType, Puzzle]
    ) -> None:
        # `tools.generate` calls this on every type without asking, so a type that
        # could not render would not fail at generation — it would fail afterwards,
        # pointing at the printer rather than at whatever made it unrenderable.
        puzzle = generated_puzzles[book.puzzle_type]
        lines = book.render(puzzle).splitlines()
        width, height = book.dimensions(puzzle)
        assert f"seed={puzzle.seed}" in lines[0]
        assert f"{width}x{height}" in lines[0]
        grid = lines[1:]
        assert len(grid) == height
        # Characters, not words: both renderers draw two per cell, and a track grid
        # has cells an empty line legitimately leaves blank, which `split()` would
        # collapse and read as a short row.
        assert all(len(line) == 2 * width for line in grid)


class TestTracks:
    @pytest.mark.parametrize("name,side", [("small", 8), ("medium", 10), ("large", 12)])
    def test_named_variants_generate_and_replay_at_their_prescribed_side(
        self, name: str, side: int
    ) -> None:
        book = rulebook_for(PuzzleType.TRAIN_TRACKS)
        puzzle = book.generate(seed=0, puzzle_id=f"2026-10-17-tracks-{name}")
        assert book.dimensions(puzzle) == (side, side)
        fixture = (
            Path(__file__).resolve().parents[2] / f"conformance/id-cases/tracks-{name}.accept.json"
        )
        assert json.loads(dumps_puzzle(puzzle)) == json.loads(fixture.read_text())
        assert puzzle.generator_version == 3
        assert verify_replay(puzzle) == puzzle

    def test_daily_slots_change_without_renaming_legacy_ids(self) -> None:
        book = rulebook_for(PuzzleType.TRAIN_TRACKS)
        assert book.daily_ids(date(2026, 10, 13)) == ("2026-10-13-tracks",)
        assert book.daily_ids(date(2026, 10, 14)) == (
            "2026-10-14-tracks-small",
            "2026-10-14-tracks-medium",
            "2026-10-14-tracks-large",
        )
        assert puzzle_id(date(2026, 10, 14), PuzzleType.TRAIN_TRACKS) == "2026-10-14-tracks"

    """The promises Train Tracks makes that the marks genres cannot make.

    Everything here is a decision rather than a consequence: the grid is
    rectangular, there is no deduction engine, and nothing is published yet.
    """

    def test_it_is_registered_and_published(self) -> None:
        # Two separate gates, and both are open. The registry entry is what makes
        # the type visible to `verify`, the schema and the parser; `published` is
        # what lets the nightly write its files. A rulebook with no entry is
        # invisible, and one that is registered but unpublished generates without
        # ever shipping — which is how Train Tracks spent milestone 17.
        book = rulebook_for(PuzzleType.TRAIN_TRACKS)
        assert book.puzzle_type is PuzzleType.TRAIN_TRACKS
        assert book.published
        assert {b.puzzle_type for b in rulebooks()} == set(PuzzleType)

    def test_it_is_off_the_ramp_and_unrated(self) -> None:
        # The ramp is what records a band, and a band is a claim about how hard a
        # board is. There is no deduction engine to gate a band on, so claiming one
        # would be a number nothing in the repo could justify.
        book = rulebook_for(PuzzleType.TRAIN_TRACKS)
        assert not book.on_ramp
        assert not book.rated
        assert not book.logic_only

    def test_a_size_is_refused_rather_than_ignored(self) -> None:
        # A named ID owns its dimensions; a marks-only flag cannot override it.
        with pytest.raises(GenerationError, match="puzzle id"):
            rulebook_for(PuzzleType.TRAIN_TRACKS).generate(seed=7, puzzle_id="2026-10-12", size=8)

    def test_it_generates_a_rectangular_grid_at_the_published_size(self) -> None:
        book = rulebook_for(PuzzleType.TRAIN_TRACKS)
        puzzle = book.generate(seed=7, puzzle_id=puzzle_id(date(2026, 10, 12), book.puzzle_type))
        assert book.dimensions(puzzle) == (TRACKS_WIDTH, TRACKS_HEIGHT)
        assert TRACKS_WIDTH == TRACKS_HEIGHT, "the constants are two numbers, not a size"

    def test_new_tracks_puzzles_use_every_line_and_replay_as_version_three(self) -> None:
        puzzle = rulebook_for(PuzzleType.TRAIN_TRACKS).generate(
            seed=7, puzzle_id="2026-10-16-tracks"
        )
        record = json.loads(dumps_puzzle(puzzle))
        assert record["generatorVersion"] == 3
        assert all(clue >= 1 for clue in record["board"]["rowClues"])
        assert all(clue >= 1 for clue in record["board"]["colClues"])
        assert verify_replay(parse_puzzle(record)) == puzzle

    def test_version_one_archive_puzzles_still_replay_with_zero_clues(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        path = Path(__file__).resolve().parents[2] / "app/public/puzzles/2026-10-12-tracks.json"
        puzzle = load_puzzle(path)
        assert puzzle.generator_version == 1
        monkeypatch.setattr("queens_engine.rulebook.TRACKS_GENERATOR_VERSION", 4)
        assert 0 in json.loads(dumps_puzzle(puzzle))["board"]["colClues"]
        assert verify_replay(puzzle) == puzzle

    def test_version_two_replay_survives_a_later_generator_version(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        puzzle = load_puzzle(Path(__file__).parent / "fixtures/tracks-v2-seed7.json")
        assert puzzle.generator_version == 2
        monkeypatch.setattr("queens_engine.rulebook.TRACKS_GENERATOR_VERSION", 4)
        assert verify_replay(puzzle) == puzzle

    def test_version_three_replay_survives_a_later_generator_version(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        puzzle = load_puzzle(Path(__file__).parent / "fixtures/tracks-v3-seed7.json")
        assert puzzle.generator_version == 3
        monkeypatch.setattr("queens_engine.rulebook.TRACKS_GENERATOR_VERSION", 4)
        assert verify_replay(puzzle) == puzzle

    def test_a_seed_the_schema_refuses_is_refused_here_too(self) -> None:
        # `generate_grid` hands the seed to `Prng`, which masks an out-of-range one
        # rather than refusing it. Without this check `--seed -1` writes a puzzle
        # recording a seed its own schema will not accept back.
        with pytest.raises(GenerationError, match="outside"):
            rulebook_for(PuzzleType.TRAIN_TRACKS).generate(seed=-1, puzzle_id="2026-10-12")

    def test_replay_refuses_an_unsupported_tracks_generator_version(self) -> None:
        book = rulebook_for(PuzzleType.TRAIN_TRACKS)
        puzzle = book.generate(seed=7, puzzle_id=puzzle_id(date(2026, 10, 12), book.puzzle_type))
        forged = replace(puzzle, generator_version=99)
        with pytest.raises(GenerationError, match="version"):
            verify_replay(forged)

    def test_generation_failure_uses_the_publishers_seed_retry_error(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def no_grid(**_kwargs: object) -> None:
            raise TrackGenerationError("no unique grid from this seed")

        monkeypatch.setattr("queens_engine.rulebook.generate_grid", no_grid)
        with pytest.raises(GenerationError, match="no unique grid"):
            rulebook_for(PuzzleType.TRAIN_TRACKS).generate(seed=7, puzzle_id="2026-10-16-tracks")

    def test_the_marks_generator_refuses_a_type_it_does_not_build(self) -> None:
        # Its branch is `QUEENS` else Star Battle, so a new enum member would have
        # been built as a two-star board — the wrong game, generated by a generator
        # that does not know the type exists, and reporting success.
        with pytest.raises(GenerationError, match="not generated here"):
            generate_puzzle(
                seed=7,
                puzzle_id="2026-10-12",
                config=GenerationConfig(size=8, puzzle_type=PuzzleType.TRAIN_TRACKS),
            )

    def test_it_has_exactly_one_solution_and_no_hints(self) -> None:
        # The uniqueness is what the generator proves and therefore what may be
        # published. The `None` is what the contract allows for a genre with no
        # engine: no hints rather than hints that could contradict the answer.
        book = rulebook_for(PuzzleType.TRAIN_TRACKS)
        puzzle = book.generate(seed=7, puzzle_id=puzzle_id(date(2026, 10, 12), book.puzzle_type))
        assert book.count_solutions(puzzle.board) == 1
        assert book.deduce(puzzle.board) is None

    def test_a_tracks_puzzle_survives_its_own_file_format(self) -> None:
        # The point of `parse_board` and `board_to_dict` on the rulebook: the file
        # carries the grid, and reading it back gives the same puzzle. Asserted
        # through `parse_puzzle` so the schema is in the path too.
        puzzle = rulebook_for(PuzzleType.TRAIN_TRACKS).generate(seed=7, puzzle_id="2026-10-12")
        assert parse_puzzle(json.loads(dumps_puzzle(puzzle))) == puzzle
