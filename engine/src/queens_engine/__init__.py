"""Engine for generating, validating and rating daily logic puzzles."""

from .board import MAX_SIZE, MIN_SIZE, Board, BoardError, PuzzleType
from .generator import (
    DEFAULT_ATTEMPTS,
    DEFAULT_SIZE,
    MAX_GENERATABLE_SIZE,
    MIN_GENERATABLE_SIZE,
    GenerationConfig,
    GenerationError,
    generate_puzzle,
    verify_replay,
)
from .prng import Prng
from .puzzle import (
    Puzzle,
    PuzzleParseError,
    dumps_puzzle,
    load_puzzle,
    parse_puzzle,
    puzzle_to_dict,
)
from .render import render_board, render_puzzle
from .solver import (
    DEFAULT_LIMIT,
    SolverError,
    count_solutions,
    format_solution,
    has_unique_solution,
    iter_solutions,
)

__all__ = [
    "DEFAULT_ATTEMPTS",
    "DEFAULT_LIMIT",
    "DEFAULT_SIZE",
    "MAX_GENERATABLE_SIZE",
    "MAX_SIZE",
    "MIN_GENERATABLE_SIZE",
    "MIN_SIZE",
    "Board",
    "BoardError",
    "GenerationConfig",
    "GenerationError",
    "Prng",
    "Puzzle",
    "PuzzleParseError",
    "PuzzleType",
    "SolverError",
    "count_solutions",
    "dumps_puzzle",
    "format_solution",
    "generate_puzzle",
    "has_unique_solution",
    "iter_solutions",
    "load_puzzle",
    "parse_puzzle",
    "puzzle_to_dict",
    "render_board",
    "render_puzzle",
    "verify_replay",
]
