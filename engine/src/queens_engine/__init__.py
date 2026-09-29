"""Engine for generating, validating and rating daily logic puzzles."""

from .board import MAX_SIZE, MIN_SIZE, Board, BoardError, PuzzleType
from .puzzle import Puzzle, PuzzleParseError, load_puzzle, parse_puzzle
from .solver import (
    DEFAULT_LIMIT,
    SolverError,
    count_solutions,
    format_solution,
    has_unique_solution,
    iter_solutions,
)

__all__ = [
    "DEFAULT_LIMIT",
    "MAX_SIZE",
    "MIN_SIZE",
    "Board",
    "BoardError",
    "Puzzle",
    "PuzzleParseError",
    "PuzzleType",
    "SolverError",
    "count_solutions",
    "format_solution",
    "has_unique_solution",
    "iter_solutions",
    "load_puzzle",
    "parse_puzzle",
]
