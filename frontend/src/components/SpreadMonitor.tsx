import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store'
import { useLivePrices } from '../hooks/useApi'
import { fmt, spreadColor } from '../utils/format'
import type { LivePrice } from '../types'
import clsx from 'clsx'

/** Tiny inline sparkline for last N spread values */
function Sparkline({ data, width = 80, height = 24 }: { data: number[]; width?: number; height?: number }) {
  if (data.length < 2) return <span className="text-terminal-muted font-mono text-xs">—</span>
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * height
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={width} height={height} className="opacity-70">
      <polyline points={pts} fill="none" stroke="#00f0ff" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

type SortKey = 'symbol' | 'cex_price' | 'dex_price' | 'spread_bps'

export function SpreadMonitor() {
  const { data: prices, isLoading } = useLivePrices()
  const { livePrices, priceFlash, setSelectedPair, selectedPairId } = useAppStore()
  const [sortKey, setSortKey] = useState<SortKey>('spread_bps')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  // Rolling spread history per pair_id
  const spreadHistory = useRef<Record<number, number[]>>({})

  // Merge REST data into store
  const { setLivePrices } = useAppStore()
  useEffect(() => {
    if (prices) setLivePrices(prices)
  }, [prices, setLivePrices])

  // Update spread history from live prices
  const allPrices = Object.values(livePrices)
  allPrices.forEach(p => {
    if (!spreadHistory.current[p.pair_id]) spreadHistory.current[p.pair_id] = []
    const hist = spreadHistory.current[p.pair_id]
    hist.push(p.spread_bps)
    if (hist.length > 60) hist.shift()
  })

  const rows = [...allPrices].sort((a, b) => {
    const va = a[sortKey] ?? 0
    const vb = b[sortKey] ?? 0
    const cmp = typeof va === 'string' ? (va as string).localeCompare(vb as string) : (va as number) - (vb as number)
    return sortDir === 'asc' ? cmp : -cmp
  })

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const TH = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <th
      className="px-2 py-2 text-left text-xs font-mono text-terminal-muted cursor-pointer hover:text-terminal-cyan select-none"
      onClick={() => toggleSort(k)}
    >
      {children}
      {sortKey === k && <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  )

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-terminal-border">
        <span className="text-xs font-mono font-semibold text-terminal-cyan tracking-wider">SPREAD MONITOR</span>
        <span className="text-xs font-mono text-terminal-muted">{rows.length} PAIRS</span>
      </div>

      {isLoading && allPrices.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="space-y-2 w-full px-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 rounded bg-terminal-panel/60 animate-pulse" />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-terminal-bg/90 backdrop-blur-sm">
              <tr>
                <TH k="symbol">PAIR</TH>
                <TH k="cex_price">CEX</TH>
                <TH k="dex_price">DEX</TH>
                <TH k="spread_bps">SPREAD</TH>
                <th className="px-2 py-2 text-left text-xs font-mono text-terminal-muted">TREND</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p: LivePrice) => {
                const isAboveThreshold = p.spread_bps >= 30
                const flash = priceFlash[p.pair_id]
                const isSelected = p.pair_id === selectedPairId
                const liqM = p.liquidity_usd >= 1_000_000
                  ? `${(p.liquidity_usd / 1_000_000).toFixed(1)}M`
                  : `${(p.liquidity_usd / 1_000).toFixed(0)}K`
                return (
                  <tr
                    key={p.pair_id}
                    onClick={() => setSelectedPair(p.pair_id)}
                    className={clsx(
                      'border-b border-terminal-border/40 cursor-pointer transition-colors',
                      isSelected ? 'bg-terminal-cyan/5' : 'hover:bg-white/[0.02]',
                      flash === 'green' && 'animate-flash-green',
                      flash === 'red' && 'animate-flash-red',
                      isAboveThreshold && 'bg-terminal-green/5'
                    )}
                  >
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1.5">
                        {isAboveThreshold && (
                          <span className="w-1.5 h-1.5 rounded-full bg-terminal-green animate-pulse" />
                        )}
                        <span className="font-mono font-semibold text-terminal-text">{p.symbol}</span>
                      </div>
                      <div className="text-[9px] font-mono text-terminal-muted mt-0.5 pl-0.5">
                        {p.direction === 'CEX_TO_DEX' ? 'CEX→DEX' : 'DEX→CEX'}
                        {' · '}liq ${liqM}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <div className="font-mono text-terminal-cyan">
                        {fmt(p.cex_price, p.cex_price > 100 ? 2 : 4)}
                      </div>
                      <div className="text-[9px] font-mono text-terminal-muted mt-0.5">
                        b {fmt(p.bid, p.bid > 100 ? 2 : 4)}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <div className="font-mono text-terminal-amber">
                        {fmt(p.dex_price, p.dex_price > 100 ? 2 : 4)}
                      </div>
                      <div className="text-[9px] font-mono text-terminal-muted mt-0.5">
                        fee {(p.pool_fee_tier / 10000).toFixed(2)}%
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <div className={clsx('font-mono font-bold', spreadColor(p.spread_bps))}>
                        {fmt(p.spread_bps, 1)}
                        <span className="text-terminal-muted font-normal ml-0.5">bps</span>
                      </div>
                      <div className="text-[9px] font-mono text-terminal-muted mt-0.5">
                        gas ${fmt(p.gas_cost_usd, 2)}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <Sparkline data={spreadHistory.current[p.pair_id] ?? []} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
