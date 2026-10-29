"""Expanded acceptance, frozen v1 compatibility and broad-dictionary proof."""

import hashlib
import json
from dataclasses import replace

import pytest

from queens_engine import GenerationError, Puzzle, PuzzleParseError, parse_puzzle
from queens_engine.board import PuzzleType
from queens_engine.puzzle import CONFORMANCE_DIR
from queens_engine.rulebook import verify_replay
from queens_engine.word_paths import (
    SearchBudget,
    WordGrid,
    WordGridError,
    WordSearchLimitError,
    v1_vocabulary,
    v2_vocabulary,
    vocabulary_paths,
)
from queens_engine.word_paths_gen_v2 import generate_grid
from test_word_paths import reference_covers


def test_broad_vocabulary_covers_ordinary_words_without_names_or_punctuation() -> None:
    words = v2_vocabulary()
    assert (
        hashlib.sha256("\n".join(words).encode()).hexdigest()
        == "b5ffd19f0acf8e99fe2d2160ec86329e72bf6eeb6fe75f3786f013fc47da689a"
    )
    assert len(words) == 16781
    assert set(v1_vocabulary()) <= set(words)
    assert {"CAME", "MEGA", "ERA", "WENT", "RUNS", "MICE", "COLOR", "COLOUR", "EATEN"} <= set(words)
    assert not {"LONDON", "NASA", "CAN'T"} & set(words)
    assert all(
        word.isascii() and word.isalpha() and word.isupper() and 3 <= len(word) <= 6
        for word in words
    )
    assert tuple(sorted(set(words))) == words


def test_old_board_two_is_ambiguous_in_the_broader_dictionary() -> None:
    raw = json.loads((CONFORMANCE_DIR / "word-paths/2026-10-15-words.json").read_text())
    puzzle = parse_puzzle(raw)
    assert isinstance(puzzle.board, WordGrid)
    assert puzzle.board.vocabulary_version == 1
    assert len(reference_covers(puzzle.board, v1_vocabulary())) == 1
    assert len(reference_covers(puzzle.board, v2_vocabulary())) > 1
    assert verify_replay(puzzle) == puzzle


@pytest.mark.parametrize("seed", [0, 1, 7, 2**32 - 1])
def test_v2_generation_is_unique_against_the_entire_acceptance_list(seed: int) -> None:
    grid = generate_grid(seed=seed, budget=SearchBudget(500_000))
    assert grid.vocabulary_version == 2
    assert len(reference_covers(grid, v2_vocabulary())) == 1
    assert len(vocabulary_paths(grid, v2_vocabulary())) <= 12
    puzzle = Puzzle("2026-10-15-words", PuzzleType.WORD_PATHS, seed, 2, grid)
    assert verify_replay(puzzle) == puzzle


def test_schema_and_grid_bind_the_acceptance_version_to_the_envelope() -> None:
    raw = json.loads((CONFORMANCE_DIR / "word-paths/2026-10-15-words.json").read_text())
    raw["generatorVersion"] = 2
    grid = parse_puzzle(raw).board
    assert isinstance(grid, WordGrid)
    assert grid.vocabulary_version == 2
    raw["generatorVersion"] = 3
    grid = parse_puzzle(raw).board
    assert isinstance(grid, WordGrid)
    assert grid.vocabulary_version == 3
    raw["generatorVersion"] = 4
    with pytest.raises(PuzzleParseError):
        parse_puzzle(raw)


def test_search_exhaustion_cannot_be_reported_as_a_unique_board() -> None:
    with pytest.raises(WordSearchLimitError):
        generate_grid(seed=1, budget=SearchBudget(0))


@pytest.mark.parametrize("seed", [-1, 2**32, True])
def test_v2_refuses_invalid_seeds_instead_of_wrapping_them(seed: int) -> None:
    with pytest.raises(WordGridError, match="unsigned"):
        generate_grid(seed=seed, budget=SearchBudget(500000))


def test_replay_still_refuses_a_noncanonical_word_id() -> None:
    raw = json.loads((CONFORMANCE_DIR / "word-paths/2026-10-15-words.json").read_text())
    puzzle = replace(parse_puzzle(raw), id="not-a-date")
    with pytest.raises(GenerationError, match="canonical"):
        verify_replay(puzzle)


def test_v2_preview_batch_is_distinct_replayable_and_independently_unique() -> None:
    directory = CONFORMANCE_DIR / "word-paths"
    manifest = json.loads((directory / "manifest.json").read_text())
    fingerprints: set[tuple[str | None, ...]] = set()
    for filename in manifest["v2Samples"]:
        raw = (directory / "v2" / filename).read_text()
        puzzle = parse_puzzle(json.loads(raw))
        assert puzzle.generator_version == 2
        assert isinstance(puzzle.board, WordGrid)
        assert puzzle.board.vocabulary_version == 2
        assert len(reference_covers(puzzle.board, v2_vocabulary())) == 1
        assert verify_replay(puzzle) == puzzle
        fingerprints.add(puzzle.board.letters)
    assert len(fingerprints) == 10
