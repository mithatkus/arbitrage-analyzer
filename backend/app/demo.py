"""
Demo Replay Service
In demo mode, streams historical seed data through the WebSocket
at accelerated speed to simulate live activity for recruiters.
"""
import asyncio
import json
import logging
import random
from datetime import datetime, timezone

from app.database import get_pool

logger = logging.getLogger(__name__)


class DemoReplayService:
    def __init__(self, ws_manager) -> None:
        self.ws_manager = ws_manager
        self._running = False
        self._speed = 10  # 10x real-time

    async def start(self) -> None:
        self._running = True
        pair_ids = await self._get_pair_ids()
        while self._running:
            try:
                await self._replay_tick(pair_ids)
            except Exception as exc:
                logger.error("Demo replay error: %s", exc)
            await asyncio.sleep(1.0 / self._speed)

    async def _get_pair_ids(self) -> list[dict]:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch("SELECT id, symbol FROM token_pairs WHERE is_active")
        return [dict(r) for r in rows]

    async def _replay_tick(self, pairs: list[dict]) -> None:
        pool = await get_pool()
        async with pool.acquire() as conn:
            for pair in pairs:
                row = await conn.fetchrow(
                    """
                    SELECT
                        c.price AS cex_price,
                        d.price AS dex_price
                    FROM cex_prices c
                    JOIN LATERAL (
                        SELECT price FROM dex_prices
                        WHERE pair_id = $1
                        ORDER BY recorded_at DESC LIMIT 1
                    ) d ON true
                    WHERE c.pair_id = $1
                    ORDER BY c.recorded_at DESC LIMIT 1
                    """,
                    pair["id"],
                )
                if not row:
                    continue
                cex = float(row["cex_price"]) * (1 + random.gauss(0, 0.0002))
                dex = float(row["dex_price"]) * (1 + random.gauss(0, 0.0002))
                min_p = min(cex, dex)
                spread_bps = abs(cex - dex) / min_p * 10000 if min_p > 0 else 0
                direction = "CEX_TO_DEX" if cex > dex else "DEX_TO_CEX"
                await self.ws_manager.broadcast({
                    "type": "price_update",
                    "pair_id": pair["id"],
                    "symbol": pair["symbol"],
                    "cex_price": round(cex, 8),
                    "dex_price": round(dex, 8),
                    "spread_bps": round(spread_bps, 2),
                    "direction": direction,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })

    async def stop(self) -> None:
        self._running = False
