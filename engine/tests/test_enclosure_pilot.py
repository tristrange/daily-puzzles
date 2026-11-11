import json

from tools.enclosure_pilot import main


def test_pilot_writes_certified_diagnostics(tmp_path):
    output = tmp_path / "pilot.json"
    assert main(["--seeds", "1", "--output", str(output)]) == 0
    report = json.loads(output.read_text())
    assert report["successes"] == 1
    board = report["boards"][0]
    assert board["score"] == board["best_bound"]
    assert len(board["snapshot"].splitlines()) == 8
    assert board["greedy_score"] <= board["score"]
