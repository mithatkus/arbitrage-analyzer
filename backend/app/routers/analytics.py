"""
Analytics endpoints — all use raw SQL to showcase advanced PostgreSQL features.
"""
import asyncio
import logging
import re
from fastapi import APIRouter, Query, HTTPException
from typing import Optional, List

from app.database import get_pool
from app.queries.sql_queries import (
    ROLLING_SPREAD_SQL,
    PROFITABILITY_PERCENTILES_SQL,
    GAS_BREAKEVEN_SQL,
    HEATMAP_SQL,
    CUMULATIVE_PNL_SQL,
    SPREAD_DISTRIBUTION_SQL,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/summary")
async def get_summary():
    """Key stats: total opportunities, win rate, total P&L, avg spread, best trade."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT
                COUNT(*)                                        AS total_opportunities,
                COUNT(*) FILTER (WHERE is_profitable)           AS profitable_count,
                ROUND(
                    COUNT(*) FILTER (WHERE is_profitable)::NUMERIC
                    / NULLIF(COUNT(*), 0) * 100, 1
                )                                               AS win_rate_pct,
                ROUND(SUM(net_profit_usd)::NUMERIC, 4)          AS total_pnl,
                ROUND(AVG(spread_bps)::NUMERIC, 2)              AS avg_spread_bps,
                ROUND(MAX(net_profit_usd)::NUMERIC, 4)          AS best_trade,
                ROUND(MIN(net_profit_usd)::NUMERIC, 4)          AS worst_trade,
                COUNT(*) FILTER (WHERE status = 'open')         AS open_count
            FROM arbitrage_opportunities
            WHERE status IN ('open', 'closed')
            """
        )
        gas_row = await conn.fetchrow(
            """
            SELECT
                ROUND(base_fee_gwei::NUMERIC, 1)     AS base_fee_gwei,
                ROUND(eth_price_usd::NUMERIC, 2)     AS eth_price_usd,
                ROUND(estimated_swap_cost_usd::NUMERIC, 4) AS swap_cost_usd
            FROM gas_prices ORDER BY recorded_at DESC LIMIT 1
            """
        )
    result = dict(row) if row else {}
    if gas_row:
        result.update(dict(gas_row))
    return result


@router.get("/spreads")
async def get_spread_history(
    pair_id: int = Query(...),
    hours: int = Query(default=1, ge=1, le=168),
):
    """Rolling spread data for charting (5-min and 1-hr averages)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(ROLLING_SPREAD_SQL, pair_id, str(hours))
    return [dict(r) for r in rows]


@router.get("/heatmap")
async def get_heatmap(
    pair_ids: str = Query(default="1,2,3", description="Comma-separated pair IDs"),
):
    """Hour × day-of-week opportunity density heatmap data."""
    try:
        ids = [int(x.strip()) for x in pair_ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid pair_ids")
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(HEATMAP_SQL, ids)
    return [dict(r) for r in rows]


@router.get("/pnl-cumulative")
async def get_cumulative_pnl(
    pair_ids: str = Query(default="1,2,3"),
    days: int = Query(default=7, ge=1, le=90),
):
    """Cumulative P&L time series per pair."""
    try:
        ids = [int(x.strip()) for x in pair_ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid pair_ids")
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(CUMULATIVE_PNL_SQL, ids, str(days))
    return [dict(r) for r in rows]


@router.get("/gas-breakeven")
async def get_gas_breakeven():
    """Gas-adjusted break-even spread at different trade sizes and gas percentiles."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(GAS_BREAKEVEN_SQL)
    return [dict(r) for r in rows]


@router.get("/distribution")
async def get_spread_distribution(
    pair_ids: str = Query(default="1,2,3"),
):
    """Spread distribution histogram data."""
    try:
        ids = [int(x.strip()) for x in pair_ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid pair_ids")
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(SPREAD_DISTRIBUTION_SQL, ids)
    return [dict(r) for r in rows]


@router.get("/percentiles")
async def get_profitability_percentiles():
    """P25/P50/P75/P95 of net profit grouped by pair and direction."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(PROFITABILITY_PERCENTILES_SQL)
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# SQL Explorer endpoint (read-only, sanitized, 5s timeout, 1000 row limit)
# ---------------------------------------------------------------------------
_FORBIDDEN = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|EXECUTE|COPY|"
    r"pg_exec|pg_read_file|lo_|dblink|pg_sleep)\b",
    re.IGNORECASE,
)


def _is_safe_select(sql: str) -> bool:
    cleaned = sql.strip()
    if not cleaned.upper().startswith(("SELECT", "WITH", "EXPLAIN")):
        return False
    if _FORBIDDEN.search(cleaned):
        return False
    return True


@router.post("/query")
async def run_custom_query(body: dict):
    """
    Execute a read-only SQL SELECT query from the SQL Explorer.
    Enforces: SELECT-only, 5-second timeout, max 1000 rows.
    """
    sql: str = body.get("sql", "").strip()
    if not sql:
        raise HTTPException(status_code=400, detail="No SQL provided")
    if not _is_safe_select(sql):
        raise HTTPException(
            status_code=403,
            detail="Only SELECT statements are allowed. No DDL or DML permitted.",
        )

    # Wrap in a LIMIT guard and timeout
    wrapped = f"SELECT * FROM ({sql}) _q LIMIT 1000"
    pool = await get_pool()
    try:
        async with pool.acquire() as conn:
            await conn.execute("SET statement_timeout = '5000'")
            import time
            t0 = time.perf_counter()
            rows = await conn.fetch(wrapped)
            elapsed_ms = round((time.perf_counter() - t0) * 1000, 1)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=408, detail="Query timed out (5s limit)")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Query error: {exc}")

    if not rows:
        return {"columns": [], "rows": [], "row_count": 0, "elapsed_ms": elapsed_ms}

    columns = list(rows[0].keys())
    data = [[str(v) if v is not None else None for v in r.values()] for r in rows]
    return {
        "columns": columns,
        "rows": data,
        "row_count": len(data),
        "elapsed_ms": elapsed_ms,
    }
