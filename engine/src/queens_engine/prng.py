"""A small, pinned pseudo-random number generator.

Puzzle generation must replay byte-for-byte from a stored seed, forever. Python's
`random` module explicitly does not guarantee that across versions, so the engine
uses a hand-rolled SplitMix64 instead: nothing but 64-bit integer arithmetic,
which is deterministic on every platform and Python version, and simple enough to
fit on one screen. Bumping the algorithm is a `generatorVersion` bump, not a
mysterious CI failure.
"""

from __future__ import annotations

from collections.abc import Iterator, Sequence
from typing import Final

U64_MASK: Final[int] = (1 << 64) - 1
GOLDEN_RATIO: Final[int] = 0x9E3779B97F4A7C15


class Prng:
    """SplitMix64: counter-based, seeded directly from the puzzle `seed`.

    `seed` accepts any value; callers are responsible for keeping it inside the
    schema's 0..2^32-1 range.
    """

    __slots__ = ("_state",)

    def __init__(self, seed: int) -> None:
        self._state = seed & U64_MASK

    def next_u64(self) -> int:
        """The next 64-bit value in the stream."""
        self._state = (self._state + GOLDEN_RATIO) & U64_MASK
        state = self._state
        state = (state ^ (state >> 30)) * 0xBF58476D1CE4E5B9 & U64_MASK
        state = (state ^ (state >> 27)) * 0x94D049BB133111EB & U64_MASK
        return state ^ (state >> 31)

    def below(self, n: int) -> int:
        """A uniform integer in [0, n) with no modulo bias."""
        if n <= 0:
            raise ValueError(f"n must be positive, got {n}")
        # Rejection sampling: keep only draws from a range that is an exact
        # multiple of n, so every bucket is equally likely.
        limit = U64_MASK + 1 - ((U64_MASK + 1) % n)
        while True:
            value = self.next_u64()
            if value < limit:
                return value % n

    def shuffled(self, items: Sequence[int]) -> list[int]:
        """A uniformly random permutation, in place-friendly Fisher-Yates."""
        result = list(items)
        for i in range(len(result) - 1, 0, -1):
            j = self.below(i + 1)
            result[i], result[j] = result[j], result[i]
        return result


def iter_u64(seed: int) -> Iterator[int]:
    """Yields the infinite u64 stream for `seed` without holding a Prng."""
    prng = Prng(seed)
    while True:
        yield prng.next_u64()


__all__ = ["GOLDEN_RATIO", "U64_MASK", "Prng", "iter_u64"]
