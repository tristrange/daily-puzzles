import json
from pathlib import Path

from tools.enclosure_pilot import main


def test_pilot_writes_certified_diagnostics(tmp_path: Path) -> None:
    output = tmp_path / "pilot.json"
    assert main(["--seeds", "1", "--output", str(output)]) == 0
    report = json.loads(output.read_text())
    assert report["successes"] == 1
    assert report["attempted_seeds"] == 1
    assert report["solver_version"] == "9.15.6755"
    board = report["boards"][0]
    assert board["score"] == board["best_bound"]
    assert len(board["snapshot"].splitlines()) == 8
    assert board["greedy_score"] <= board["score"]
    assert board["elapsed_seconds"] > 0
