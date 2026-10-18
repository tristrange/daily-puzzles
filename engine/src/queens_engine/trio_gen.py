"""Provisional Trio construction recipe, separate from the production publisher."""

from __future__ import annotations

from .prng import Prng
from .trio import (
    CELL_COUNT,
    SIDE,
    Relation,
    TrioGrid,
    TrioSearchLimitError,
    deduce,
    random_completion,
    solve,
)

INITIAL_RELATIONS = 24
CONSTRUCTION_ATTEMPTS = 10


class TrioGenerationError(RuntimeError):
    """The pilot recipe cannot certify a board inside its bounds."""


def generate(seed: int) -> TrioGrid:
    """Keep only clue removals that remain solvable by direct, recorded deductions."""
    if type(seed) is not int or not 0 <= seed < 2**32:
        raise ValueError("seed must be an unsigned 32-bit integer")
    prng = Prng(seed)
    solution: tuple[int, ...] | None = None
    for _ in range(CONSTRUCTION_ATTEMPTS):
        try:
            solution = random_completion(prng)
            break
        except TrioSearchLimitError:
            continue
    if solution is None:
        raise TrioGenerationError("all bounded construction searches were exhausted")

    neighbours = tuple(
        (a, b)
        for a in range(CELL_COUNT)
        for b in (a + 1, a + SIDE)
        if b < CELL_COUNT and (b == a + SIDE or a // SIDE == b // SIDE)
    )
    relations = [
        Relation(a, b, "same" if solution[a] == solution[b] else "different")
        for i in prng.shuffled(range(len(neighbours)))[:INITIAL_RELATIONS]
        for a, b in (neighbours[i],)
    ]
    givens = list(solution)
    for cell in prng.shuffled(range(CELL_COUNT)):
        givens[cell] = 0
        if not deduce(TrioGrid(tuple(givens), tuple(relations))).solved:
            givens[cell] = solution[cell]
    for edge in tuple(relations):
        remaining = tuple(item for item in relations if item != edge)
        if deduce(TrioGrid(tuple(givens), remaining)).solved:
            relations.remove(edge)
    grid = TrioGrid(tuple(givens), tuple(sorted(relations, key=lambda e: (e.first, e.second))))
    try:
        if solve(grid).solutions != (solution,):
            raise TrioGenerationError("candidate does not have exactly its constructed solution")
    except TrioSearchLimitError as error:
        raise TrioGenerationError("uniqueness verification was inconclusive") from error
    return grid
