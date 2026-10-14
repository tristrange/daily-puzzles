"""Real probe outcomes and direct validation, without a scripted success rate."""

import json
from pathlib import Path

import pytest
from tools import benchmark_word_paths as probe

from queens_engine.word_paths import WordGrid, WordPath, pilot_vocabulary


def test_probe_checks_boards_and_reports_every_seed(tmp_path: Path) -> None:
    output = tmp_path / "report.json"
    assert probe.main(["--count", "2", "--out", str(output)]) == 0
    report = json.loads(output.read_text())
    assert report["attempted"] == report["successes"] == 2
    assert report["failed_seeds"] == []
    assert [row["seed"] for row in report["results"]] == [0, 1]
    assert all(row["outcome"] == "ok" and row["states"] > 0 for row in report["results"])


def test_budget_failures_remain_in_the_denominator(tmp_path: Path) -> None:
    output = tmp_path / "report.json"
    assert probe.main(["--count", "2", "--max-states", "0", "--out", str(output)]) == 1
    report = json.loads(output.read_text())
    assert report["attempted"] == 2
    assert report["successes"] == 0
    assert report["failed_seeds"] == [0, 1]
    assert all(row["outcome"] == "incomplete" for row in report["results"])


def test_direct_validator_checks_geometry_words_lengths_and_coverage() -> None:
    grid = WordGrid(7, 1, tuple("CATLION"), (3, 4))
    correct = (WordPath("CAT", (0, 1, 2)), WordPath("LION", (3, 4, 5, 6)))
    assert probe.obeys(grid, correct, ("CAT", "LION"))
    assert not probe.obeys(grid, correct, ("CAT",))
    assert not probe.obeys(grid, correct[:1], ("CAT", "LION"))
    assert not probe.obeys(grid, (correct[0], WordPath("LION", (3, 4, 6, 5))), ("CAT", "LION"))
    assert not probe.obeys(grid, (correct[0], WordPath("LION", (2, 4, 5, 6))), ("CAT", "LION"))
    assert not probe.obeys(grid, (correct[0], WordPath("LION", (3, 4, 5, -1))), ("CAT", "LION"))


def test_worker_rejects_an_invalid_constructor_return(monkeypatch: pytest.MonkeyPatch) -> None:
    impossible = WordGrid(5, 5, ("X",) * 18 + (None,) * 7, (3, 4, 5, 6))

    def invalid(**_kwargs: object) -> WordGrid:
        return impossible

    monkeypatch.setattr(probe, "generate_grid", invalid)
    assert probe.worker(0, pilot_vocabulary(), 250_000, 50).outcome == "validation-error"


@pytest.mark.parametrize(
    "args", [["--count", "0"], ["--max-states", "-1"], ["--max-attempts", "0"]]
)
def test_invalid_cli_configuration_is_rejected(args: list[str]) -> None:
    with pytest.raises(SystemExit) as error:
        probe.main([*args, "--out", "/tmp/unused-word-paths-report.json"])
    assert error.value.code == 2
