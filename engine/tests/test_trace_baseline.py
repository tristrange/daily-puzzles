"""The deduction trace baseline is enforced, and the checker is known to work.

A golden-file test whose comparison silently compares nothing is worse than no
test at all, so `differences` is exercised against a deliberately altered
baseline rather than trusted.
"""

from __future__ import annotations

import copy
import json
from typing import Any, cast

from tools.trace_baseline import (
    BASELINE_PATH,
    TRACES_SEEDS,
    TRACES_SIZES,
    build_baseline,
    differences,
    main,
)


def test_every_traced_board_matches_the_committed_baseline() -> None:
    assert main([]) == 0, "tools.trace_baseline reported a changed trace"


def test_the_baseline_covers_every_board_in_the_set() -> None:
    """Guards the fixture against a stale or hand-trimmed file.

    If the board set grows and `--write` is not re-run, the checker still passes
    on the boards it has, so pin the count rather than trusting the file.
    """
    expected = {f"{size}:{seed}" for size in TRACES_SIZES for seed in TRACES_SEEDS}
    committed = cast("dict[str, Any]", json.loads(BASELINE_PATH.read_text(encoding="utf-8")))
    assert set(committed) == expected


def test_a_changed_step_is_reported() -> None:
    """A dropped rule application must fail, and name the fields that moved."""
    expected = build_baseline()
    altered = copy.deepcopy(expected)
    first = cast("dict[str, Any]", next(iter(altered.values())))
    full = cast("list[list[Any]]", first["full"])
    full.pop()

    lines = differences(expected, altered)
    assert len(lines) == 1
    assert "full" in lines[0]
    # Only the step list changed: the outcome counters are a separate claim.
    assert "rounds" not in lines[0]


def test_a_changed_counter_is_reported() -> None:
    expected = build_baseline()
    altered = copy.deepcopy(expected)
    first = cast("dict[str, Any]", next(iter(altered.values())))
    first["level"] = 5

    lines = differences(expected, altered)
    assert len(lines) == 1
    assert "level" in lines[0]


def test_a_missing_board_is_reported() -> None:
    expected = build_baseline()
    altered = copy.deepcopy(expected)
    del altered[next(iter(altered))]

    lines = differences(expected, altered)
    assert len(lines) == 1
    assert "absent" in lines[0]
