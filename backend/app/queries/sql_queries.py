"""
Raw SQL showcase queries for the analytics endpoints.
These are intentionally written as raw SQL to demonstrate advanced PostgreSQL features
for portfolio/resume purposes: window functions, CTEs, percentile aggregates, etc.
"""

# ---------------------------------------------------------------------------
# 1. ROLLING SPREAD AVERAGE
#    5-minute and 1-hour rolling averages per pair using window functions.
#    ROWS BETWEEN N PRECEDING AND CURRENT ROW defines the rolling window.
# ---------------------------------------------------------------------------
ROLLING_SPREAD_SQL = """
WITH spread_series AS (
    -- Join CEX and DEX prices that are within 30 seconds of each other
    SELECT
        c.pair_id,
        c.recorded_at,
        ABS(c.price - d.price) / NULLIF(LEAST(c.price, d.price), 0) * 10000 AS spread_bps
    FROM cex_prices c
    INNER JOIN LATERAL (
        SELECT price
        FROM dex_prices d2
        WHERE d2.pair_id = c.pair_id
          AND d2.recorded_at BETWEEN c.recorded_at - INTERVAL '30 seconds'
                                 AND c.recorded_at + INTERVAL '30 seconds'
        ORDER BY ABS(EXTRACT(EPOCH FROM (d2.recorded_at - c.recorded_at)))
        LIMIT 1
    ) d ON true
    WHERE c.pair_id = $1
      AND c.recorded_at >= NOW() - ($2 || ' hours')::INTERVAL
),
windowed AS (
    SELECT
        pair_id,
        recorded_at,
        spread_bps,
        -- 5-minute rolling average: look back ~60 rows at 5-sec intervals
        AVG(spread_bps) OVER (
            PARTITION BY pair_id
            ORDER BY recorded_at
            ROWS BETWEEN 60 PRECEDING AND CURRENT ROW
        ) AS rolling_5min_avg,
        -- 1-hour rolling average: ~720 rows at 5-sec intervals
        AVG(spread_bps) OVER (
            PARTITION BY pair_id
            ORDER BY recorded_at
            ROWS BETWEEN 720 PRECEDING AND CURRENT ROW
        ) AS rolling_1hr_avg
    FROM spread_series
)
SELECT
    recorded_at,
    ROUND(spread_bps::NUMERIC, 2)          AS spread_bps,
    ROUND(rolling_5min_avg::NUMERIC, 2)    AS rolling_5min_avg_bps,
    ROUND(rolling_1hr_avg::NUMERIC, 2)     AS rolling_1hr_avg_bps
FROM windowed
ORDER BY recorded_at DESC
-- Return up to 2000 rows (at 5-second resolution, covers ~2.8 hours).
-- Caller should pass an appropriate hours window to limit data volume.
-- For 24h+ requests the frontend should downsample client-side.
LIMIT 2000;
"""

# ---------------------------------------------------------------------------
# 2. OPPORTUNITY CLUSTERING
#    Uses LAG/LEAD to identify clusters: opportunities that open within
#    30 seconds of each other. Assigns a cluster_id to each group.
# ---------------------------------------------------------------------------
OPPORTUNITY_CLUSTERING_SQL = """
WITH opportunity_gaps AS (
    SELECT
        id,
        pair_id,
        direction,
        spread_bps,
        net_profit_usd,
        opened_at,
        -- Time since previous opportunity for the same pair
        LAG(opened_at) OVER (
            PARTITION BY pair_id
            ORDER BY opened_at
        ) AS prev_opened_at,
        -- Time to next opportunity
        LEAD(opened_at) OVER (
            PARTITION BY pair_id
            ORDER BY opened_at
        ) AS next_opened_at
    FROM arbitrage_opportunities
    WHERE pair_id = $1
      AND opened_at >= NOW() - INTERVAL '24 hours'
),
cluster_starts AS (
    -- Mark the start of each new cluster (gap > 30s from previous)
    SELECT
        id,
        pair_id,
        direction,
        spread_bps,
        net_profit_usd,
        opened_at,
        CASE
            WHEN prev_opened_at IS NULL
              OR EXTRACT(EPOCH FROM (opened_at - prev_opened_at)) > 30
            THEN 1 ELSE 0
        END AS is_cluster_start
    FROM opportunity_gaps
),
clusters AS (
    -- Running sum of cluster starts = cluster ID
    SELECT
        *,
        SUM(is_cluster_start) OVER (
            PARTITION BY pair_id
            ORDER BY opened_at
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS cluster_id
    FROM cluster_starts
)
SELECT
    cluster_id,
    COUNT(*)                          AS cluster_size,
    MIN(opened_at)                    AS cluster_start,
    MAX(opened_at)                    AS cluster_end,
    ROUND(AVG(spread_bps)::NUMERIC, 2) AS avg_spread_bps,
    ROUND(MAX(spread_bps)::NUMERIC, 2) AS peak_spread_bps,
    ROUND(SUM(net_profit_usd)::NUMERIC, 4) AS total_net_profit
FROM clusters
GROUP BY cluster_id
ORDER BY cluster_start DESC
LIMIT 100;
"""

# ---------------------------------------------------------------------------
# 3. PROFITABILITY PERCENTILES
#    P25, P50, P75, P95 of net_profit_usd using PERCENTILE_CONT,
#    grouped by pair and direction.
# ---------------------------------------------------------------------------
PROFITABILITY_PERCENTILES_SQL = """
SELECT
    tp.symbol,
    ao.direction,
    COUNT(*)                                                        AS total_count,
    COUNT(*) FILTER (WHERE ao.is_profitable)                        AS profitable_count,
    ROUND(
        (COUNT(*) FILTER (WHERE ao.is_profitable)::NUMERIC
         / NULLIF(COUNT(*), 0) * 100), 1
    )                                                               AS win_rate_pct,
    -- Percentile calculations using ordered-set aggregate functions
    ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (
        ORDER BY ao.net_profit_usd
    )::NUMERIC, 4)                                                  AS p25_net_profit,
    ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (
        ORDER BY ao.net_profit_usd
    )::NUMERIC, 4)                                                  AS p50_net_profit,
    ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (
        ORDER BY ao.net_profit_usd
    )::NUMERIC, 4)                                                  AS p75_net_profit,
    ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (
        ORDER BY ao.net_profit_usd
    )::NUMERIC, 4)                                                  AS p95_net_profit,
    ROUND(AVG(ao.spread_bps)::NUMERIC, 2)                           AS avg_spread_bps,
    ROUND(MAX(ao.net_profit_usd)::NUMERIC, 4)                       AS best_trade
FROM arbitrage_opportunities ao
JOIN token_pairs tp ON tp.id = ao.pair_id
WHERE ao.status = 'closed'
GROUP BY tp.symbol, ao.direction
ORDER BY tp.symbol, ao.direction;
"""

# ---------------------------------------------------------------------------
# 4. GAS-ADJUSTED BREAK-EVEN ANALYSIS
#    CTE computes minimum spread needed to break even at different gas
#    price percentiles. Shows how gas cost erodes profitability.
# ---------------------------------------------------------------------------
GAS_BREAKEVEN_SQL = """
WITH gas_percentiles AS (
    -- Calculate gas cost at different percentile levels
    SELECT
        PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY estimated_swap_cost_usd) AS p25_gas,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY estimated_swap_cost_usd) AS p50_gas,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY estimated_swap_cost_usd) AS p75_gas,
        PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY estimated_swap_cost_usd) AS p90_gas,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY estimated_swap_cost_usd) AS p99_gas,
        AVG(base_fee_gwei)  AS avg_base_fee,
        AVG(priority_fee_gwei) AS avg_priority_fee
    FROM gas_prices
    WHERE recorded_at >= NOW() - INTERVAL '24 hours'
),
trade_sizes AS (
    -- Different trade sizes to analyze break-even at
    SELECT unnest(ARRAY[1000, 5000, 10000, 25000, 50000, 100000]) AS trade_size_usd
),
breakeven AS (
    -- For each gas percentile and trade size, compute break-even spread in bps
    -- break_even_spread = (gas_cost / trade_size) * 10000 + fixed_fee_bps
    --
    -- Fixed fee breakdown (applies regardless of gas price):
    --   • Uniswap v3 pool fee  : 5 bps  (0.05% tier, most ETH pairs)
    --   • Binance taker fee    : 10 bps (standard taker rate)
    --   • AMM price impact     : ~5 bps (estimate for $10K vs typical $5M pool depth)
    --   Total fixed fees       : 20 bps
    --
    -- Note: slippage scales with trade_size / pool_depth, so the 20 bps constant
    -- is only accurate near the $10K / $5M liquidity reference point. At smaller
    -- trade sizes slippage is proportionally lower; at larger sizes it is higher.
    SELECT
        t.trade_size_usd,
        ROUND((g.p25_gas / t.trade_size_usd * 10000 + 20)::NUMERIC, 2) AS breakeven_p25_gas_bps,
        ROUND((g.p50_gas / t.trade_size_usd * 10000 + 20)::NUMERIC, 2) AS breakeven_p50_gas_bps,
        ROUND((g.p75_gas / t.trade_size_usd * 10000 + 20)::NUMERIC, 2) AS breakeven_p75_gas_bps,
        ROUND((g.p90_gas / t.trade_size_usd * 10000 + 20)::NUMERIC, 2) AS breakeven_p90_gas_bps,
        ROUND((g.p99_gas / t.trade_size_usd * 10000 + 20)::NUMERIC, 2) AS breakeven_p99_gas_bps,
        ROUND(g.avg_base_fee::NUMERIC, 2)                               AS avg_base_fee_gwei,
        ROUND(g.avg_priority_fee::NUMERIC, 2)                           AS avg_priority_fee_gwei
    FROM trade_sizes t
    CROSS JOIN gas_percentiles g
)
SELECT * FROM breakeven
ORDER BY trade_size_usd;
"""

# ---------------------------------------------------------------------------
# 5. HOURLY HEATMAP DATA
#    Returns hour × day-of-week opportunity counts and avg profitability.
#    Used to build the heatmap showing when arbitrage is most frequent.
# ---------------------------------------------------------------------------
HEATMAP_SQL = """
SELECT
    EXTRACT(ISODOW FROM opened_at)::INTEGER   AS day_of_week,  -- 1=Mon … 7=Sun
    EXTRACT(HOUR FROM opened_at)::INTEGER      AS hour_of_day,
    COUNT(*)                                   AS opportunity_count,
    COUNT(*) FILTER (WHERE is_profitable)      AS profitable_count,
    ROUND(AVG(spread_bps)::NUMERIC, 2)         AS avg_spread_bps,
    ROUND(AVG(net_profit_usd)::NUMERIC, 4)     AS avg_net_profit,
    ROUND(SUM(net_profit_usd)::NUMERIC, 4)     AS total_net_profit
FROM arbitrage_opportunities
WHERE pair_id = ANY($1::int[])
  AND opened_at >= NOW() - INTERVAL '30 days'
  AND status = 'closed'
GROUP BY
    EXTRACT(ISODOW FROM opened_at),
    EXTRACT(HOUR FROM opened_at)
ORDER BY day_of_week, hour_of_day;
"""

# ---------------------------------------------------------------------------
# 6. CUMULATIVE P&L
#    Running SUM of net_profit_usd partitioned by pair, ordered by time.
#    Demonstrates window function for equity-curve-style charts.
# ---------------------------------------------------------------------------
CUMULATIVE_PNL_SQL = """
WITH closed_opps AS (
    SELECT
        ao.pair_id,
        tp.symbol,
        ao.opened_at                                        AS ts,
        ao.net_profit_usd,
        ao.direction,
        ao.spread_bps,
        ao.is_profitable
    FROM arbitrage_opportunities ao
    JOIN token_pairs tp ON tp.id = ao.pair_id
    WHERE ao.status = 'closed'
      AND ao.pair_id = ANY($1::int[])
      AND ao.opened_at >= NOW() - ($2 || ' days')::INTERVAL
),
cumulative AS (
    SELECT
        symbol,
        ts,
        net_profit_usd,
        direction,
        spread_bps,
        -- Running total PnL per pair
        SUM(net_profit_usd) OVER (
            PARTITION BY pair_id
            ORDER BY ts
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS cumulative_pnl,
        -- Row number for ordering
        ROW_NUMBER() OVER (PARTITION BY pair_id ORDER BY ts) AS seq
    FROM closed_opps
)
SELECT
    symbol,
    ts,
    ROUND(net_profit_usd::NUMERIC, 4)    AS net_profit_usd,
    ROUND(cumulative_pnl::NUMERIC, 4)    AS cumulative_pnl,
    direction,
    ROUND(spread_bps::NUMERIC, 2)        AS spread_bps,
    seq
FROM cumulative
ORDER BY ts;
"""

# ---------------------------------------------------------------------------
# 7. SPREAD DISTRIBUTION HISTOGRAM
#    Buckets spread_bps into bins for a histogram chart.
# ---------------------------------------------------------------------------
SPREAD_DISTRIBUTION_SQL = """
WITH bounds AS (
    SELECT
        MIN(spread_bps) AS min_spread,
        MAX(spread_bps) AS max_spread
    FROM arbitrage_opportunities
    WHERE pair_id = ANY($1::int[])
      AND opened_at >= NOW() - INTERVAL '7 days'
),
buckets AS (
    -- Create 30 equal-width buckets across the spread range
    SELECT
        width_bucket(
            ao.spread_bps,
            b.min_spread,
            b.max_spread + 0.0001,
            30
        )                           AS bucket,
        b.min_spread,
        b.max_spread
    FROM arbitrage_opportunities ao
    CROSS JOIN bounds b
    WHERE ao.pair_id = ANY($1::int[])
      AND ao.opened_at >= NOW() - INTERVAL '7 days'
)
SELECT
    bucket,
    -- Compute bucket midpoint for x-axis label
    ROUND(
        (min_spread + (max_spread - min_spread) / 30.0 * (bucket - 0.5))::NUMERIC,
        2
    )              AS spread_bps_midpoint,
    COUNT(*)       AS frequency
FROM buckets
GROUP BY bucket, min_spread, max_spread
ORDER BY bucket;
"""
