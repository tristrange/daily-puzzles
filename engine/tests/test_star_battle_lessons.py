import copy
import json
from pathlib import Path

import jsonschema
import pytest
from tools.star_battle_lessons import DATA, REPORT, certify, read_catalog, verify


def test_fixed_catalog_matches_exact_certificates() -> None:
    verify()
    catalog = read_catalog(DATA)
    assert len(catalog) == 4
    assert len({tuple(e["board"]["regions"]) for t in catalog for e in t["exercises"]}) == 12
    assert all("solution" not in e for t in catalog for e in t["exercises"])
    assert catalog[0]["exercises"][2]["expected"]["rule"] == "single-row"


def test_report_comparison_never_writes_and_explicit_refresh_is_deterministic(
    tmp_path: Path,
) -> None:
    report = tmp_path / "report.json"
    document = json.loads(REPORT.read_text())
    document["lessons"][0]["witness"]["sources"][0]["need"] = 8
    report.write_text(json.dumps(document))
    before = report.read_bytes()
    with pytest.raises(ValueError, match="certificates differ"):
        verify(report=report)
    assert report.read_bytes() == before
    verify(report=report, write_report=True)
    assert report.read_bytes() == REPORT.read_bytes()


@pytest.mark.parametrize(
    "change",
    [
        "rule",
        "target",
        "marks",
        "queens",
        "source",
        "candidate",
        "capacity",
        "duplicate",
        "mixed",
        "empty",
        "home",
    ],
)
def test_rejects_tampered_positions_and_capacity_witnesses(change: str) -> None:
    exercise = copy.deepcopy(read_catalog(DATA)[3]["exercises"][0])
    match change:
        case "rule":
            exercise["expected"]["rule"] = "fill"
        case "target":
            exercise["expected"]["cell"] += 1
        case "marks":
            exercise["marks"] = [exercise["expected"]["cell"]]
        case "queens":
            exercise["queens"] = [0]
        case "source":
            exercise["baselineIndex"] = 1
        case "candidate":
            exercise["witness"]["sources"][0]["candidates"].pop()
        case "capacity":
            exercise["witness"]["sources"][0]["need"] += 1
        case "duplicate":
            exercise["witness"]["sources"][1] = exercise["witness"]["sources"][0]
        case "mixed":
            exercise["witness"]["sources"][0]["kind"] = "row"
        case "empty":
            exercise["witness"]["sources"] = []
        case "home":
            exercise["witness"]["homes"].pop()
        case _:
            raise ValueError(f"Unknown test mutation: {change}")
    with pytest.raises(ValueError):
        certify(exercise, "subset")


def test_prepared_crosses_must_include_every_basic_elimination() -> None:
    exercise = copy.deepcopy(read_catalog(DATA)[0]["exercises"][0])
    exercise["marks"].pop()
    with pytest.raises(ValueError, match="all basic crosses"):
        certify(exercise, "last-space")


@pytest.mark.parametrize("change", ["solution", "order", "distinct", "partial"])
def test_catalog_rejects_extra_answers_order_changes_and_partial_content(
    tmp_path: Path, change: str
) -> None:
    raw = json.loads(DATA.read_text())
    if change == "solution":
        raw[0]["exercises"][0]["solution"] = [1]
    elif change == "order":
        raw.reverse()
    elif change == "distinct":
        raw[0]["exercises"][1]["board"] = raw[0]["exercises"][0]["board"]
    else:
        raw[0]["exercises"].pop()
    data = tmp_path / "data.json"
    data.write_text(json.dumps(raw))
    with pytest.raises((ValueError, jsonschema.ValidationError)):
        read_catalog(data)
