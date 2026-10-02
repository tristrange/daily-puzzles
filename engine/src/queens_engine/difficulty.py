"""Difficulty: a transparent one-dimensional rating of a board's reasoning.

The engine measures what it can prove (see `deduce`). Difficulty turns that
trace into a score and a band. Weights are deliberately small integers so the
score stays explainable — "three intersections, two subset steps, one guess"
is a summary the README can show. Thresholds are calibrated against boards the
generator actually ships, so the bands track the player's daily experience, not
a theoretical ladder; change the generator and re-measure.

The score is a *soft signal*, exactly as the README promises: it rates how hard
this engine found the board. Two boards with the same trace are interchangeable;
two boards with different traces are ordered by weight. It does not claim to be
the one true difficulty — nobody can fully formalise a puzzle's difficulty.
"""

from __future__ import annotations

from dataclasses import dataclass

from queens_engine.board import Board
from queens_engine.deduce import (
    DEFAULT_GUESS_CAP,
    FILL,
    INTERSECTION,
    SINGLE_COLUMN,
    SINGLE_REGION,
    SINGLE_ROW,
    SUBSET,
    TRIAL,
    deduce,
)

#: Weight of each deduction rule. Queens & solver proofs are cold fact; how much
#: a rule bends a human's mind is a judgement call, so these are named constants
#: that read as opinions rather than numbers buried in a formula.
#:
#: `fill` is the one weight with no measurement behind it: it cannot fire at
#: k = 1, so no Queens board has ever scored it and none of these numbers are
#: calibrated against it. Two points puts it with `intersection` — a single step
#: that resolves a whole group, but one a player can check at a glance, unlike a
#: pigeonhole. It is a stated opinion, not a fitted weight, and nothing published
#: depends on it yet.
RULE_WEIGHTS = {
    SINGLE_REGION: 1,
    SINGLE_ROW: 1,
    SINGLE_COLUMN: 1,
    FILL: 2,
    INTERSECTION: 2,
    SUBSET: 4,
    TRIAL: 5,
}

#: A board that needs any trial step is at least Medium, however few firings it
#: took — hypothesising is not deduction, and we level on the *worst* move. The
#: trial already costs 5 points on top, so a single probe on an otherwise easy
#: board lands just above the Easy cut and a short trial does not dominate the
#: band the way a Hard floor would.
GUESSING_FLOOR = 2

LEVEL_NAMES = ("Easy", "Medium", "Hard", "Expert", "Nightmare")

#: Upper bound of each score band (inclusive). Calibrated on boards the
#: generator actually ships (see the M4 note in README): the default 8x8
#: spreads across all five levels while smaller boards cluster lower, which is
#: the gradient a daily puzzle wants. Re-tune when the generator's mix changes.
SCORE_BANDS = (20, 34, 48, 64)


@dataclass(frozen=True, slots=True)
class Difficulty:
    score: float
    level: int
    level_name: str
    needs_guessing: bool
    guesses: int
    deepest_rule: str
    rule_counts: dict[str, int]
    steps: int
    rounds: int


def score_difficulty(board: Board, *, guess_cap: int = DEFAULT_GUESS_CAP) -> Difficulty:
    """Rate `board` from its deduction trace.

    `guess_cap` bounds the hypothesis search behind the scenes; raising it makes
    scoring (`and generation`) slower in exchange for not writing off boards
    that only stall on a deeper pool. The generator's own boards are sized to
    stay well under the default.
    """
    trace = deduce(board, allow_guesses=True, guess_cap=guess_cap)

    counts = dict(trace.rule_counts)
    score = sum(counts.get(rule, 0) * weight for rule, weight in RULE_WEIGHTS.items())
    if trace.guesses:
        # Search effort shapes the tail of the range even though each trial is
        # already weighted: two guesses is worse than one, even when both are
        # single tries.
        score += trace.guesses * 0.5

    level = next(
        (i + 1 for i, band in enumerate(SCORE_BANDS) if score <= band),
        len(SCORE_BANDS) + 1,
    )
    if trace.guesses:
        level = max(level, GUESSING_FLOOR)

    deepest = max(
        counts,
        key=lambda rule: (RULE_WEIGHTS.get(rule, 0), rule),
        default="",
    )

    return Difficulty(
        score=score,
        level=level,
        level_name=LEVEL_NAMES[level - 1],
        needs_guessing=trace.guesses > 0,
        guesses=trace.guesses,
        deepest_rule=deepest,
        rule_counts=counts,
        steps=len(trace.steps),
        rounds=trace.rounds,
    )


__all__ = [
    "GUESSING_FLOOR",
    "LEVEL_NAMES",
    "RULE_WEIGHTS",
    "SCORE_BANDS",
    "Difficulty",
    "score_difficulty",
]
