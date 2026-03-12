import { useSpreadDistribution } from '../../hooks/useApi'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { fmt } from '../../utils/format'

export function DistributionTab() {
  const { data } = useSpreadDistribution()

  const chartData = data?.map(b => ({
    bps: fmt(b.spread_bps_midpoint, 1),
    freq: b.frequency,
  })) ?? []

  const total = data?.reduce((s, b) => s + b.frequency, 0) ?? 0
  const aboveThreshold = data?.filter(b => b.spread_bps_midpoint >= 30).reduce((s, b) => s + b.frequency, 0) ?? 0
  const pct = total > 0 ? (aboveThreshold / total * 100).toFixed(1) : '0'

  return (
    <div className="h-full flex flex-col gap-3 p-3">
      <div className="flex items-center gap-6 shrink-0 text-xs font-mono">
        <span className="text-terminal-muted">TOTAL: <span className="text-terminal-text">{total}</span></span>
        <span className="text-terminal-muted">≥30 bps: <span className="text-terminal-green">{pct}%</span></span>
        <span className="text-terminal-amber text-[10px]">▏ Arbitrage threshold (30 bps)</span>
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="bps" tick={{ fill: '#94a3b8', fontSize: 9, fontFamily: 'JetBrains Mono' }} tickLine={false} label={{ value: 'Spread (bps)', position: 'insideBottom', offset: -4, fill: '#4b5563', fontSize: 10 }} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'JetBrains Mono' }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.1)', fontFamily: 'JetBrains Mono', fontSize: 11, color: '#e2e8f0' }}
              formatter={(v: number) => [v, 'Count']}
              labelFormatter={(l) => `${l} bps`}
            />
            <ReferenceLine x="30.0" stroke="#ffaa00" strokeDasharray="4 2" strokeWidth={1.5} />
            <Bar dataKey="freq" fill="#00f0ff" fillOpacity={0.7} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
