import { useEffect, useRef, useState } from 'react'
import { createChart, ColorType, CrosshairMode } from 'lightweight-charts'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import { useAppStore } from '../../store'
import { usePriceHistory } from '../../hooks/useApi'
import { fmt } from '../../utils/format'
import clsx from 'clsx'

const TIME_RANGES = [
  { label: '1H', hours: 1 },
  { label: '4H', hours: 4 },
  { label: '12H', hours: 12 },
  { label: '24H', hours: 24 },
  { label: '7D', hours: 168 },
]

export function PriceChart() {
  const { selectedPairId, livePrices } = useAppStore()
  const [hours, setHours] = useState(1)
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const cexSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const dexSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)

  const { data: history } = usePriceHistory(selectedPairId, hours)
  const currentPair = livePrices[selectedPairId]

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.1)' },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.1)',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: true,
      handleScale: true,
    })

    const cexSeries = chart.addLineSeries({
      color: '#00f0ff',
      lineWidth: 2,
      title: 'CEX (Binance)',
      priceLineVisible: false,
      lastValueVisible: true,
    })

    const dexSeries = chart.addLineSeries({
      color: '#ffaa00',
      lineWidth: 2,
      title: 'DEX (Uniswap)',
      priceLineVisible: false,
      lastValueVisible: true,
    })

    chartRef.current = chart
    cexSeriesRef.current = cexSeries
    dexSeriesRef.current = dexSeries

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        })
      }
    }
    window.addEventListener('resize', handleResize)
    handleResize()

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
    }
  }, [])

  // Update data when history changes
  useEffect(() => {
    if (!history || !cexSeriesRef.current || !dexSeriesRef.current) return

    const toChartData = (pts: Array<{time: string; value: number}>) =>
      pts
        .filter(p => p.value > 0)
        .map(p => ({ time: Math.floor(new Date(p.time).getTime() / 1000) as any, value: p.value }))
        .sort((a, b) => a.time - b.time)

    try {
      const cexData = toChartData(history.cex)
      const dexData = toChartData(history.dex)
      if (cexData.length > 0) cexSeriesRef.current.setData(cexData)
      if (dexData.length > 0) dexSeriesRef.current.setData(dexData)
      chartRef.current?.timeScale().fitContent()
    } catch {
      // ignore stale data errors
    }
  }, [history])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-terminal-border shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-xs font-mono font-semibold text-terminal-cyan tracking-wider">
            PRICE CHART
          </span>
          {currentPair && (
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="text-terminal-muted">{currentPair.symbol}</span>
              <span className="text-terminal-cyan">{fmt(currentPair.cex_price, currentPair.cex_price > 100 ? 2 : 4)}</span>
              <span className="text-terminal-muted">vs</span>
              <span className="text-terminal-amber">{fmt(currentPair.dex_price, currentPair.dex_price > 100 ? 2 : 4)}</span>
              <span className="text-terminal-muted">|</span>
              <span className={currentPair.spread_bps >= 30 ? 'text-terminal-green' : 'text-terminal-dim'}>
                {fmt(currentPair.spread_bps, 1)} bps
              </span>
            </div>
          )}
        </div>
        {/* Time range selector */}
        <div className="flex items-center gap-1">
          {TIME_RANGES.map(r => (
            <button
              key={r.label}
              onClick={() => setHours(r.hours)}
              className={clsx(
                'px-2 py-0.5 text-xs font-mono rounded transition-colors',
                r.hours === hours
                  ? 'bg-terminal-cyan/20 text-terminal-cyan border border-terminal-cyan/30'
                  : 'text-terminal-muted hover:text-terminal-text'
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-3 py-1.5 border-b border-terminal-border/40 shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-0.5 bg-terminal-cyan" />
          <span className="text-xs font-mono text-terminal-muted">Binance</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-0.5 bg-terminal-amber" />
          <span className="text-xs font-mono text-terminal-muted">Uniswap v3</span>
        </div>
      </div>

      {/* Chart */}
      <div ref={chartContainerRef} className="flex-1 min-h-0" />
    </div>
  )
}
