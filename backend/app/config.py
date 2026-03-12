from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    thegraph_api_key: str = ""
    etherscan_api_key: str = ""
    database_url: str = "postgresql://arb_user:arb_pass@localhost:5432/arbitrage_db"
    binance_ws_url: str = "wss://stream.binance.com:9443/ws"
    arbitrage_threshold_bps: float = 30.0
    arbitrage_close_bps: float = 10.0
    default_trade_size_usd: float = 10000.0
    demo_mode: bool = False

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
