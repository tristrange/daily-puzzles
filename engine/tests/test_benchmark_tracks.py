"""The size probe must account for failures, not only quick successful seeds."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest
from tools import benchmark_tracks as probe

from queens_engine.tracks import EAST, NORTH, PIECE_ENDS, SOUTH, WEST, TrackGrid
from test_tracks import HORIZONTAL


def test_failures_and_timeouts_remain_in_the_denominator(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    outcomes = ["ok", "generation-error", "timeout"]

    def scripted(size: int, seed: int, timeout: float) -> probe.Result:
        return probe.Result(size, seed, outcomes[seed], 0.1 if seed == 0 else None, 3)

    monkeypatch.setattr(probe, "run_seed", scripted)
    output = tmp_path / "probe.json"
    assert probe.main(["--sizes", "8", "--count", "3", "--out", str(output)]) == 1
    report = json.loads(output.read_text())
    summary = report["summaries"][0]
    assert summary["attempted"] == 3
    assert summary["successes"] == 1
    assert summary["failed_seeds"] == [1, 2]
    assert len(report["results"]) == 3


@pytest.mark.parametrize("successes,passes", [(94, False), (95, True)])
def test_completion_gate(successes: int, passes: bool) -> None:
    rows = [
        probe.Result(8, seed, "ok" if seed < successes else "timeout", 0.2, 5)
        for seed in range(100)
    ]
    assert probe.summarize(rows)["passed"] is passes


def test_any_invalid_returned_board_fails_even_above_95_percent() -> None:
    rows = [probe.Result(8, seed, "ok", 0.2, 5) for seed in range(99)]
    rows.append(probe.Result(8, 99, "validation-error", 0.2, 5))
    assert probe.summarize(rows)["passed"] is False


def test_worker_timeout_is_a_recorded_outcome(monkeypatch: pytest.MonkeyPatch) -> None:
    def timeout(*_args: object, **_kwargs: object) -> subprocess.CompletedProcess[str]:
        raise subprocess.TimeoutExpired("worker", 0.01)

    monkeypatch.setattr(probe.subprocess, "run", timeout)
    row = probe.run_seed(12, 7, 0.01)
    assert (row.size, row.seed, row.outcome) == (12, 7, "timeout")


def test_worker_validation_failure_cannot_be_reported_as_ok(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def invalid(_grid: TrackGrid) -> bool:
        return False

    monkeypatch.setattr(probe, "validate", invalid)
    row = probe.worker(8, 0)
    assert row.outcome == "validation-error"
    assert row.generation_seconds is not None


def test_direct_validation_checks_counts_givens_and_reciprocity() -> None:
    grid = TrackGrid(2, 1, (2,), (1, 1), (HORIZONTAL, HORIZONTAL))
    assert probe.obeys(grid, (HORIZONTAL, HORIZONTAL))
    assert not probe.obeys(grid, (HORIZONTAL, 0))


def test_direct_validation_rejects_a_disconnected_loop() -> None:
    by_ends = {frozenset(ends): piece for piece, ends in enumerate(PIECE_ENDS)}
    grid = TrackGrid(3, 3, (3, 2, 2), (3, 3, 1), (HORIZONTAL, 0, HORIZONTAL, 0, 0, 0, 0, 0, 0))
    assignment = (
        HORIZONTAL,
        HORIZONTAL,
        HORIZONTAL,
        by_ends[frozenset((EAST, SOUTH))],
        by_ends[frozenset((SOUTH, WEST))],
        0,
        by_ends[frozenset((NORTH, EAST))],
        by_ends[frozenset((WEST, NORTH))],
        0,
    )
    assert not probe.obeys(grid, assignment)


@pytest.mark.parametrize(
    "args",
    [["--count", "0"], ["--timeout", "0"], ["--timeout", "nan"], ["--sizes", "9"]],
)
def test_invalid_probe_configuration_is_refused(args: list[str]) -> None:
    with pytest.raises(SystemExit) as error:
        probe.main(args)
    assert error.value.code == 2


def test_interrupted_run_preserves_finished_seeds(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    def interrupt(size: int, seed: int, timeout: float) -> probe.Result:
        if seed == 1:
            raise KeyboardInterrupt
        return probe.Result(size, seed, "ok", 0.1, 3)

    monkeypatch.setattr(probe, "run_seed", interrupt)
    output = tmp_path / "partial.json"
    assert probe.main(["--sizes", "8", "--count", "3", "--out", str(output)]) == 130
    assert len(json.loads(output.read_text())["results"]) == 1
