import { useGasBreakeven } from '../../hooks/useApi'
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend,
} from 'recharts'
import { fmt } from '../../utils/format'
import type { GasBreakevenRow } from '../../types'

export function GasImpactTab() {
  const { data } = useGasBreakeven()

  const chartData = data?.map((row: GasBreakevenRow) => ({
    size: row.trade_size_usd / 1000,  // in $K
    p50: Number(row.breakeven_p50_gas_bps),
    p75: Number(row.breakeven_p75_gas_bps),
    p90: Number(row.breakeven_p90_gas_bps),
  })) ?? []

  return (
    <div className="h-full flex flex-col gap-3 p-3">
      <div className="text-[10px] font-mono text-terminal-muted shrink-0">
        Minimum spread (bps) required to break even at different trade sizes and gas price percentiles.
        Lower values = more profitable at that trade size.
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 24, bottom: 16, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis
              dataKey="size"
              tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              tickLine={false}
              label={{ value: 'Trade Size ($K)', position: 'insideBottom', offset: -8, fill: '#4b5563', fontSize: 10 }}
            />
            <YAxis
              tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              tickLine={false}
              axisLine={false}
              label={{ value: 'Min Spread (bps)', angle: -90, position: 'insideLeft', fill: '#4b5563', fontSize: 10 }}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.1)', fontFamily: 'JetBrains Mono', fontSize: 11, color: '#e2e8f0' }}
              formatter={(v: number, name: string) => [`${fmt(v, 1)} bps`, name]}
              labelFormatter={(l) => `Trade size: $${l}K`}
            />
            <Legend wrapperStyle={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: '#94a3b8' }} />
            <Line type="monotone" dataKey="p50" stroke="#00f0ff" strokeWidth={2} dot={{ r: 3 }} name="P50 Gas" />
            <Line type="monotone" dataKey="p75" stroke="#ffaa00" strokeWidth={2} dot={{ r: 3 }} name="P75 Gas" />
            <Line type="monotone" dataKey="p90" stroke="#ff3b5c" strokeWidth={2} dot={{ r: 3 }} name="P90 Gas" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Gas summary table */}
      {data && data.length > 0 && (
        <div className="shrink-0 border border-terminal-border/40 rounded overflow-hidden">
          <table className="w-full text-[10px] font-mono">
            <thead>
              <tr className="bg-terminal-panel/60">
                <th className="px-2 py-1.5 text-left text-terminal-muted">TRADE SIZE</th>
                <th className="px-2 py-1.5 text-right text-terminal-muted">P50 GAS</th>
                <th className="px-2 py-1.5 text-right text-terminal-muted">P75 GAS</th>
                <th className="px-2 py-1.5 text-right text-terminal-muted">P90 GAS</th>
                <th className="px-2 py-1.5 text-right text-terminal-muted">P99 GAS</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row: GasBreakevenRow) => (
                <tr key={row.trade_size_usd} className="border-t border-terminal-border/40">
                  <td className="px-2 py-1 text-terminal-text">${(row.trade_size_usd / 1000).toFixed(0)}K</td>
                  <td className="px-2 py-1 text-right text-terminal-cyan">{fmt(row.breakeven_p50_gas_bps, 1)}</td>
                  <td className="px-2 py-1 text-right text-terminal-amber">{fmt(row.breakeven_p75_gas_bps, 1)}</td>
                  <td className="px-2 py-1 text-right text-terminal-red">{fmt(row.breakeven_p90_gas_bps, 1)}</td>
                  <td className="px-2 py-1 text-right text-terminal-red">{fmt(row.breakeven_p99_gas_bps, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
