"""Engine for generating, validating and rating daily logic puzzles."""

from .board import MAX_SIZE, MIN_SIZE, Board, BoardError, PuzzleType
from .deduce import (
    DEFAULT_GUESS_CAP,
    DeductionError,
    DeductionStep,
    DeductionTrace,
    ForcedMove,
    deduce,
    first_forced_move,
)
from .difficulty import (
    GUESSING_FLOOR,
    LEVEL_NAMES,
    RULE_WEIGHTS,
    SCORE_BANDS,
    Difficulty,
    score_difficulty,
)
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
    "DEFAULT_GUESS_CAP",
    "DEFAULT_LIMIT",
    "DEFAULT_SIZE",
    "GUESSING_FLOOR",
    "LEVEL_NAMES",
    "MAX_GENERATABLE_SIZE",
    "MAX_SIZE",
    "MIN_GENERATABLE_SIZE",
    "MIN_SIZE",
    "RULE_WEIGHTS",
    "SCORE_BANDS",
    "Board",
    "BoardError",
    "DeductionError",
    "DeductionStep",
    "DeductionTrace",
    "Difficulty",
    "ForcedMove",
    "GenerationConfig",
    "GenerationError",
    "Prng",
    "Puzzle",
    "PuzzleParseError",
    "PuzzleType",
    "SolverError",
    "count_solutions",
    "deduce",
    "dumps_puzzle",
    "first_forced_move",
    "format_solution",
    "generate_puzzle",
    "has_unique_solution",
    "iter_solutions",
    "load_puzzle",
    "parse_puzzle",
    "puzzle_to_dict",
    "render_board",
    "render_puzzle",
    "score_difficulty",
    "verify_replay",
]
