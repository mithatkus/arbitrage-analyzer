import { useState, useCallback } from 'react'
import Editor from '@monaco-editor/react'

const EXAMPLE_QUERIES = [
  {
    label: 'Rolling Spread Average (Window Functions)',
    sql: `-- 5-min and 1-hr rolling average spread for pair 1
-- Demonstrates: AVG OVER with ROWS BETWEEN window frames
WITH spread_series AS (
  SELECT
    c.recorded_at,
    ABS(c.price - d.price) / NULLIF(LEAST(c.price, d.price), 0) * 10000 AS spread_bps
  FROM cex_prices c
  JOIN LATERAL (
    SELECT price FROM dex_prices d2
    WHERE d2.pair_id = c.pair_id
      AND d2.recorded_at BETWEEN c.recorded_at - INTERVAL '30 seconds'
                             AND c.recorded_at + INTERVAL '30 seconds'
    ORDER BY ABS(EXTRACT(EPOCH FROM (d2.recorded_at - c.recorded_at)))
    LIMIT 1
  ) d ON true
  WHERE c.pair_id = 1
    AND c.recorded_at >= NOW() - INTERVAL '1 hour'
)
SELECT
  recorded_at,
  ROUND(spread_bps::NUMERIC, 2) AS spread_bps,
  ROUND(AVG(spread_bps) OVER (
    ORDER BY recorded_at
    ROWS BETWEEN 60 PRECEDING AND CURRENT ROW
  )::NUMERIC, 2) AS rolling_5min_avg_bps,
  ROUND(AVG(spread_bps) OVER (
    ORDER BY recorded_at
    ROWS BETWEEN 720 PRECEDING AND CURRENT ROW
  )::NUMERIC, 2) AS rolling_1hr_avg_bps
FROM spread_series
ORDER BY recorded_at DESC LIMIT 100`,
  },
  {
    label: 'Profitability Percentiles (PERCENTILE_CONT)',
    sql: `-- P25/P50/P75/P95 net profit by pair and direction
-- Demonstrates: ordered-set aggregate functions
SELECT
  tp.symbol,
  ao.direction,
  COUNT(*) AS total_count,
  ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY ao.net_profit_usd)::NUMERIC, 4) AS p25,
  ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY ao.net_profit_usd)::NUMERIC, 4) AS median,
  ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ao.net_profit_usd)::NUMERIC, 4) AS p75,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ao.net_profit_usd)::NUMERIC, 4) AS p95
FROM arbitrage_opportunities ao
JOIN token_pairs tp ON tp.id = ao.pair_id
WHERE ao.status = 'closed'
GROUP BY tp.symbol, ao.direction
ORDER BY tp.symbol`,
  },
  {
    label: 'Gas Break-Even CTE Analysis',
    sql: `-- Minimum spread needed to break even by trade size
-- Demonstrates: CTEs, CROSS JOIN, PERCENTILE_CONT
WITH gas_percentiles AS (
  SELECT
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY estimated_swap_cost_usd) AS p50_gas,
    PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY estimated_swap_cost_usd) AS p90_gas
  FROM gas_prices
  WHERE recorded_at >= NOW() - INTERVAL '24 hours'
),
trade_sizes AS (
  SELECT unnest(ARRAY[1000, 5000, 10000, 25000, 50000]) AS size
)
SELECT
  '$' || (t.size / 1000) || 'K' AS trade_size,
  ROUND((g.p50_gas / t.size * 10000 + 20)::NUMERIC, 2) AS breakeven_median_gas_bps,
  ROUND((g.p90_gas / t.size * 10000 + 20)::NUMERIC, 2) AS breakeven_p90_gas_bps
FROM trade_sizes t
CROSS JOIN gas_percentiles g
ORDER BY t.size`,
  },
  {
    label: 'Cumulative P&L (Running SUM window)',
    sql: `-- Equity curve: running total profit per pair
-- Demonstrates: SUM OVER with UNBOUNDED PRECEDING
SELECT
  tp.symbol,
  DATE(ao.opened_at) AS date,
  SUM(ao.net_profit_usd) AS daily_pnl,
  SUM(SUM(ao.net_profit_usd)) OVER (
    PARTITION BY ao.pair_id
    ORDER BY DATE(ao.opened_at)
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS cumulative_pnl
FROM arbitrage_opportunities ao
JOIN token_pairs tp ON tp.id = ao.pair_id
WHERE ao.status = 'closed'
GROUP BY tp.symbol, ao.pair_id, DATE(ao.opened_at)
ORDER BY tp.symbol, date`,
  },
]

interface QueryResult {
  columns: string[]
  rows: (string | null)[][]
  row_count: number
  elapsed_ms: number
}

export function SqlExplorer() {
  const [sql, setSql] = useState(EXAMPLE_QUERIES[0].sql)
  const [result, setResult] = useState<QueryResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const runQuery = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/analytics/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail ?? 'Query failed')
      }
      setResult(await res.json())
    } catch (e: any) {
      setError(e.message)
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [sql])

  return (
    <div className="h-full flex flex-col gap-2 p-2">
      {/* Toolbar */}
      <div className="flex items-center gap-2 shrink-0">
        <select
          className="bg-terminal-panel border border-terminal-border text-terminal-text text-xs font-mono rounded px-2 py-1.5 flex-1 focus:outline-none focus:border-terminal-cyan/40"
          onChange={e => setSql(EXAMPLE_QUERIES[parseInt(e.target.value)].sql)}
        >
          {EXAMPLE_QUERIES.map((q, i) => (
            <option key={i} value={i}>{q.label}</option>
          ))}
        </select>
        <button
          onClick={runQuery}
          disabled={loading}
          className="px-4 py-1.5 bg-terminal-cyan/20 border border-terminal-cyan/40 text-terminal-cyan text-xs font-mono rounded hover:bg-terminal-cyan/30 disabled:opacity-50 transition-colors"
        >
          {loading ? 'RUNNING…' : '▶ RUN QUERY'}
        </button>
      </div>

      {/* Editor */}
      <div className="border border-terminal-border/60 rounded overflow-hidden" style={{ height: '220px' }}>
        <Editor
          value={sql}
          onChange={v => setSql(v ?? '')}
          language="sql"
          theme="vs-dark"
          options={{
            fontSize: 12,
            fontFamily: 'JetBrains Mono',
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            lineNumbers: 'on',
            padding: { top: 8, bottom: 8 },
            wordWrap: 'on',
          }}
        />
      </div>

      {/* Results */}
      <div className="flex-1 min-h-0 overflow-auto">
        {error && (
          <div className="text-xs font-mono text-terminal-red bg-terminal-red/10 border border-terminal-red/30 rounded p-3">
            {error}
          </div>
        )}
        {result && (
          <>
            <div className="text-[10px] font-mono text-terminal-muted mb-1.5">
              {result.row_count} rows · {result.elapsed_ms}ms
            </div>
            <div className="border border-terminal-border/40 rounded overflow-auto">
              <table className="w-full text-[10px] font-mono">
                <thead className="sticky top-0 bg-terminal-panel">
                  <tr>
                    {result.columns.map(c => (
                      <th key={c} className="px-2 py-1.5 text-left text-terminal-cyan border-b border-terminal-border/40 whitespace-nowrap">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i} className="border-b border-terminal-border/20 hover:bg-white/[0.02]">
                      {row.map((cell, j) => (
                        <td key={j} className="px-2 py-1 text-terminal-text whitespace-nowrap">
                          {cell ?? <span className="text-terminal-muted">NULL</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
