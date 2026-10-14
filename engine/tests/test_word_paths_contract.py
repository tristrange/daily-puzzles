"""The shared file contract and independently checked frozen recipe."""

import hashlib
import json
from dataclasses import replace
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pytest
from tools.generate import main as generate_main
from tools.verify import main as verify_main

from queens_engine import (
    GenerationError,
    PuzzleParseError,
    dumps_puzzle,
    parse_puzzle,
    rulebook_for,
)
from queens_engine.board import PuzzleType
from queens_engine.puzzle import CONFORMANCE_DIR
from queens_engine.rulebook import verify_replay
from queens_engine.word_paths import (
    WordGrid,
    WordGridError,
    spell_path,
    v1_vocabulary,
    v2_vocabulary,
    vocabulary_paths,
)
from test_word_paths import reference_covers

CASES = CONFORMANCE_DIR / "word-paths"
DIGEST = "e054967cc550e50a1f0d245fab7e18979870922f0c41e2d4cc7ff2010d93f0ce"


def test_frozen_vocabulary() -> None:
    words = v1_vocabulary()
    assert len(words) == 748
    assert hashlib.sha256("\n".join(words).encode()).hexdigest() == DIGEST


def test_word_rulebook_roundtrip_and_metadata() -> None:
    book = rulebook_for(PuzzleType.WORD_PATHS)
    assert book.published
    assert not any((book.rated, book.on_ramp, book.logic_only))
    puzzle = book.generate(seed=7, puzzle_id="2026-10-14-words")
    assert puzzle.generator_version == 2
    assert puzzle.difficulty is None
    assert book.dimensions(puzzle) == (5, 5)
    assert book.deduce(puzzle.board) is None
    assert book.count_solutions(puzzle.board) == 1
    assert parse_puzzle(json.loads(dumps_puzzle(puzzle))) == puzzle
    assert verify_replay(puzzle) == puzzle
    assert set(json.loads(dumps_puzzle(puzzle))["board"]) == {
        "width",
        "height",
        "letters",
        "wordLengths",
    }
    assert len(book.render(puzzle).splitlines()) == 6
    with pytest.raises(GenerationError, match="version"):
        verify_replay(replace(puzzle, generator_version=3))
    with pytest.raises(GenerationError, match="word grid"):
        book.count_solutions(
            rulebook_for(PuzzleType.QUEENS).generate(seed=7, puzzle_id="2026-10-14").board
        )


@pytest.mark.parametrize("options", [{"size": 5}, {"stars_per_row": 1}, {"max_attempts": 1}])
def test_recipe_rejects_options_that_would_change_replay(options: dict[str, int]) -> None:
    with pytest.raises(GenerationError, match="fixed"):
        rulebook_for(PuzzleType.WORD_PATHS).generate(
            seed=7, puzzle_id="2026-10-14-words", **options
        )


@pytest.mark.parametrize("identifier", ["2026-02-30-words", "2026-10-14", "2026-10-14-star"])
def test_generation_requires_matching_canonical_id(identifier: str) -> None:
    with pytest.raises(GenerationError, match="id"):
        rulebook_for(PuzzleType.WORD_PATHS).generate(seed=7, puzzle_id=identifier)


def test_shared_samples_and_rejections() -> None:
    manifest: Any = json.loads((CASES / "manifest.json").read_text())
    assert {p.name for p in CASES.glob("*.json")} == {
        "manifest.json",
        "path-cases.json",
        *manifest["samples"],
    }
    book = rulebook_for(PuzzleType.WORD_PATHS)
    for filename in manifest["samples"]:
        raw = (CASES / filename).read_text()
        puzzle = parse_puzzle(json.loads(raw))
        assert isinstance(puzzle.board, WordGrid)
        assert dumps_puzzle(puzzle) == raw
        assert verify_replay(puzzle) == puzzle
        assert len(reference_covers(puzzle.board, v1_vocabulary())) == 1
        assert book.count_solutions(puzzle.board) == 1
    raw: Any = json.loads((CASES / manifest["samples"][0]).read_text())
    for case in manifest["rejects"]:
        mutated = {**raw, **case.get("envelope", {})}
        mutated["board"] = {**raw["board"], **case.get("board", {})}
        with pytest.raises(PuzzleParseError, match=case["error"]):
            parse_puzzle(mutated)


def test_one_hundred_seeds_match_the_independent_cover_solver() -> None:
    book = rulebook_for(PuzzleType.WORD_PATHS)
    for seed in range(100):
        puzzle = book.generate(seed=seed, puzzle_id="2026-10-14-words")
        assert isinstance(puzzle.board, WordGrid)
        assert len(reference_covers(puzzle.board, v2_vocabulary())) == 1
        assert len(vocabulary_paths(puzzle.board, v2_vocabulary())) <= 12
        assert verify_replay(puzzle) == puzzle


def test_existing_cli_generates_and_verifies_word_files(tmp_path: Path) -> None:
    assert (
        generate_main(["--date", "2026-10-14", "--type", "word-paths", "--out", str(tmp_path)]) == 0
    )
    assert verify_main(["--dir", str(tmp_path)]) == 0
    assert [p.name for p in tmp_path.glob("*.json")] == ["2026-10-14-words.json"]


def test_shared_path_geometry() -> None:
    cases: Any = json.loads((CASES / "path-cases.json").read_text())
    for case in cases:
        b = case["board"]
        grid = WordGrid(b["width"], b["height"], tuple(b["letters"]), tuple(b["wordLengths"]))
        if case["word"] is None:
            with pytest.raises(WordGridError):
                spell_path(grid, tuple(case["cells"]))
        else:
            assert spell_path(grid, tuple(case["cells"])) == case["word"]


def test_first_week_of_daily_words_is_replayable_and_independently_unique() -> None:
    corpus = CASES.parents[1] / "app/public/puzzles"
    for offset in range(7):
        day = date(2026, 10, 15) + timedelta(days=offset)
        path = corpus / f"{day}-words.json"
        raw: Any = json.loads(path.read_text())
        puzzle = parse_puzzle(raw)
        assert puzzle.generator_version == 2
        assert isinstance(puzzle.board, WordGrid)
        assert puzzle.board.word_lengths == (3, 4, 5, 6)
        assert (puzzle.board.width, puzzle.board.height) == (5, 5)
        assert set(raw["board"]) == {"width", "height", "letters", "wordLengths"}
        assert len(reference_covers(puzzle.board, v2_vocabulary())) == 1
        assert len(vocabulary_paths(puzzle.board, v2_vocabulary())) <= 12
        assert verify_replay(puzzle) == puzzle
        assert dumps_puzzle(puzzle) == path.read_text()
