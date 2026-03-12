import { useCumulativePnl, useAnalyticsSummary } from '../../hooks/useApi'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { fmt, fmtUsd } from '../../utils/format'
import clsx from 'clsx'

function StatCard({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="bg-terminal-panel/60 border border-terminal-border rounded px-3 py-2">
      <div className="text-[10px] font-mono text-terminal-muted mb-1">{label}</div>
      <div className={clsx('font-mono text-sm font-bold', className ?? 'text-terminal-text')}>{value}</div>
    </div>
  )
}

export function PnlTab() {
  const { data: pnlData } = useCumulativePnl('1,2,3', 7)
  const { data: summary } = useAnalyticsSummary()

  // Build chart data — aggregate across all pairs
  const chartData = pnlData?.map(p => ({
    time: new Date(p.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    pnl: Number(p.cumulative_pnl),
    symbol: p.symbol,
  })) ?? []

  const isPositive = (summary?.total_pnl ?? 0) >= 0

  return (
    <div className="h-full flex flex-col gap-3 p-3">
      {/* Stats row */}
      <div className="grid grid-cols-5 gap-2 shrink-0">
        <StatCard
          label="TOTAL P&L"
          value={fmtUsd(summary?.total_pnl)}
          className={isPositive ? 'text-terminal-green' : 'text-terminal-red'}
        />
        <StatCard label="WIN RATE" value={`${fmt(summary?.win_rate_pct, 1)}%`} className="text-terminal-cyan" />
        <StatCard label="BEST TRADE" value={fmtUsd(summary?.best_trade)} className="text-terminal-green" />
        <StatCard label="WORST TRADE" value={fmtUsd(summary?.worst_trade)} className="text-terminal-red" />
        <StatCard label="TOTAL OPPS" value={String(summary?.total_opportunities ?? 0)} />
      </div>

      {/* Cumulative P&L chart */}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00ff88" stopOpacity={0.55} />
                <stop offset="95%" stopColor="#00ff88" stopOpacity={0.08} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'JetBrains Mono' }} tickLine={false} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'JetBrains Mono' }} tickLine={false} axisLine={false} tickFormatter={v => `$${fmt(v, 0)}`} domain={['auto', 'auto']} />
            <Tooltip
              contentStyle={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.1)', fontFamily: 'JetBrains Mono', fontSize: 11, color: '#e2e8f0' }}
              formatter={(v: number) => [fmtUsd(v), 'Cumulative P&L']}
            />
            <Area type="monotone" dataKey="pnl" stroke="#00ff88" strokeWidth={2.5} fill="url(#pnlGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
