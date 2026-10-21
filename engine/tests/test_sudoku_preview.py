"""The small preview batch, not generation seed sweeps, belongs in CI."""

import json
from pathlib import Path

import pytest
from tools import sudoku_preview
from tools.sudoku_preview import DATA, certify, generate, verify

from queens_engine.sudoku import SudokuGrid
from queens_engine.sudoku_deduce import Level


def test_certificates_reject_ambiguous_and_inflated_levels() -> None:
    with pytest.raises(ValueError):
        certify(SudokuGrid((0,) * 81), "easy")
    solved = SudokuGrid(tuple((r * 3 + r // 3 + c) % 9 + 1 for r in range(9) for c in range(9)))
    for level in ("medium", "hard"):
        with pytest.raises(ValueError):
            certify(solved, level)


def test_small_construction_is_deterministic_and_certified() -> None:
    board = generate(0, "easy")
    assert board is not None
    assert generate(0, "easy") == board
    assert certify(board, "easy")["level"] == "easy"


def test_committed_batch_has_unique_solutions_and_honest_bands() -> None:
    raw = json.loads(DATA.read_text())
    assert [item["level"] for item in verify(raw)] == ["easy", "medium", "hard"]
    raw[1]["id"] = raw[0]["id"]
    with pytest.raises(ValueError):
        verify(raw)


def test_failed_generation_preserves_artifacts_and_verify_never_writes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    data = tmp_path / "boards.json"
    report = tmp_path / "report.json"
    data.write_text(DATA.read_text())
    report.write_text("existing report")
    before = data.read_bytes()
    monkeypatch.setattr(sudoku_preview, "DATA", data)
    monkeypatch.setattr(sudoku_preview, "REPORT", report)
    monkeypatch.setattr("sys.argv", ["sudoku_preview"])
    sudoku_preview.main()
    assert data.read_bytes() == before
    assert report.read_text() == "existing report"
    monkeypatch.setattr("sys.argv", ["sudoku_preview", "--generate"])
    monkeypatch.setattr(sudoku_preview, "MAX_ATTEMPTS", 1)

    def no_candidate(_seed: int, _level: Level) -> None:
        return None

    monkeypatch.setattr(sudoku_preview, "generate", no_candidate)
    with pytest.raises(RuntimeError):
        sudoku_preview.main()
    assert data.read_bytes() == before
    assert report.read_text() == "existing report"
