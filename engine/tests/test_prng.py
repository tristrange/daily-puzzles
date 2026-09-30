"""The PRNG is the replay guarantee: any change to its stream silently breaks
every puzzle generated with an older generatorVersion. So it is pinned with
golden vectors and cross-checked for the properties replay depends on.
"""

from __future__ import annotations

from hypothesis import given, settings
from hypothesis import strategies as st

from queens_engine.prng import Prng

# Golden vectors from a reference SplitMix64 implementation. If these change,
# every puzzle generated with generatorVersion 1 is no longer replayable, so a
# change here is a breaking change, not a refactor.
GOLDEN = {
    0: 0xE220A8397B1DCDAF,
    1: 0x910A2DEC89025CC1,
    42: 0xBDD732262FEB6E95,
}


def test_golden_seed_stream_is_pinned() -> None:
    for seed, expected in GOLDEN.items():
        assert Prng(seed).next_u64() == expected


def test_same_seed_replays_exactly() -> None:
    first = [Prng(42).next_u64() for _ in range(100)]
    second = [Prng(42).next_u64() for _ in range(100)]
    assert first == second


def test_different_seed_diverges() -> None:
    a = Prng(1)
    b = Prng(2)
    assert [a.next_u64() for _ in range(10)] != [b.next_u64() for _ in range(10)]


@settings(deadline=None)
@given(st.integers(min_value=1, max_value=10_000))
def test_below_stays_in_range(n: int) -> None:
    prng = Prng(7)
    for _ in range(100):
        assert 0 <= prng.below(n) < n


def test_below_is_uniform() -> None:
    """Within a single stream, bucketed counts should not be wildly uneven."""
    prng = Prng(99)
    buckets = 6
    draws = 60_000
    counts = [0] * buckets
    for _ in range(draws):
        counts[prng.below(buckets)] += 1
    expected = draws / buckets
    for count in counts:
        assert abs(count - expected) < 6 * (expected**0.5)


def test_below_rejects_non_positive() -> None:
    prng = Prng(1)
    for bad in (0, -1):
        with __import__("pytest").raises(ValueError):
            prng.below(bad)


def test_shuffled_is_a_permutation() -> None:
    prng = Prng(5)
    items = list(range(20))
    shuffled = prng.shuffled(items)
    assert sorted(shuffled) == items


def test_shuffled_depends_on_seed() -> None:
    a = Prng(7).shuffled(range(30))
    b = Prng(8).shuffled(range(30))
    assert a != b
