"""Tests for the per-type rulebook registry.

The registry exists so that adding a puzzle type is a single registration rather
than an audit of every `if puzzle_type is` in the tools. That is only true if the
registry is complete and the ids it produces are unambiguous, which is what most
of this file checks.
"""

from __future__ import annotations

from datetime import date

import pytest

from queens_engine import (
    RAMP_TYPE,
    STAR_BATTLE_STARS,
    GenerationConfig,
    PuzzleType,
    generate_puzzle,
    puzzle_id,
    rulebook_for,
    rulebooks,
    score_difficulty,
    split_puzzle_id,
    verify_replay,
)
from queens_engine.rulebook import RulebookError

#: 5x5 is the cheapest board the generator makes and nothing here depends on size.
SMALL = 5

#: A size every type can build. Two stars per row need at least 8x8, so a test that
#: compares two types has to start higher than the cheap per-type ones do.
SHARED_SIZE = 8


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
            rulebook_for("train-tracks")  # type: ignore[arg-type]

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
        for book in rulebooks():
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
        # Star Battle is pinned to 8x8 and Queens defaults to the generator's; the
        # point is that neither is hardcoded in a tool.
        assert rulebook_for(PuzzleType.QUEENS).default_size == 8
        assert rulebook_for(PuzzleType.STAR_BATTLE).default_size == 8
        assert rulebook_for(PuzzleType.QUEENS).default_stars_per_row is None
        assert rulebook_for(PuzzleType.STAR_BATTLE).default_stars_per_row == 2

    def test_the_type_still_has_the_last_word_on_its_own_rules(self) -> None:
        # A CLI flag may override a default, but it cannot make a queens board into
        # a two-star board: the type is what decides what its regions mean.
        book = rulebook_for(PuzzleType.QUEENS)
        with pytest.raises(ValueError):
            book.generate(seed=7, puzzle_id="2026-10-12", size=SMALL, stars_per_row=2)

    def test_every_type_can_replay_the_puzzles_it_generates(self) -> None:
        # The point of `replay_config` is that CI replays a file without the replay
        # code naming the type. Every registered type has to survive its own
        # round-trip, or a new family would publish files that fail verification.
        for book in rulebooks():
            puzzle = book.generate(seed=7, puzzle_id="2026-10-12")
            assert verify_replay(puzzle) == puzzle

    def test_replay_recovers_the_stars_per_row_from_the_board(self) -> None:
        # A Star Battle file records its stars-per-row only in the first region's
        # capacity, so replay has to read it back from there. Asserting the rebuilt
        # config directly is what catches a rulebook that replays every type at one
        # star per row — which generates fine and verifies against nothing.
        book = rulebook_for(PuzzleType.STAR_BATTLE)
        puzzle = book.generate(seed=7, puzzle_id="2026-10-12")
        assert book.replay_config(puzzle).stars_per_row == STAR_BATTLE_STARS
        assert rulebook_for(PuzzleType.QUEENS).replay_config(puzzle).stars_per_row is None

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
            assert 1 <= score_difficulty(puzzle.board).level <= 3
