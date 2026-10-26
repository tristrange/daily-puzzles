import json
from copy import deepcopy
from pathlib import Path

import pytest
from tools import trio_lessons
from tools.trio_lessons import DATA, REPORT, check_causality, check_witness, read_catalog, verify

from queens_engine.trio import LINES, Relation, TrioGrid, TrioSearchLimitError


def test_frozen_course_has_proved_varied_positions_and_complete_answer_sets() -> None:
    verify()
    catalog = read_catalog(DATA)
    lessons = json.loads(REPORT.read_text())["lessons"]
    assert len(lessons) == 12
    assert len({lesson["source"] for lesson in lessons}) == 12
    assert [lesson["id"] for lesson in lessons] == [
        exercise["id"] for technique in catalog for exercise in technique["exercises"]
    ]
    assert any(len(lesson["examples"]) > 1 for lesson in lessons)
    for lesson in lessons[-4:]:
        assert all(example["after"].bit_count() == 2 for example in lesson["examples"])
        assert all(3 <= len(example["witness"]) <= 5 for example in lesson["examples"])


def test_bad_reasoning_or_omitted_valid_answers_never_replace_a_report(tmp_path: Path) -> None:
    original = json.loads(DATA.read_text())
    bad_witness = deepcopy(original)
    bad_witness[0]["exercises"][0]["examples"][0]["witness"][0]["remove"] = 1
    missing_answer = deepcopy(original)
    missing_answer[0]["exercises"][1]["examples"].pop()
    partial_rule = deepcopy(original)
    partial_rule[2]["exercises"][1]["examples"][1]["witness"][0]["remove"] = 2
    data, report = tmp_path / "lessons.json", tmp_path / "report.json"
    report.write_text("previous report")
    for document, message in [
        (bad_witness, "premises"),
        (missing_answer, "every supported exclusion"),
        (partial_rule, "full restriction"),
    ]:
        data.write_text(json.dumps(document))
        with pytest.raises(ValueError, match=message):
            verify(data, report, write_report=True)
        assert report.read_text() == "previous report"


def test_inconclusive_exact_search_leaves_content_and_report_untouched(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    document = json.loads(DATA.read_text())
    exercise = document[0]["exercises"][0]
    exercise["board"] = {"givens": [0] * 81, "relations": []}
    source = tmp_path / "app/public/puzzles" / f"{exercise['source']}.json"
    source.parent.mkdir(parents=True)
    source.write_text(json.dumps({"board": {"size": 9, **exercise["board"]}}))
    data, report = tmp_path / "lessons.json", tmp_path / "report.json"
    data.write_text(json.dumps(document))
    report.write_text("previous report")
    before = data.read_bytes()
    monkeypatch.setattr(trio_lessons, "ROOT", tmp_path)
    with pytest.raises(TrioSearchLimitError):
        verify(data, report, write_report=True, max_attempts=0)
    assert data.read_bytes() == before
    assert report.read_text() == "previous report"


def test_unrelated_steps_do_not_become_necessary_when_their_followups_stop_working() -> None:
    grid = TrioGrid((0,) * 81, (Relation(10, 11, "same"),))
    prepared = [7] * 81
    for cell in (0, 3, 6):
        prepared[cell] = 1
    for cell in (9, 12, 15):
        prepared[cell] = 2
    prepared[10] = prepared[11] = 3
    actions: list[trio_lessons.Restriction] = [
        {"cell": 10, "remove": 2, "rule": "row-count", "group": list(LINES[1])},
        {"cell": 11, "remove": 2, "rule": "same", "group": [10, 11]},
        {"cell": 1, "remove": 1, "rule": "row-count", "group": list(LINES[0])},
    ]
    with pytest.raises(ValueError, match="unnecessary"):
        check_causality(grid, prepared, actions, target=1, bit=1)


def test_a_forced_symbol_cannot_be_disguised_as_a_two_candidate_lesson() -> None:
    grid = TrioGrid((0,) * 81, (Relation(9, 10, "same"),))
    prepared = [7] * 81
    prepared[3] = prepared[21] = 2
    prepared[12] = 3
    prepared[14] = prepared[17] = 1
    prepared[9] = 5
    example: trio_lessons.Example = {
        "cell": 10,
        "witness": [
            {"cell": 12, "remove": 2, "rule": "no-three", "group": [3, 12, 21]},
            {"cell": 9, "remove": 1, "rule": "row-count", "group": list(LINES[1])},
            {"cell": 10, "remove": 1, "rule": "same", "group": [9, 10]},
        ],
    }
    with pytest.raises(ValueError, match="full restriction"):
        check_witness(grid, prepared, {"line": 1, "remove": 1}, example, "candidate-chains")
