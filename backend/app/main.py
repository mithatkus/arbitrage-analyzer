"""
ARB Scanner — FastAPI application entry point.
Starts all background services and serves the REST + WebSocket API.
"""
import asyncio
import logging
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import get_pool, close_pool
from app.routers import pairs, prices, opportunities, analytics, websocket
import app.services.arbitrage_engine as engine_module

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)

settings = get_settings()

app = FastAPI(
    title="ARB Scanner API",
    description="Real-time DEX vs CEX Arbitrage Opportunity Analyzer",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(pairs.router)
app.include_router(prices.router)
app.include_router(opportunities.router)
app.include_router(analytics.router)
app.include_router(websocket.router)

# Singleton WS manager — injected into arbitrage engine
from app.routers.websocket import manager as ws_manager
engine_module.ws_manager = ws_manager

_tasks: list[asyncio.Task] = []


@app.on_event("startup")
async def startup():
    logger.info("Starting ARB Scanner (demo_mode=%s)", settings.demo_mode)

    # Ensure DB connection pool is ready
    pool = await get_pool()
    logger.info("Database pool ready")

    if settings.demo_mode:
        # In demo mode, spin up a replay service instead of live feeds
        from app.demo import DemoReplayService
        replay = DemoReplayService(ws_manager)
        _tasks.append(asyncio.create_task(replay.start()))
        logger.info("Demo replay service started")
    else:
        from app.services.binance_ws import BinanceWebSocketService
        from app.services.uniswap import UniswapPriceService
        from app.services.gas_tracker import GasTrackerService
        from app.services.arbitrage_engine import ArbitrageEngine

        binance_svc = BinanceWebSocketService()
        uniswap_svc = UniswapPriceService()
        gas_svc = GasTrackerService()
        engine = ArbitrageEngine()

        _tasks.extend([
            asyncio.create_task(binance_svc.start()),
            asyncio.create_task(uniswap_svc.start()),
            asyncio.create_task(gas_svc.start()),
            asyncio.create_task(engine.start()),
        ])
        logger.info("All live services started")


@app.on_event("shutdown")
async def shutdown():
    for task in _tasks:
        task.cancel()
    await asyncio.gather(*_tasks, return_exceptions=True)
    await close_pool()
    logger.info("Shutdown complete")


@app.get("/health")
async def health():
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.fetchval("SELECT 1")
    return {"status": "ok", "demo_mode": settings.demo_mode}
