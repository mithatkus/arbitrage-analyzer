from fastapi import APIRouter, Query
from app.database import get_pool

router = APIRouter(prefix="/api/prices", tags=["prices"])


@router.get("/live")
async def get_live_prices():
    """Latest CEX + DEX price for each active pair, with spread."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                tp.id           AS pair_id,
                tp.symbol,
                c.price         AS cex_price,
                c.bid,
                c.ask,
                d.price         AS dex_price,
                d.liquidity_usd,
                d.pool_fee_tier,
                CASE
                    WHEN LEAST(c.price, d.price) > 0
                    THEN ABS(c.price - d.price) / LEAST(c.price, d.price) * 10000
                    ELSE 0
                END             AS spread_bps,
                CASE
                    WHEN c.price > d.price THEN 'CEX_TO_DEX'
                    ELSE 'DEX_TO_CEX'
                END             AS direction,
                g.estimated_swap_cost_usd AS gas_cost_usd,
                g.base_fee_gwei,
                c.recorded_at   AS cex_updated_at,
                d.recorded_at   AS dex_updated_at
            FROM token_pairs tp
            JOIN LATERAL (
                SELECT price, bid, ask, recorded_at
                FROM cex_prices WHERE pair_id = tp.id
                ORDER BY recorded_at DESC LIMIT 1
            ) c ON true
            JOIN LATERAL (
                SELECT price, liquidity_usd, pool_fee_tier, recorded_at
                FROM dex_prices WHERE pair_id = tp.id
                ORDER BY recorded_at DESC LIMIT 1
            ) d ON true
            LEFT JOIN LATERAL (
                SELECT estimated_swap_cost_usd, base_fee_gwei
                FROM gas_prices ORDER BY recorded_at DESC LIMIT 1
            ) g ON true
            WHERE tp.is_active
            ORDER BY tp.id
            """
        )
    return [dict(r) for r in rows]


@router.get("/history")
async def get_price_history(
    pair_id: int = Query(...),
    hours: int = Query(default=1, ge=1, le=168),
):
    """Historical CEX and DEX prices for charting."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        cex_rows = await conn.fetch(
            """
            SELECT recorded_at AS time, price AS value, 'cex' AS source
            FROM cex_prices
            WHERE pair_id = $1 AND recorded_at >= NOW() - ($2 || ' hours')::INTERVAL
            ORDER BY recorded_at
            """,
            pair_id, str(hours),
        )
        dex_rows = await conn.fetch(
            """
            SELECT recorded_at AS time, price AS value, 'dex' AS source
            FROM dex_prices
            WHERE pair_id = $1 AND recorded_at >= NOW() - ($2 || ' hours')::INTERVAL
            ORDER BY recorded_at
            """,
            pair_id, str(hours),
        )
    return {
        "cex": [dict(r) for r in cex_rows],
        "dex": [dict(r) for r in dex_rows],
    }
