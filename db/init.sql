-- =============================================================================
-- DEX vs CEX Arbitrage Analyzer — Database Schema
-- PostgreSQL 15+
-- =============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- =============================================================================
-- TABLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS token_pairs (
    id              SERIAL PRIMARY KEY,
    symbol          VARCHAR(20) NOT NULL UNIQUE,          -- e.g. "ETH/USDC"
    base_token      VARCHAR(20) NOT NULL,
    quote_token     VARCHAR(20) NOT NULL,
    uniswap_pool_address VARCHAR(42),
    binance_symbol  VARCHAR(20),                          -- e.g. "ETHUSDC"
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cex_prices (
    id          BIGSERIAL PRIMARY KEY,
    pair_id     INTEGER NOT NULL REFERENCES token_pairs(id) ON DELETE CASCADE,
    price       NUMERIC(20,8) NOT NULL,
    bid         NUMERIC(20,8),
    ask         NUMERIC(20,8),
    volume_24h  NUMERIC(20,8),
    source      VARCHAR(30) DEFAULT 'binance',
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cex_prices_pair_time
    ON cex_prices(pair_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS dex_prices (
    id                  BIGSERIAL PRIMARY KEY,
    pair_id             INTEGER NOT NULL REFERENCES token_pairs(id) ON DELETE CASCADE,
    price               NUMERIC(20,8) NOT NULL,
    liquidity_usd       NUMERIC(20,2),
    pool_fee_tier       INTEGER,                          -- fee tier in bps (e.g. 500 = 0.05%)
    sqrt_price_x96      NUMERIC,
    tick                INTEGER,
    source              VARCHAR(30) DEFAULT 'uniswap_v3',
    recorded_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dex_prices_pair_time
    ON dex_prices(pair_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS gas_prices (
    id                      BIGSERIAL PRIMARY KEY,
    base_fee_gwei           NUMERIC(10,4),
    priority_fee_gwei       NUMERIC(10,4),
    eth_price_usd           NUMERIC(20,2),
    estimated_swap_cost_usd NUMERIC(10,4),
    recorded_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gas_prices_time
    ON gas_prices(recorded_at DESC);

CREATE TABLE IF NOT EXISTS arbitrage_opportunities (
    id                  BIGSERIAL PRIMARY KEY,
    pair_id             INTEGER NOT NULL REFERENCES token_pairs(id) ON DELETE CASCADE,
    direction           VARCHAR(20) NOT NULL CHECK (direction IN ('DEX_TO_CEX', 'CEX_TO_DEX')),
    cex_price           NUMERIC(20,8) NOT NULL,
    dex_price           NUMERIC(20,8) NOT NULL,
    spread_bps          NUMERIC(10,4) NOT NULL,
    gross_profit_usd    NUMERIC(10,4),
    gas_cost_usd        NUMERIC(10,4),
    slippage_estimate_usd NUMERIC(10,4),
    net_profit_usd      NUMERIC(10,4),
    is_profitable       BOOLEAN DEFAULT false,
    trade_size_usd      NUMERIC(20,2) DEFAULT 10000,
    opened_at           TIMESTAMPTZ DEFAULT NOW(),
    closed_at           TIMESTAMPTZ,
    duration_seconds    INTEGER,
    status              VARCHAR(10) DEFAULT 'open' CHECK (status IN ('open', 'closed', 'expired'))
);

CREATE INDEX IF NOT EXISTS idx_arb_pair_time
    ON arbitrage_opportunities(pair_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_arb_status
    ON arbitrage_opportunities(status);
CREATE INDEX IF NOT EXISTS idx_arb_profitable
    ON arbitrage_opportunities(is_profitable, opened_at DESC);

-- =============================================================================
-- SEED: Token Pairs
-- =============================================================================

INSERT INTO token_pairs (symbol, base_token, quote_token, uniswap_pool_address, binance_symbol)
VALUES
    ('ETH/USDC',  'ETH',  'USDC', '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640', 'ETHUSDC'),
    ('WBTC/USDC', 'WBTC', 'USDC', '0x99ac8ca7087fa4a2a1fb6357269965a2014abc35', 'BTCUSDC'),
    ('ARB/USDC',  'ARB',  'USDC', '0xcda53b1f66614552f834ceef361a8d12a0b8dad8', 'ARBUSDC')
ON CONFLICT (symbol) DO NOTHING;

-- =============================================================================
-- DAILY ANALYTICS TABLE (populated by scheduled query)
-- =============================================================================

CREATE TABLE IF NOT EXISTS daily_analytics (
    id                  SERIAL PRIMARY KEY,
    date                DATE NOT NULL,
    pair_id             INTEGER NOT NULL REFERENCES token_pairs(id),
    total_opportunities INTEGER DEFAULT 0,
    profitable_count    INTEGER DEFAULT 0,
    avg_spread_bps      NUMERIC(10,4),
    max_spread_bps      NUMERIC(10,4),
    total_net_pnl       NUMERIC(20,4),
    avg_duration_seconds NUMERIC(10,2),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (date, pair_id)
);

-- =============================================================================
-- ANALYTICS REFRESH FUNCTION
-- Called periodically to maintain daily_analytics
-- =============================================================================

CREATE OR REPLACE FUNCTION refresh_daily_analytics()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO daily_analytics (
        date, pair_id, total_opportunities, profitable_count,
        avg_spread_bps, max_spread_bps, total_net_pnl, avg_duration_seconds
    )
    SELECT
        DATE(opened_at)                        AS date,
        pair_id,
        COUNT(*)                               AS total_opportunities,
        COUNT(*) FILTER (WHERE is_profitable)  AS profitable_count,
        AVG(spread_bps)                        AS avg_spread_bps,
        MAX(spread_bps)                        AS max_spread_bps,
        SUM(net_profit_usd)                    AS total_net_pnl,
        AVG(duration_seconds)                  AS avg_duration_seconds
    FROM arbitrage_opportunities
    WHERE status = 'closed'
    GROUP BY DATE(opened_at), pair_id
    ON CONFLICT (date, pair_id) DO UPDATE SET
        total_opportunities  = EXCLUDED.total_opportunities,
        profitable_count     = EXCLUDED.profitable_count,
        avg_spread_bps       = EXCLUDED.avg_spread_bps,
        max_spread_bps       = EXCLUDED.max_spread_bps,
        total_net_pnl        = EXCLUDED.total_net_pnl,
        avg_duration_seconds = EXCLUDED.avg_duration_seconds,
        updated_at           = NOW();
END;
$$;
