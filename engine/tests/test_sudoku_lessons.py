import json
from pathlib import Path

import pytest
from tools import sudoku_lessons
from tools.sudoku_lessons import DATA, REPORT, certify, read_catalog, verify

from queens_engine.sudoku import SudokuSearchLimitError
from queens_engine.sudoku_deduce import Step


def test_committed_lessons_match_exact_solutions_and_full_replay() -> None:
    verify(DATA, REPORT)
    certificates = json.loads(REPORT.read_text())["lessons"]
    assert [item["id"] for item in certificates] == [recipe.id for _, recipe in read_catalog(DATA)]
    hidden = next(item for item in certificates if item["id"] == "hidden-pairs")
    assert hidden["step"]["after"].bit_count() == 2
    assert hidden["step"]["cell"] in hidden["support"]
    triple = next(item for item in certificates if item["id"] == "naked-triples")
    masks = triple["candidates"]
    assert len({masks[cell] for cell in triple["support"]}) == 3
    assert all(masks[cell].bit_count() == 2 for cell in triple["support"])


def test_comparison_rejects_changed_certificates_and_never_writes(tmp_path: Path) -> None:
    report = tmp_path / "report.json"
    document = json.loads(REPORT.read_text())
    document["lessons"][2]["step"]["after"] = 1
    report.write_text(json.dumps(document))
    before = report.read_bytes()
    with pytest.raises(ValueError, match="certificates differ"):
        verify(DATA, report)
    assert report.read_bytes() == before
    verify(DATA, report, write_report=True)
    assert json.loads(report.read_text()) == json.loads(REPORT.read_text())


def test_exhausted_exact_budget_or_invalid_lesson_writes_nothing(tmp_path: Path) -> None:
    data = tmp_path / "givens.json"
    report = tmp_path / "report.json"
    data.write_text(DATA.read_text())
    report.write_text("existing report")
    before = data.read_bytes()
    with pytest.raises(SudokuSearchLimitError):
        verify(data, report, write_report=True, max_nodes=0)
    assert data.read_bytes() == before
    assert report.read_text() == "existing report"
    positions = json.loads(data.read_text())
    positions["x-wing"][2]["givens"] = [0] * 81
    data.write_text(json.dumps(positions))
    with pytest.raises(ValueError, match="exactly one solution"):
        verify(data, report, write_report=True)
    assert report.read_text() == "existing report"


def test_new_subset_witnesses_reject_incomplete_pattern_support() -> None:
    givens, recipe = next(item for item in read_catalog(DATA) if item[1].id == "naked-triples")
    certificate = certify(givens, recipe, max_nodes=200_000)
    raw = certificate["step"]
    masks = certificate["candidates"]
    masks[raw["cell"]] = 35
    step = Step(raw["cell"], 35, 34, raw["rule"], tuple(raw["group"]))
    assert not masks[certificate["support"][0]] & (step.before & ~step.after)
    sudoku_lessons.check_witness(step, masks, certificate["support"])
    with pytest.raises(ValueError, match="three visible"):
        sudoku_lessons.check_witness(step, masks, certificate["support"][1:])


def test_catalog_preserves_original_ids_and_requires_distinct_boards(tmp_path: Path) -> None:
    catalog = read_catalog(DATA)
    assert len(catalog) == 15
    assert [recipe.id for _, recipe in catalog][::3] == [
        "locked-candidates",
        "pairs",
        "hidden-pairs",
        "naked-triples",
        "x-wing",
    ]
    assert len({tuple(givens) for givens, _ in catalog}) == 15
    positions = json.loads(DATA.read_text())
    positions["pairs"][2]["givens"] = positions["pairs"][1]["givens"]
    data = tmp_path / "givens.json"
    data.write_text(json.dumps(positions))
    with pytest.raises(ValueError, match="distinct source boards"):
        read_catalog(data)
