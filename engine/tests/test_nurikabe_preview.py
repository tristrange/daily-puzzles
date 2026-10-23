import json
import sys
from pathlib import Path
from typing import cast

import pytest
from tools import nurikabe_preview as preview

from queens_engine.nurikabe import NurikabeGrid, NurikabeSearchLimitError


@pytest.fixture
def catalog() -> list[dict[str, object]]:
    return cast(list[dict[str, object]], json.loads(preview.DATA.read_text()))


def test_committed_previews_have_distinct_unique_answers_and_matching_certificate(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    boards = preview.load_previews(preview.DATA)
    assert tuple(board.id for board in boards) == tuple(
        f"nurikabe-preview-{index}" for index in range(1, 4)
    )
    assert tuple(board.grid.size for board in boards) == (5, 7, 7)
    assert all({2, 3, 4, 5} <= set(board.grid.clues) for board in boards[1:])
    monkeypatch.setattr(sys, "argv", ["nurikabe_preview.py"])
    preview.main()
    assert "Verified 3 original Nurikabe previews" in capsys.readouterr().out


@pytest.mark.parametrize("raw", [{}, [], [None, None, None]])
def test_rejects_malformed_catalog(tmp_path: Path, raw: object) -> None:
    path = tmp_path / "previews.json"
    path.write_text(json.dumps(raw))
    with pytest.raises(ValueError, match=r"catalog|fields"):
        preview.load_previews(path)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("id", "nurikabe-preview-2"),
        ("size", True),
        ("size", 5.0),
        ("size", 7),
        ("clues", [True] + [0] * 24),
        ("clues", [1.0] + [0] * 24),
        ("clues", [1] + [0] * 23),
        ("clues", [0] * 25),
        ("clues", [-1] + [0] * 24),
        ("clues", [26] + [0] * 24),
        ("clues", "1"),
        ("solution", [0] * 25),
    ],
)
def test_rejects_malformed_board_fields(
    catalog: list[dict[str, object]], tmp_path: Path, field: str, value: object
) -> None:
    catalog[0][field] = value
    path = tmp_path / "previews.json"
    path.write_text(json.dumps(catalog))
    with pytest.raises(ValueError):
        preview.load_previews(path)


def test_rejects_repeated_board_under_a_different_id(
    catalog: list[dict[str, object]], tmp_path: Path
) -> None:
    catalog[2] = {**catalog[1], "id": "nurikabe-preview-3"}
    path = tmp_path / "previews.json"
    path.write_text(json.dumps(catalog))
    with pytest.raises(ValueError, match="distinct"):
        preview.load_previews(path)


@pytest.mark.parametrize("clues", [(4, 0, 0, 0), (2, 0, 0, 0)])
def test_cannot_certify_zero_or_multiple_solutions(clues: tuple[int, ...]) -> None:
    board = preview.PreviewBoard("unproven", NurikabeGrid(2, clues))
    with pytest.raises(ValueError, match="exactly one"):
        preview.certify_previews((board,))


def test_budget_exhaustion_never_produces_a_certificate() -> None:
    boards = preview.load_previews(preview.DATA)
    with pytest.raises(NurikabeSearchLimitError, match="budget"):
        preview.certify_previews(boards, max_nodes=1)


def test_default_verification_rejects_a_tampered_certificate(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    path = tmp_path / "certificate.json"
    path.write_text(
        preview.REPORT.read_text().replace('"solutionCount": 1', '"solutionCount": true')
    )
    monkeypatch.setattr(preview, "REPORT", path)
    monkeypatch.setattr(sys, "argv", ["nurikabe_preview.py"])
    with pytest.raises(ValueError, match="certificate"):
        preview.main()


def test_failed_verification_does_not_overwrite_certificate(
    catalog: list[dict[str, object]], monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    catalog[0]["clues"] = [1, 1] + [0] * 23
    data_path, report_path = tmp_path / "previews.json", tmp_path / "certificate.json"
    data_path.write_text(json.dumps(catalog))
    report_path.write_text("previous certificate")
    monkeypatch.setattr(preview, "DATA", data_path)
    monkeypatch.setattr(preview, "REPORT", report_path)
    monkeypatch.setattr(sys, "argv", ["nurikabe_preview.py", "--write-report"])
    with pytest.raises(ValueError, match="exactly one"):
        preview.main()
    assert report_path.read_text() == "previous certificate"
