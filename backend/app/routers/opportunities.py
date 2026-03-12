from fastapi import APIRouter, Query
from typing import Optional
from app.database import get_pool

router = APIRouter(prefix="/api/opportunities", tags=["opportunities"])


@router.get("")
async def list_opportunities(
    pair_id: Optional[int] = None,
    direction: Optional[str] = None,
    is_profitable: Optional[bool] = None,
    min_spread: Optional[float] = None,
    status: Optional[str] = None,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
):
    """Paginated list of arbitrage opportunities with filters."""
    conditions = ["1=1"]
    params: list = []
    idx = 1

    if pair_id is not None:
        conditions.append(f"ao.pair_id = ${idx}")
        params.append(pair_id)
        idx += 1
    if direction is not None:
        conditions.append(f"ao.direction = ${idx}")
        params.append(direction)
        idx += 1
    if is_profitable is not None:
        conditions.append(f"ao.is_profitable = ${idx}")
        params.append(is_profitable)
        idx += 1
    if min_spread is not None:
        conditions.append(f"ao.spread_bps >= ${idx}")
        params.append(min_spread)
        idx += 1
    if status is not None:
        conditions.append(f"ao.status = ${idx}")
        params.append(status)
        idx += 1

    where = " AND ".join(conditions)
    params.extend([limit, offset])

    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""
            SELECT
                ao.*,
                tp.symbol
            FROM arbitrage_opportunities ao
            JOIN token_pairs tp ON tp.id = ao.pair_id
            WHERE {where}
            ORDER BY ao.opened_at DESC
            LIMIT ${idx} OFFSET ${idx + 1}
            """,
            *params,
        )
        total = await conn.fetchval(
            f"""
            SELECT COUNT(*) FROM arbitrage_opportunities ao
            WHERE {where}
            """,
            *params[:-2],
        )
    return {"total": total, "offset": offset, "limit": limit, "items": [dict(r) for r in rows]}


@router.get("/{opp_id}")
async def get_opportunity(opp_id: int):
    """Single opportunity detail."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT ao.*, tp.symbol, tp.base_token, tp.quote_token
            FROM arbitrage_opportunities ao
            JOIN token_pairs tp ON tp.id = ao.pair_id
            WHERE ao.id = $1
            """,
            opp_id,
        )
    if not row:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Opportunity not found")
    return dict(row)
