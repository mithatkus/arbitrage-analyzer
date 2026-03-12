import { useEffect, useState } from 'react'
import { TopBar } from './components/TopBar'
import { SpreadMonitor } from './components/SpreadMonitor'
import { PriceChart } from './components/charts/PriceChart'
import { OpportunityFeed } from './components/OpportunityFeed'
import { AnalyticsTabs } from './components/AnalyticsTabs'
import { HelpModal } from './components/HelpModal'
import { useWebSocket } from './hooks/useWebSocket'
import { useAppStore } from './store'

// Error boundary component
import React from 'react'

class ErrorBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}

function PanelError({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-full">
      <span className="text-xs font-mono text-terminal-red">{label} failed to load</span>
    </div>
  )
}

export default function App() {
  useWebSocket()

  // Help modal — auto-opens on first visit (unless user dismissed it before)
  const [helpOpen, setHelpOpen] = useState(
    () => !localStorage.getItem('arb-help-dismissed')
  )

  const { setConnection, highlightedPanel } = useAppStore()
  useEffect(() => {
    // Poll /health for service status
    const poll = async () => {
      try {
        const res = await fetch('/health')
        if (res.ok) setConnection('database', true)
      } catch {
        setConnection('database', false)
      }
    }
    poll()
    const id = setInterval(poll, 30000)
    return () => clearInterval(id)
  }, [setConnection])

  // Helper: apply the pulsing highlight class when a panel is targeted by "Show me"
  const panelCls = (id: string) => highlightedPanel === id ? 'panel-highlighted' : ''

  return (
    <div className="h-screen flex flex-col overflow-hidden dot-grid">
      {/* TOP BAR */}
      <div id="panel-topbar" className={panelCls('panel-topbar')}>
        <ErrorBoundary fallback={<div className="h-12 bg-terminal-panel/80" />}>
          <TopBar onHelpClick={() => setHelpOpen(true)} />
        </ErrorBoundary>
      </div>

      {/* MAIN GRID — fills remaining height */}
      <div className="flex-1 min-h-0 grid" style={{ gridTemplateColumns: '260px 1fr 280px', gridTemplateRows: '1fr 240px' }}>

        {/* LEFT PANEL — Spread Monitor */}
        <div id="panel-spread-monitor" className={`row-span-1 glass-card m-1 overflow-hidden border border-terminal-border ${panelCls('panel-spread-monitor')}`}>
          <ErrorBoundary fallback={<PanelError label="Spread Monitor" />}>
            <SpreadMonitor />
          </ErrorBoundary>
        </div>

        {/* CENTER PANEL — Price Chart */}
        <div id="panel-price-chart" className={`row-span-1 glass-card m-1 overflow-hidden border border-terminal-border ${panelCls('panel-price-chart')}`}>
          <ErrorBoundary fallback={<PanelError label="Price Chart" />}>
            <PriceChart />
          </ErrorBoundary>
        </div>

        {/* RIGHT PANEL — Opportunity Feed */}
        <div id="panel-opportunity-feed" className={`row-span-1 glass-card m-1 overflow-hidden border border-terminal-border ${panelCls('panel-opportunity-feed')}`}>
          <ErrorBoundary fallback={<PanelError label="Opportunity Feed" />}>
            <OpportunityFeed />
          </ErrorBoundary>
        </div>

        {/* BOTTOM PANEL — Analytics (spans full width) */}
        <div id="panel-analytics" className={`col-span-3 glass-card mx-1 mb-1 overflow-hidden border border-terminal-border ${panelCls('panel-analytics')}`}>
          <ErrorBoundary fallback={<PanelError label="Analytics" />}>
            <AnalyticsTabs />
          </ErrorBoundary>
        </div>
      </div>

      {/* DEMO MODE FOOTER */}
      <div className="shrink-0 flex items-center justify-center gap-2 py-1 border-t border-terminal-border/30 bg-terminal-panel/30">
        <span className="w-1.5 h-1.5 rounded-full bg-terminal-amber/70" />
        <span className="text-[10px] font-mono text-terminal-muted/60 tracking-wider">
          PORTFOLIO PROJECT — DEMO MODE (replaying historical simulation data, not live trading)
        </span>
        <span className="w-1.5 h-1.5 rounded-full bg-terminal-amber/70" />
      </div>

      {/* HELP MODAL */}
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}
