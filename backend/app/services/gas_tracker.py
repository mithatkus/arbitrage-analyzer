"""
GasTrackerService
Polls Etherscan gas oracle every 30 seconds.
Estimates swap cost = base_fee * priority_fee * ~150k gas units * ETH price.
"""
import asyncio
import logging
from datetime import datetime, timezone

import aiohttp

from app.database import get_pool
from app.config import get_settings

logger = logging.getLogger(__name__)

ETHERSCAN_URL = (
    "https://api.etherscan.io/api"
    "?module=gastracker&action=gasoracle&apikey={key}"
)
ETH_PRICE_URL = (
    "https://api.etherscan.io/api"
    "?module=stats&action=ethprice&apikey={key}"
)
UNISWAP_GAS_UNITS = 150_000  # approximate gas for a Uniswap v3 swap


class GasTrackerService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self._running = False
        self.connected = False
        # Fallback: 150k gas × 21 gwei (base 20 + priority 1) × $3000/ETH ≈ $9.45
        # Use $15 as a conservative floor so we never under-estimate cost at startup
        self.latest_gas_cost_usd: float = 15.0
        self.latest_eth_price: float = 3000.0   # fallback

    async def _fetch_gas(self, session: aiohttp.ClientSession) -> tuple[float, float]:
        """Returns (base_fee_gwei, priority_fee_gwei)."""
        if not self.settings.etherscan_api_key:
            return 20.0, 1.0  # sensible fallback
        url = ETHERSCAN_URL.format(key=self.settings.etherscan_api_key)
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=8)) as resp:
            resp.raise_for_status()
            data = await resp.json()
            result = data["result"]
            base_fee = float(result.get("suggestBaseFee", 20))
            fast = float(result.get("FastGasPrice", 25))
            priority = max(fast - base_fee, 1.0)
            return base_fee, priority

    async def _fetch_eth_price(self, session: aiohttp.ClientSession) -> float:
        if not self.settings.etherscan_api_key:
            return self.latest_eth_price
        url = ETH_PRICE_URL.format(key=self.settings.etherscan_api_key)
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=8)) as resp:
            resp.raise_for_status()
            data = await resp.json()
            return float(data["result"]["ethusd"])

    async def _record(self, base_fee: float, priority: float, eth_price: float) -> None:
        total_gwei = base_fee + priority
        cost_eth = (total_gwei * 1e-9) * UNISWAP_GAS_UNITS
        cost_usd = cost_eth * eth_price
        self.latest_gas_cost_usd = cost_usd
        self.latest_eth_price = eth_price
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO gas_prices
                    (base_fee_gwei, priority_fee_gwei, eth_price_usd, estimated_swap_cost_usd, recorded_at)
                VALUES ($1, $2, $3, $4, $5)
                """,
                base_fee, priority, eth_price, cost_usd, datetime.now(timezone.utc),
            )
        self.connected = True

    async def start(self) -> None:
        self._running = True
        async with aiohttp.ClientSession() as session:
            while self._running:
                try:
                    base_fee, priority = await self._fetch_gas(session)
                    eth_price = await self._fetch_eth_price(session)
                    await self._record(base_fee, priority, eth_price)
                except Exception as exc:
                    logger.error("Gas tracker error: %s", exc)
                    self.connected = False
                await asyncio.sleep(30)

    async def stop(self) -> None:
        self._running = False
        self.connected = False
