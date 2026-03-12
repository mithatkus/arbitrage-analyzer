"""
UniswapPriceService
Polls The Graph's Uniswap v3 subgraph for pool price, liquidity, and tick data.
Inserts into dex_prices every 10-15 seconds.
"""
import asyncio
import logging
import math
from datetime import datetime, timezone

import aiohttp

from app.database import get_pool
from app.config import get_settings

logger = logging.getLogger(__name__)

THEGRAPH_URL = (
    "https://gateway.thegraph.com/api/{key}/subgraphs/id/"
    "5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV"
)

# Map our symbol → Uniswap pool address (lowercase)
POOL_MAP = {
    "ETH/USDC":  "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640",
    "WBTC/USDC": "0x99ac8ca7087fa4a2a1fb6357269965a2014abc35",
    "ARB/USDC":  "0xcda53b1f66614552f834ceef361a8d12a0b8dad8",
}

GRAPHQL_QUERY = """
{
  pools(where: {id_in: %s}) {
    id
    token0Price
    token1Price
    liquidity
    feeTier
    sqrtPrice
    tick
    totalValueLockedUSD
  }
}
"""


def sqrt_price_x96_to_price(sqrt_price_x96: str, decimals0: int = 6, decimals1: int = 18) -> float:
    """Convert Uniswap sqrtPriceX96 to human-readable price."""
    try:
        sp = int(sqrt_price_x96)
        price = (sp / (2**96)) ** 2
        # Adjust for decimal difference (token0=USDC 6 decimals, token1=ETH 18 decimals)
        price = price * (10 ** decimals0) / (10 ** decimals1)
        return 1.0 / price if price > 0 else 0.0
    except (ValueError, ZeroDivisionError):
        return 0.0


class UniswapPriceService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self._running = False
        self._pair_id_cache: dict[str, int] = {}
        self.connected = False
        self._poll_interval = 12  # seconds

    async def _load_pair_ids(self) -> None:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch("SELECT id, symbol FROM token_pairs WHERE is_active")
            self._pair_id_cache = {row["symbol"]: row["id"] for row in rows}

    async def _fetch_pool_data(self, session: aiohttp.ClientSession) -> list[dict]:
        if not self.settings.thegraph_api_key:
            return []
        url = THEGRAPH_URL.format(key=self.settings.thegraph_api_key)
        pool_ids = str([addr.lower() for addr in POOL_MAP.values()]).replace("'", '"')
        query = GRAPHQL_QUERY % pool_ids
        try:
            async with session.post(url, json={"query": query}, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                resp.raise_for_status()
                data = await resp.json()
                return data.get("data", {}).get("pools", [])
        except Exception as exc:
            logger.warning("Uniswap graph fetch error: %s", exc)
            return []

    async def _store_prices(self, pools: list[dict]) -> None:
        if not pools:
            return
        # Build reverse lookup: pool_address → symbol
        addr_to_symbol = {v.lower(): k for k, v in POOL_MAP.items()}
        records = []
        for pool in pools:
            symbol = addr_to_symbol.get(pool["id"].lower())
            if not symbol or symbol not in self._pair_id_cache:
                continue
            pair_id = self._pair_id_cache[symbol]
            try:
                price = float(pool["token0Price"])  # token0Price = price of token0 in token1
                liquidity_usd = float(pool.get("totalValueLockedUSD", 0))
                fee_tier = int(pool.get("feeTier", 500))
                sqrt_price = pool.get("sqrtPrice", "0")
                tick = int(pool.get("tick", 0) or 0)
                records.append((
                    pair_id, price, liquidity_usd, fee_tier,
                    sqrt_price, tick, datetime.now(timezone.utc),
                ))
            except (ValueError, TypeError) as exc:
                logger.warning("Price parse error for %s: %s", symbol, exc)

        if not records:
            return
        db_pool = await get_pool()
        async with db_pool.acquire() as conn:
            await conn.executemany(
                """
                INSERT INTO dex_prices
                    (pair_id, price, liquidity_usd, pool_fee_tier, sqrt_price_x96, tick, source, recorded_at)
                VALUES ($1, $2, $3, $4, $5, $6, 'uniswap_v3', $7)
                """,
                records,
            )
        self.connected = True

    async def start(self) -> None:
        self._running = True
        await self._load_pair_ids()
        async with aiohttp.ClientSession() as session:
            while self._running:
                try:
                    pools = await self._fetch_pool_data(session)
                    await self._store_prices(pools)
                except Exception as exc:
                    logger.error("Uniswap service error: %s", exc)
                    self.connected = False
                await asyncio.sleep(self._poll_interval)

    async def stop(self) -> None:
        self._running = False
        self.connected = False
