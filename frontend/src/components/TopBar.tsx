import { useEffect, useState } from 'react'
import { useAppStore } from '../store'
import { useAnalyticsSummary } from '../hooks/useApi'
import { fmt } from '../utils/format'
import clsx from 'clsx'

function UtcClock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span className="font-mono text-terminal-dim text-sm">
      {time.toUTCString().slice(17, 25)}{' '}
      <span className="text-terminal-muted">UTC</span>
    </span>
  )
}

function StatusDot({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={clsx(
        'w-2 h-2 rounded-full',
        active ? 'bg-terminal-green shadow-glow-green animate-pulse-slow' : 'bg-terminal-red'
      )} />
      <span className="text-xs font-mono text-terminal-dim">{label}</span>
    </div>
  )
}

export function TopBar({ onHelpClick }: { onHelpClick: () => void }) {
  const { connections } = useAppStore()
  const { data: summary } = useAnalyticsSummary()

  const gasGwei = summary?.base_fee_gwei ?? 0
  const gasColor = gasGwei < 20
    ? 'text-terminal-green'
    : gasGwei < 50 ? 'text-terminal-amber' : 'text-terminal-red'

  return (
    <header className="h-12 border-b border-terminal-border bg-terminal-panel/80 backdrop-blur-sm flex items-center px-4 gap-6 z-10">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-4">
        <span className="relative">
          <span className="w-2.5 h-2.5 rounded-full bg-terminal-cyan block animate-pulse-slow shadow-glow-cyan" />
        </span>
        <span className="font-mono font-bold text-sm tracking-widest text-terminal-cyan">
          ARB SCANNER
        </span>
      </div>

      {/* Connection indicators */}
      <div className="flex items-center gap-4 flex-1">
        <StatusDot label="BINANCE" active={connections.binance} />
        <StatusDot label="UNISWAP" active={connections.uniswap} />
        <StatusDot label="GAS ORACLE" active={connections.gas} />
        <StatusDot label="DATABASE" active={connections.database} />
        <StatusDot label="WS FEED" active={connections.websocket} />
      </div>

      {/* Stats */}
      <div className="flex items-center gap-6">
        {summary && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-xs text-terminal-muted font-mono">ETH</span>
              <span className="font-mono text-sm text-terminal-text">
                ${fmt(summary.eth_price_usd, 2)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-terminal-muted font-mono">GAS</span>
              <span className={clsx('font-mono text-sm', gasColor)}>
                {fmt(gasGwei, 0)} gwei
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-terminal-muted font-mono">WIN</span>
              <span className="font-mono text-sm text-terminal-green">
                {fmt(summary.win_rate_pct, 1)}%
              </span>
            </div>
          </>
        )}
        <UtcClock />

        {/* Help button */}
        <button
          onClick={onHelpClick}
          title="How to read this dashboard"
          className="w-6 h-6 rounded-full border border-terminal-border flex items-center justify-center text-terminal-muted hover:border-terminal-cyan/50 hover:text-terminal-cyan transition-colors font-mono text-xs font-bold leading-none"
        >
          ?
        </button>
      </div>
    </header>
  )
}
