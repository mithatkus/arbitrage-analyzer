#!/usr/bin/env python3
"""
Seed Data Generator
Populates 7 days of realistic historical data for all 3 pairs.
Run: python seed_data.py

P&L MODEL (matches arbitrage_engine.py exactly):
  gross              = spread_bps / 10_000 * trade_size
  pool_fee           = (pool_fee_tier / 1_000_000) * trade_size   # Uniswap v3 swap fee
  cex_taker_fee      = CEX_TAKER_FEE_RATE * trade_size            # Binance 10 bps
  slippage           = AMM price-impact based on trade_size / pool_liquidity
  slippage_estimate  = pool_fee + cex_taker_fee + slippage         # stored in DB column
  net                = gross - gas_cost - slippage_estimate

Target statistics (validated at bottom of seed()):
  win rate  ~40%   (a realistic fraction for small-to-mid size trades)
  total P&L ~$3-6K (modest positive expectancy driven by occasional high-spread wins)
"""
import asyncio
import argparse
import logging
import math
import random
from datetime import datetime, timedelta, timezone

import asyncpg

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

DB_URL = "postgresql://arb_user:arb_pass@localhost:5432/arbitrage_db"

# Realistic base prices
BASE_PRICES = {
    "ETH/USDC":  3100.0,
    "WBTC/USDC": 65000.0,
    "ARB/USDC":  1.15,
}

PRICE_VOLATILITY = {
    "ETH/USDC":  0.0008,
    "WBTC/USDC": 0.0006,
    "ARB/USDC":  0.0015,
}

# Interval between price samples (5 seconds)
PRICE_INTERVAL = 5

# Number of simulated opportunities per pair
# 500 × 3 pairs = 1500 total → statistically meaningful sample
N_OPPS_PER_PAIR = 500

# --- Fee constants (must match arbitrage_engine.py) ---
# Binance standard taker fee
CEX_TAKER_FEE_RATE = 0.001   # 0.10% = 10 bps

# Uniswap v3 pool_fee_tier units: 1 unit = 1/1_000_000
# 500 = 0.05%, 3000 = 0.30%, 10000 = 1.00%
POOL_FEE_TIER = 500           # All seed pairs use the 0.05% fee tier

# AMM price impact coefficient (linear approximation, see engine comments)
AMM_PRICE_IMPACT_COEFF = 0.5
MAX_SLIPPAGE_RATE = 0.005


def gbm_prices(
    base: float,
    volatility: float,
    n_steps: int,
    dt: float = PRICE_INTERVAL / 86400,
) -> list[float]:
    """Geometric Brownian Motion price series."""
    prices = [base]
    for _ in range(n_steps - 1):
        drift = -0.5 * volatility**2 * dt
        shock = volatility * math.sqrt(dt) * random.gauss(0, 1)
        prices.append(prices[-1] * math.exp(drift + shock))
    return prices


def spread_series(n: int, base_bps: float = 8.0, spike_prob: float = 0.01) -> list[float]:
    """
    Generate realistic spread series:
    - Baseline tight spread (3-12 bps, mean-reverting)
    - Occasional spikes to 30-150 bps representing real arbitrage windows
    """
    spreads = []
    current = base_bps
    for _ in range(n):
        if random.random() < spike_prob:
            spike = 30.0 + random.expovariate(1 / 40)
            current = min(spike, 200.0)
        else:
            noise = random.gauss(0, 1.5)
            current = current * 0.95 + base_bps * 0.05 + noise
            current = max(0.5, current)
        spreads.append(current)
    return spreads


def compute_execution_costs(
    trade_size: float,
    pool_fee_tier: int,
    liquidity_usd: float,
) -> float:
    """
    Returns total non-gas execution costs (stored as slippage_estimate_usd).

    Breakdown:
    1. DEX pool swap fee  — deducted by the pool contract from swap output
    2. CEX taker fee      — paid to Binance on the market-sell leg
    3. AMM price impact   — conservative linear estimate based on pool depth

    Slippage formula: trade / liquidity × AMM_coeff, capped at MAX_SLIPPAGE_RATE.
    This is a first-order approximation; Uniswap v3 concentrated liquidity can
    produce lower slippage in-range but much higher slippage once ticks are crossed.
    """
    pool_fee   = (pool_fee_tier / 1_000_000) * trade_size
    cex_fee    = CEX_TAKER_FEE_RATE * trade_size
    eff_liq    = max(100_000, liquidity_usd)
    slip_rate  = min(MAX_SLIPPAGE_RATE, trade_size / eff_liq * AMM_PRICE_IMPACT_COEFF)
    slippage   = slip_rate * trade_size
    return pool_fee + cex_fee + slippage


async def seed(conn: asyncpg.Connection, days: int = 7) -> None:
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=days)

    # Wipe existing seed data to prevent duplicates on re-run
    logger.info("Truncating existing data…")
    await conn.execute("""
        TRUNCATE TABLE
            arbitrage_opportunities,
            daily_analytics,
            gas_prices,
            dex_prices,
            cex_prices
        RESTART IDENTITY CASCADE
    """)

    # Get pair IDs
    pairs = await conn.fetch("SELECT id, symbol FROM token_pairs WHERE is_active ORDER BY id")
    if not pairs:
        logger.error("No active pairs found. Did you run db/init.sql?")
        return

    total_seconds = int(timedelta(days=days).total_seconds())
    n_steps = total_seconds // PRICE_INTERVAL

    logger.info("Seeding %d steps (%d days) for %d pairs…", n_steps, days, len(pairs))

    for pair in pairs:
        pair_id = pair["id"]
        symbol = pair["symbol"]
        base = BASE_PRICES.get(symbol, 100.0)
        vol = PRICE_VOLATILITY.get(symbol, 0.001)

        logger.info("  Generating prices for %s (pair_id=%d)…", symbol, pair_id)

        cex_prices_list = gbm_prices(base, vol, n_steps)
        spreads = spread_series(n_steps)

        cex_records = []
        dex_records = []
        for i, (cex_p, spread) in enumerate(zip(cex_prices_list, spreads)):
            ts = start + timedelta(seconds=i * PRICE_INTERVAL)
            bid = cex_p * (1 - 0.0001)
            ask = cex_p * (1 + 0.0001)
            cex_records.append((pair_id, cex_p, bid, ask, None, "binance", ts))

            direction_sign = 1.0 if random.random() > 0.5 else -1.0
            dex_p = cex_p * (1 + direction_sign * spread / 10000)
            liquidity = random.uniform(2_000_000, 15_000_000)
            dex_records.append((pair_id, dex_p, liquidity, POOL_FEE_TIER, "0", 0, "uniswap_v3", ts))

        chunk = 5000
        for i in range(0, len(cex_records), chunk):
            await conn.executemany(
                """
                INSERT INTO cex_prices (pair_id, price, bid, ask, volume_24h, source, recorded_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7)
                ON CONFLICT DO NOTHING
                """,
                cex_records[i : i + chunk],
            )

        for i in range(0, len(dex_records), chunk):
            await conn.executemany(
                """
                INSERT INTO dex_prices
                    (pair_id, price, liquidity_usd, pool_fee_tier, sqrt_price_x96, tick, source, recorded_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                ON CONFLICT DO NOTHING
                """,
                dex_records[i : i + chunk],
            )

        logger.info("  ✓ %s: %d CEX + %d DEX records", symbol, len(cex_records), len(dex_records))

    # Gas prices — one record per minute, 7 days
    logger.info("Seeding gas prices…")
    gas_records = []
    n_gas = total_seconds // 60
    base_fee = 20.0
    eth_price = BASE_PRICES["ETH/USDC"]
    for i in range(n_gas):
        ts = start + timedelta(minutes=i)
        # Slowly mean-reverting base fee with diurnal-ish variation
        base_fee = max(5.0, base_fee * 0.99 + random.gauss(20, 5) * 0.01)
        priority = random.uniform(0.5, 2.5)
        # estimated_swap_cost = gas_price_gwei × 150k_units × ETH_price / 1e9
        cost_usd = (base_fee + priority) * 1e-9 * 150_000 * eth_price
        gas_records.append((base_fee, priority, eth_price, cost_usd, ts))

    await conn.executemany(
        """
        INSERT INTO gas_prices (base_fee_gwei, priority_fee_gwei, eth_price_usd, estimated_swap_cost_usd, recorded_at)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT DO NOTHING
        """,
        gas_records,
    )
    logger.info("  ✓ %d gas price records", len(gas_records))

    # ------------------------------------------------------------------ #
    # Arbitrage opportunities — parametric generation                      #
    #                                                                      #
    # Spread distribution: 30 + Exp(mean=29) bps                          #
    #   → mean spread ≈ 59 bps, exponential tail models rare large spikes  #
    #   → with total costs ~$57/trade (at $10K), win rate ≈ 40%           #
    #                                                                      #
    # All costs use the SAME formulas as arbitrage_engine.py so seed data  #
    # is internally consistent with the live detection model.              #
    # ------------------------------------------------------------------ #
    logger.info("Seeding arbitrage opportunities…")
    opp_records = []

    # Spread calibration: using Exp(1/32) gives mean spread ≈ 62 bps.
    # Target win rate derivation (for $10K trade, mean pool liquidity $8.5M):
    #   execution_costs = pool_fee($5) + cex_fee($10) + slippage($5.88) = $20.88
    #   gas_mean = $38 → total mean cost = $58.88
    #   P(win) = P(30 + Exp(1/32) > 58.88) = exp(-(58.88-30)/32) = exp(-0.903) ≈ 40%
    #   E[net] ≈ 62 - 58.88 = $3.12/opp → 1500 opps ≈ $4,680 total P&L
    SPREAD_EXP_MEAN = 32.0

    # Fixed trade size of $10K: gas dominates at small sizes, profitable at large sizes.
    # Using a constant makes win-rate analysis straightforward for portfolio reviewers.
    TRADE_SIZE = 10_000.0

    for pair in pairs:
        pair_id = pair["id"]
        symbol = pair["symbol"]
        base = BASE_PRICES.get(symbol, 100.0)

        # Random timestamps distributed uniformly across all 7 days.
        # Sorting ensures opened_at < closed_at and avoids anomalies in window queries.
        open_times = sorted(
            start + timedelta(seconds=random.randint(0, total_seconds - 7200))
            for _ in range(N_OPPS_PER_PAIR)
        )

        for ts_open in open_times:
            # Duration: realistic CEX-DEX arb closes in seconds to low minutes.
            # Most windows close as faster bots trade them away; 10-120s is realistic
            # for this simulation (not milliseconds, since we poll at 3s intervals).
            duration = random.randint(10, 120)
            ts_close = ts_open + timedelta(seconds=duration)

            # Spread: must exceed the open threshold (30 bps) to be detected.
            # Exponential distribution models the fat-tailed nature of spread spikes:
            # most just above threshold, occasional large dislocations.
            spread_bps = 30.0 + random.expovariate(1 / SPREAD_EXP_MEAN)

            direction = random.choice(["CEX_TO_DEX", "DEX_TO_CEX"])
            price_jitter = random.uniform(0.97, 1.03)
            cex_p = base * price_jitter
            sign = 1.0 if direction == "CEX_TO_DEX" else -1.0
            dex_p = cex_p * (1.0 - sign * spread_bps / 10_000)

            # Simulate representative pool depth; real liquidity changes block-by-block
            pool_liquidity = random.uniform(2_000_000, 15_000_000)

            gross = spread_bps / 10_000 * TRADE_SIZE
            # Gas: modelled as ~150k gas × gas_price × ETH/USD.
            # Ethereum mainnet gas price is highly volatile. The range $20-56 captures
            # typical conditions (base fee 10-50 gwei + priority fee 1-3 gwei).
            # Mean $38 × 150k gas × ~$3100/ETH / 1e9 ≈ $17.5 pure gas; wider range
            # also models execution slippage due to tx-submission latency (mempool wait
            # + block confirmation time ~12s can erode the spread before settlement).
            gas_cost = random.uniform(20.0, 56.0)   # mean ~$38
            execution_costs = compute_execution_costs(TRADE_SIZE, POOL_FEE_TIER, pool_liquidity)
            net = gross - gas_cost - execution_costs
            is_profitable = net > 0

            # 90% of opportunities resolve (closed); 10% expire before mean-reversion
            status = "expired" if random.random() < 0.10 else "closed"
            closed_at = ts_close if status == "closed" else None

            opp_records.append((
                pair_id, direction, cex_p, dex_p,
                spread_bps, gross, gas_cost, execution_costs, net,
                is_profitable, TRADE_SIZE,
                ts_open, closed_at, duration, status,
            ))

    await conn.executemany(
        """
        INSERT INTO arbitrage_opportunities
            (pair_id, direction, cex_price, dex_price, spread_bps,
             gross_profit_usd, gas_cost_usd, slippage_estimate_usd, net_profit_usd,
             is_profitable, trade_size_usd, opened_at, closed_at, duration_seconds, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        """,
        opp_records,
    )

    wins = sum(1 for r in opp_records if r[9])  # is_profitable
    total_net = sum(r[8] for r in opp_records)  # net_profit_usd
    logger.info(
        "  ✓ %d opportunities | win rate %.1f%% | total net $%.0f",
        len(opp_records),
        wins / len(opp_records) * 100,
        total_net,
    )

    # Refresh materialized daily analytics
    await conn.execute("SELECT refresh_daily_analytics()")
    logger.info("Daily analytics refreshed")
    logger.info("Seed complete!")


async def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the arbitrage database with demo data")
    parser.add_argument("--db-url", default=DB_URL)
    parser.add_argument("--days", type=int, default=7)
    args = parser.parse_args()

    conn = await asyncpg.connect(args.db_url)
    try:
        await seed(conn, args.days)
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
