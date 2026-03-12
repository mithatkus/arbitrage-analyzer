"""
ArbitrageDetectionEngine
Continuously compares latest CEX and DEX prices per pair.
Opens/closes arbitrage_opportunities records based on configurable spread thresholds.
Broadcasts updates via the WebSocket manager.

P&L MODEL (all costs deducted from gross):
  gross          = abs(cex_mid - dex_mid) / min_price * trade_size
  pool_fee       = (pool_fee_tier / 1_000_000) * trade_size   # Uniswap v3 swap fee
  cex_taker_fee  = 0.001 * trade_size                          # Binance taker 10 bps
  slippage       = AMM price-impact estimate (scales w/ trade_size / liquidity)
  net            = gross - gas_cost - pool_fee - cex_taker_fee - slippage
"""
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from app.database import get_pool
from app.config import get_settings

logger = logging.getLogger(__name__)

# Will be set by main.py after import to avoid circular dependency
ws_manager = None  # type: ignore

# Binance standard taker fee: 0.10% (paid on every market order)
CEX_TAKER_FEE_RATE = 0.001

# AMM price-impact coefficient for Uniswap v3 concentrated-liquidity pools.
# In a CPAMM, price impact ≈ trade / (2 * virtual_liquidity). Uniswap v3
# concentrates liquidity, so effective depth varies, but a 0.5× coefficient
# is a reasonable conservative estimate for in-range trades.
AMM_PRICE_IMPACT_COEFF = 0.5

# Max slippage cap — beyond 0.5% the trade is considered unexecutable
MAX_SLIPPAGE_RATE = 0.005

# Gas fallback used if DB has no gas price rows yet (e.g., right after startup).
# 150k gas × 21 gwei (base+priority) × $3000/ETH ≈ $9.45; use $15 as conservative floor.
GAS_FALLBACK_USD = 15.0


class ArbitrageEngine:
    def __init__(self) -> None:
        self.settings = get_settings()
        self._running = False
        # Track open opportunity id per pair to avoid duplicates
        self._open_opps: dict[int, int] = {}  # pair_id → opportunity id

    async def _get_latest_prices(self, conn) -> list[dict]:
        """
        Get the most recent CEX and DEX price for each active pair.
        Also fetches pool_fee_tier and liquidity_usd from dex_prices so the
        P&L model can compute AMM slippage and Uniswap swap fees correctly.
        """
        rows = await conn.fetch(
            """
            SELECT
                tp.id        AS pair_id,
                tp.symbol,
                c.price      AS cex_price,
                c.bid        AS cex_bid,
                d.price      AS dex_price,
                d.pool_fee_tier,
                d.liquidity_usd
            FROM token_pairs tp
            -- Latest CEX price (bookTicker: best bid/ask)
            JOIN LATERAL (
                SELECT price, bid FROM cex_prices
                WHERE pair_id = tp.id
                ORDER BY recorded_at DESC LIMIT 1
            ) c ON true
            -- Latest DEX price (pool state)
            JOIN LATERAL (
                SELECT price, pool_fee_tier, liquidity_usd FROM dex_prices
                WHERE pair_id = tp.id
                ORDER BY recorded_at DESC LIMIT 1
            ) d ON true
            WHERE tp.is_active
            """
        )
        return [dict(r) for r in rows]

    async def _get_latest_gas_cost(self, conn) -> float:
        row = await conn.fetchrow(
            "SELECT estimated_swap_cost_usd FROM gas_prices ORDER BY recorded_at DESC LIMIT 1"
        )
        # estimated_swap_cost_usd already accounts for 150k gas units × gas price × ETH/USD
        return float(row["estimated_swap_cost_usd"]) if row else GAS_FALLBACK_USD

    def _compute_costs(
        self,
        trade_size: float,
        pool_fee_tier: int,
        liquidity_usd: float,
    ) -> tuple[float, float]:
        """
        Compute execution costs beyond gas. Returns (slippage_estimate_usd, breakdown).

        Components:
        1. Uniswap v3 pool swap fee:
           pool_fee_tier is in units of 1/1_000_000 (e.g. 500 = 0.05%, 3000 = 0.30%)
        2. Binance taker fee: 10 bps on the notional amount
        3. AMM price impact (slippage):
           Conservative linear approximation: trade_size / liquidity_usd × AMM_coeff
           Capped at MAX_SLIPPAGE_RATE to prevent extreme values on illiquid pools.
        """
        # DEX pool swap fee (deducted from the swap output by the pool contract)
        pool_fee = (pool_fee_tier / 1_000_000) * trade_size

        # CEX taker fee (Binance standard; market-taker orders always pay this)
        cex_fee = CEX_TAKER_FEE_RATE * trade_size

        # AMM price impact: proportional to trade size relative to pool depth.
        # Uses reported liquidity_usd as a proxy for TVL in the active tick range.
        effective_liquidity = max(100_000, float(liquidity_usd))  # floor at $100K
        slippage_rate = min(MAX_SLIPPAGE_RATE, trade_size / effective_liquidity * AMM_PRICE_IMPACT_COEFF)
        slippage = slippage_rate * trade_size

        # slippage_estimate_usd stores ALL non-gas execution costs for clean accounting
        total_execution_costs = pool_fee + cex_fee + slippage
        return total_execution_costs, slippage

    async def _open_opportunity(
        self,
        conn,
        pair_id: int,
        cex_price: float,
        dex_price: float,
        spread_bps: float,
        direction: str,
        gas_cost: float,
        pool_fee_tier: int,
        liquidity_usd: float,
    ) -> int:
        trade_size = self.settings.default_trade_size_usd
        # Gross: raw spread profit before any fees or gas
        gross = (spread_bps / 10_000) * trade_size
        execution_costs, _ = self._compute_costs(trade_size, pool_fee_tier, liquidity_usd)
        # Net profit = gross spread − on-chain gas − all execution costs (pool fee + CEX fee + slippage)
        net = gross - gas_cost - execution_costs
        is_profitable = net > 0

        row = await conn.fetchrow(
            """
            INSERT INTO arbitrage_opportunities
                (pair_id, direction, cex_price, dex_price, spread_bps,
                 gross_profit_usd, gas_cost_usd, slippage_estimate_usd,
                 net_profit_usd, is_profitable, trade_size_usd, opened_at, status)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'open')
            RETURNING id
            """,
            pair_id, direction, cex_price, dex_price, spread_bps,
            gross, gas_cost, execution_costs, net, is_profitable,
            trade_size, datetime.now(timezone.utc),
        )
        opp_id = row["id"]
        logger.info(
            "OPEN opp #%d pair_id=%d spread=%.1f bps gross=$%.2f gas=$%.2f exec_costs=$%.2f net=$%.2f",
            opp_id, pair_id, spread_bps, gross, gas_cost, execution_costs, net,
        )
        return opp_id

    async def _close_opportunity(self, conn, opp_id: int) -> None:
        await conn.execute(
            """
            UPDATE arbitrage_opportunities
            SET
                status           = 'closed',
                closed_at        = NOW(),
                duration_seconds = EXTRACT(EPOCH FROM (NOW() - opened_at))::INTEGER
            WHERE id = $1 AND status = 'open'
            """,
            opp_id,
        )
        logger.info("CLOSED opp #%d", opp_id)

    async def _tick(self) -> None:
        pool = await get_pool()
        async with pool.acquire() as conn:
            prices = await self._get_latest_prices(conn)
            gas_cost = await self._get_latest_gas_cost(conn)

            for row in prices:
                pair_id = row["pair_id"]
                cex = float(row["cex_price"])
                dex = float(row["dex_price"])
                pool_fee_tier = int(row["pool_fee_tier"] or 500)
                liquidity_usd = float(row["liquidity_usd"] or 1_000_000)
                min_price = min(cex, dex)
                if min_price <= 0:
                    continue

                # Use the cheaper venue as denominator (conservative spread estimate)
                spread_bps = abs(cex - dex) / min_price * 10_000
                direction = "CEX_TO_DEX" if cex > dex else "DEX_TO_CEX"

                open_id = self._open_opps.get(pair_id)

                if open_id is None:
                    # No open opp — check if we should open one
                    if spread_bps >= self.settings.arbitrage_threshold_bps:
                        opp_id = await self._open_opportunity(
                            conn, pair_id, cex, dex, spread_bps, direction, gas_cost,
                            pool_fee_tier, liquidity_usd,
                        )
                        self._open_opps[pair_id] = opp_id
                        if ws_manager:
                            await ws_manager.broadcast({
                                "type": "opportunity_opened",
                                "pair_id": pair_id,
                                "symbol": row["symbol"],
                                "opportunity_id": opp_id,
                                "spread_bps": round(spread_bps, 2),
                                "direction": direction,
                            })
                else:
                    # Open opp exists — check if we should close it
                    if spread_bps < self.settings.arbitrage_close_bps:
                        await self._close_opportunity(conn, open_id)
                        del self._open_opps[pair_id]
                        if ws_manager:
                            await ws_manager.broadcast({
                                "type": "opportunity_closed",
                                "pair_id": pair_id,
                                "symbol": row["symbol"],
                                "opportunity_id": open_id,
                                "spread_bps": round(spread_bps, 2),
                            })

                # Always broadcast price update
                if ws_manager:
                    await ws_manager.broadcast({
                        "type": "price_update",
                        "pair_id": pair_id,
                        "symbol": row["symbol"],
                        "cex_price": round(cex, 8),
                        "dex_price": round(dex, 8),
                        "spread_bps": round(spread_bps, 2),
                        "direction": direction,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })

    async def start(self) -> None:
        self._running = True
        while self._running:
            try:
                await self._tick()
            except Exception as exc:
                logger.error("Arbitrage engine tick error: %s", exc)
            await asyncio.sleep(3)  # evaluate every 3 seconds

    async def stop(self) -> None:
        self._running = False
