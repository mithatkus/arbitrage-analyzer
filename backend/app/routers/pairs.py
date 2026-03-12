from fastapi import APIRouter, HTTPException
from app.database import get_pool

router = APIRouter(prefix="/api/pairs", tags=["pairs"])


@router.get("")
async def list_pairs():
    """List all tracked pairs with latest prices."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                tp.id,
                tp.symbol,
                tp.base_token,
                tp.quote_token,
                tp.uniswap_pool_address,
                tp.binance_symbol,
                tp.is_active,
                c.price          AS cex_price,
                c.bid            AS cex_bid,
                c.ask            AS cex_ask,
                c.recorded_at    AS cex_updated_at,
                d.price          AS dex_price,
                d.liquidity_usd  AS dex_liquidity_usd,
                d.recorded_at    AS dex_updated_at
            FROM token_pairs tp
            LEFT JOIN LATERAL (
                SELECT price, bid, ask, recorded_at
                FROM cex_prices WHERE pair_id = tp.id
                ORDER BY recorded_at DESC LIMIT 1
            ) c ON true
            LEFT JOIN LATERAL (
                SELECT price, liquidity_usd, recorded_at
                FROM dex_prices WHERE pair_id = tp.id
                ORDER BY recorded_at DESC LIMIT 1
            ) d ON true
            WHERE tp.is_active
            ORDER BY tp.id
            """
        )
    return [dict(r) for r in rows]
