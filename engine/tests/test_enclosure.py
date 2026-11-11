# pyright: reportUnknownParameterType=false, reportMissingParameterType=false, reportUnknownArgumentType=false
import json
from pathlib import Path

import pytest

from queens_engine.enclosure import (
    EnclosureGrid,
    evaluate,
    exhaustive_optimum,
    neighbours,
    toggle_wall,
)

CASES = json.loads(
    (Path(__file__).parents[2] / "conformance/enclosure-cases/cases.json").read_text()
)


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["name"])
def test_shared_cases(case):
    grid = EnclosureGrid(case["size"], tuple(case["water"]), case["horse"], case["wallBudget"])
    result = evaluate(grid, case["walls"])
    assert (result.escaped, list(result.reachable), result.score) == (
        case["escaped"],
        case["reachable"],
        case["score"],
    )


def test_actions_and_oracle():
    grid = EnclosureGrid(3, (), 4, 4)
    assert neighbours(3, 4) == (1, 3, 5, 7)
    assert toggle_wall(grid, (1, 3, 5, 7), 0) == (1, 3, 5, 7)
    assert toggle_wall(grid, (1, 3, 5, 7), 3) == (1, 5, 7)
    assert toggle_wall(grid, (), 4) == ()
    assert exhaustive_optimum(grid).score == 1
    assert exhaustive_optimum(EnclosureGrid(2, (), 0, 0)).score is None
    with pytest.raises(ValueError):
        exhaustive_optimum(grid, max_candidates=1)


@pytest.mark.parametrize(
    "args", [(True, (), 0, 0), (3, (1, 1), 4, 0), (3, (4,), 4, 0), (3, (), 4, 9), (3, (), 4, 0, 0)]
)
def test_invalid_grid(args):
    with pytest.raises(ValueError):
        EnclosureGrid(*args)


@pytest.mark.parametrize("walls", [[1, 1], [4], [9], [True], [1, 3, 5, 7, 8]])
def test_invalid_walls(walls):
    with pytest.raises(ValueError):
        evaluate(EnclosureGrid(3, (), 4, 4), walls)
