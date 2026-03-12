"""
BinanceWebSocketService
Connects to Binance public @bookTicker streams (no API key needed).
Batches inserts into cex_prices every 5 seconds.
"""
import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Optional

import websockets
from websockets.exceptions import ConnectionClosed

from app.database import get_pool
from app.config import get_settings

logger = logging.getLogger(__name__)

# Streams to subscribe — maps binance stream symbol → our pair symbol
STREAM_MAP = {
    "ethusdc": "ETH/USDC",
    "btcusdc": "WBTC/USDC",
    "arbusdc": "ARB/USDC",
}


class BinanceWebSocketService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self._running = False
        self._pair_id_cache: dict[str, int] = {}
        # Buffer of (pair_id, price, bid, ask, volume) tuples to batch-insert
        self._buffer: list[dict] = []
        self._ws: Optional[websockets.WebSocketClientProtocol] = None
        self.connected = False

    async def _load_pair_ids(self) -> None:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch("SELECT id, symbol FROM token_pairs WHERE is_active")
            self._pair_id_cache = {row["symbol"]: row["id"] for row in rows}
        logger.info("Loaded pair IDs: %s", self._pair_id_cache)

    async def _flush_buffer(self) -> None:
        """Insert buffered price records into cex_prices in one batch."""
        if not self._buffer:
            return
        batch = self._buffer.copy()
        self._buffer.clear()
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.executemany(
                """
                INSERT INTO cex_prices (pair_id, price, bid, ask, volume_24h, source, recorded_at)
                VALUES ($1, $2, $3, $4, $5, 'binance', $6)
                """,
                [
                    (
                        r["pair_id"],
                        r["price"],
                        r["bid"],
                        r["ask"],
                        r.get("volume_24h"),
                        r["recorded_at"],
                    )
                    for r in batch
                ],
            )

    async def _periodic_flush(self) -> None:
        """Flush buffer every 5 seconds."""
        while self._running:
            await asyncio.sleep(5)
            try:
                await self._flush_buffer()
            except Exception as exc:
                logger.error("Buffer flush error: %s", exc)

    def _parse_book_ticker(self, msg: dict) -> Optional[dict]:
        """Parse Binance bookTicker message into our schema."""
        stream = msg.get("s", "").lower()
        pair_symbol = STREAM_MAP.get(stream)
        if not pair_symbol or pair_symbol not in self._pair_id_cache:
            return None
        bid = float(msg["b"])
        ask = float(msg["a"])
        mid = (bid + ask) / 2
        return {
            "pair_id": self._pair_id_cache[pair_symbol],
            "price": mid,
            "bid": bid,
            "ask": ask,
            "volume_24h": None,
            "recorded_at": datetime.now(timezone.utc),
        }

    async def _connect_and_stream(self) -> None:
        streams = "/".join(f"{s}@bookTicker" for s in STREAM_MAP)
        url = f"{self.settings.binance_ws_url}/stream?streams={streams}"
        logger.info("Connecting to Binance WS: %s", url)
        async with websockets.connect(url, ping_interval=20, ping_timeout=20) as ws:
            self._ws = ws
            self.connected = True
            logger.info("Binance WS connected")
            async for raw in ws:
                if not self._running:
                    break
                try:
                    envelope = json.loads(raw)
                    data = envelope.get("data", envelope)
                    record = self._parse_book_ticker(data)
                    if record:
                        self._buffer.append(record)
                except Exception as exc:
                    logger.warning("Binance parse error: %s", exc)

    async def start(self) -> None:
        self._running = True
        await self._load_pair_ids()
        asyncio.create_task(self._periodic_flush())
        while self._running:
            try:
                self.connected = False
                await self._connect_and_stream()
            except ConnectionClosed as exc:
                logger.warning("Binance WS closed (%s), reconnecting in 5s…", exc)
                self.connected = False
                await asyncio.sleep(5)
            except Exception as exc:
                logger.error("Binance WS error (%s), reconnecting in 10s…", exc)
                self.connected = False
                await asyncio.sleep(10)

    async def stop(self) -> None:
        self._running = False
        self.connected = False
        if self._ws:
            await self._ws.close()
        await self._flush_buffer()
