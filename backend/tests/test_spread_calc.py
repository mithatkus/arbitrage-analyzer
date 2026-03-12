"""Tests for spread calculation logic."""
import pytest


def compute_spread_bps(cex: float, dex: float) -> float:
    min_p = min(cex, dex)
    if min_p <= 0:
        return 0.0
    return abs(cex - dex) / min_p * 10000


@pytest.mark.parametrize("cex,dex,expected_bps", [
    (100.0, 100.0, 0.0),
    (100.0, 100.1, pytest.approx(9.99, rel=0.01)),   # ~10 bps
    (100.0, 100.3, pytest.approx(29.91, rel=0.01)),  # ~30 bps
    (3100.0, 3100.0 * 1.005, pytest.approx(49.75, rel=0.01)),  # ~50 bps
    (65000.0, 64935.0, pytest.approx(10.0, rel=0.01)),
])
def test_spread_bps(cex, dex, expected_bps):
    assert compute_spread_bps(cex, dex) == expected_bps


def test_spread_bps_zero_price():
    assert compute_spread_bps(0.0, 100.0) == 0.0


def test_spread_direction():
    """CEX > DEX → direction is CEX_TO_DEX."""
    cex, dex = 100.0, 99.9
    direction = "CEX_TO_DEX" if cex > dex else "DEX_TO_CEX"
    assert direction == "CEX_TO_DEX"
