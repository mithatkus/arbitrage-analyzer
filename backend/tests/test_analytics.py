"""
Unit tests for analytics router — query sanitization and helper logic.
"""
import pytest
import re
from app.routers.analytics import _is_safe_select


@pytest.mark.parametrize("sql,expected", [
    ("SELECT * FROM token_pairs", True),
    ("  select id from arbitrage_opportunities", True),
    ("WITH cte AS (SELECT 1) SELECT * FROM cte", True),
    ("INSERT INTO foo VALUES (1)", False),
    ("UPDATE foo SET x=1", False),
    ("DELETE FROM foo", False),
    ("DROP TABLE foo", False),
    ("TRUNCATE foo", False),
    ("SELECT * FROM foo; DROP TABLE bar", False),
    ("SELECT pg_read_file('/etc/passwd')", False),
    ("SELECT dblink('conn','SELECT 1')", False),
    ("EXPLAIN SELECT 1", True),
])
def test_is_safe_select(sql, expected):
    assert _is_safe_select(sql) == expected


def test_rolling_spread_sql_has_window_function():
    from app.queries.sql_queries import ROLLING_SPREAD_SQL
    assert "OVER" in ROLLING_SPREAD_SQL
    assert "ROWS BETWEEN" in ROLLING_SPREAD_SQL


def test_cumulative_pnl_sql_has_unbounded_window():
    from app.queries.sql_queries import CUMULATIVE_PNL_SQL
    assert "UNBOUNDED PRECEDING" in CUMULATIVE_PNL_SQL
    assert "SUM(" in CUMULATIVE_PNL_SQL


def test_percentile_sql_has_percentile_cont():
    from app.queries.sql_queries import PROFITABILITY_PERCENTILES_SQL
    assert "PERCENTILE_CONT" in PROFITABILITY_PERCENTILES_SQL
    assert "WITHIN GROUP" in PROFITABILITY_PERCENTILES_SQL


def test_heatmap_sql_uses_extract():
    from app.queries.sql_queries import HEATMAP_SQL
    assert "EXTRACT" in HEATMAP_SQL
    assert "ISODOW" in HEATMAP_SQL


def test_gas_breakeven_sql_has_cte():
    from app.queries.sql_queries import GAS_BREAKEVEN_SQL
    assert GAS_BREAKEVEN_SQL.strip().upper().startswith("WITH")
    assert "CROSS JOIN" in GAS_BREAKEVEN_SQL
