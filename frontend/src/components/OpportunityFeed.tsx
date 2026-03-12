import { useState } from 'react'
import { useOpportunities } from '../hooks/useApi'
import { fmt, fmtUsd, fmtDuration, fmtTime, profitColor } from '../utils/format'
import type { ArbitrageOpportunity } from '../types'
import clsx from 'clsx'

type Filter = 'all' | 'profitable' | 'active'

function DirectionBadge({ direction }: { direction: string }) {
  return (
    <span className={clsx(
      'text-[10px] font-mono px-1.5 py-0.5 rounded border',
      direction === 'CEX_TO_DEX'
        ? 'text-terminal-cyan border-terminal-cyan/40 bg-terminal-cyan/10'
        : 'text-terminal-amber border-terminal-amber/40 bg-terminal-amber/10'
    )}>
      {direction === 'CEX_TO_DEX' ? 'CEX→DEX' : 'DEX→CEX'}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'open') return (
    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border text-terminal-green border-terminal-green/40 bg-terminal-green/10 animate-pulse-slow">
      OPEN
    </span>
  )
  if (status === 'expired') return (
    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border text-terminal-muted border-terminal-muted/30">
      EXPIRED
    </span>
  )
  return (
    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border text-terminal-dim border-terminal-dim/30">
      CLOSED
    </span>
  )
}

function OppCard({ opp }: { opp: ArbitrageOpportunity }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className={clsx(
        'border-b border-terminal-border/40 cursor-pointer transition-colors',
        'hover:bg-white/[0.02]',
        opp.status === 'open' && 'bg-terminal-green/5',
        opp.is_profitable && opp.status === 'closed' && 'bg-terminal-green/[0.03]',
      )}
      onClick={() => setExpanded(e => !e)}
    >
      {/* Summary row */}
      <div className="px-3 py-2.5">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold text-terminal-text">{opp.symbol}</span>
            <DirectionBadge direction={opp.direction} />
            <StatusBadge status={opp.status} />
          </div>
          <span className={clsx('font-mono text-xs font-bold', profitColor(opp.net_profit_usd))}>
            {opp.net_profit_usd >= 0 ? '+' : ''}{fmtUsd(opp.net_profit_usd, 2)}
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px] font-mono text-terminal-muted">
          <span>
            <span className={opp.spread_bps >= 30 ? 'text-terminal-green font-semibold' : ''}>
              {fmt(opp.spread_bps, 1)} bps
            </span>
            {opp.duration_seconds != null && (
              <span className="ml-2 text-terminal-dim">{fmtDuration(opp.duration_seconds)}</span>
            )}
          </span>
          <span>{fmtTime(opp.opened_at)}</span>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-terminal-border/40 bg-terminal-panel/30">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2 text-[11px] font-mono">
            <Row label="CEX Price" value={fmt(opp.cex_price, opp.cex_price > 100 ? 2 : 6)} />
            <Row label="DEX Price" value={fmt(opp.dex_price, opp.dex_price > 100 ? 2 : 6)} />
            <Row label="Gross Profit" value={fmtUsd(opp.gross_profit_usd)} />
            <Row label="Gas Cost" value={fmtUsd(opp.gas_cost_usd)} className="text-terminal-red" />
            <Row label="Slippage" value={fmtUsd(opp.slippage_estimate_usd)} className="text-terminal-amber" />
            <Row label="Trade Size" value={fmtUsd(opp.trade_size_usd, 0)} />
            <Row label="Opened" value={fmtTime(opp.opened_at)} />
            {opp.closed_at && <Row label="Closed" value={fmtTime(opp.closed_at)} />}
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <>
      <span className="text-terminal-muted">{label}</span>
      <span className={className ?? 'text-terminal-text'}>{value}</span>
    </>
  )
}

export function OpportunityFeed() {
  const [filter, setFilter] = useState<Filter>('all')
  const { data, isLoading } = useOpportunities({
    is_profitable: filter === 'profitable' ? true : undefined,
    status: filter === 'active' ? 'open' : undefined,
    limit: 50,
  })

  const TABS: { key: Filter; label: string }[] = [
    { key: 'all', label: 'ALL' },
    { key: 'profitable', label: 'PROFITABLE' },
    { key: 'active', label: 'ACTIVE' },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-terminal-border shrink-0">
        <span className="text-xs font-mono font-semibold text-terminal-cyan tracking-wider">
          OPPORTUNITY FEED
        </span>
        <span className="text-xs font-mono text-terminal-muted">{data?.total ?? 0} TOTAL</span>
      </div>

      {/* Filter tabs */}
      <div className="flex border-b border-terminal-border shrink-0">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={clsx(
              'flex-1 py-1.5 text-[10px] font-mono tracking-wider transition-colors',
              filter === t.key
                ? 'text-terminal-cyan border-b-2 border-terminal-cyan bg-terminal-cyan/5'
                : 'text-terminal-muted hover:text-terminal-dim'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-px p-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-14 rounded bg-terminal-panel/60 animate-pulse" />
            ))}
          </div>
        ) : data?.items.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-xs font-mono text-terminal-muted">No opportunities</span>
          </div>
        ) : (
          data?.items.map(opp => <OppCard key={opp.id} opp={opp} />)
        )}
      </div>
    </div>
  )
}
