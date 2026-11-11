import json

from tools.enclosure_fixtures import OUTPUT, build_cases


def test_generated_cross_language_positions_are_current() -> None:
    assert json.loads(OUTPUT.read_text()) == build_cases()
