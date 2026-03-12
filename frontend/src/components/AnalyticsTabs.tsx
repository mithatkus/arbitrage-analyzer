import { useState, useEffect } from 'react'
import clsx from 'clsx'
import { PnlTab } from './tabs/PnlTab'
import { DistributionTab } from './tabs/DistributionTab'
import { HeatmapTab } from './tabs/HeatmapTab'
import { GasImpactTab } from './tabs/GasImpactTab'
import { SqlExplorer } from './tabs/SqlExplorer'
import { useAppStore } from '../store'

const TABS = [
  { key: 'pnl',   label: 'P&L SUMMARY' },
  { key: 'dist',  label: 'SPREAD DIST.' },
  { key: 'heat',  label: 'HEATMAP' },
  { key: 'gas',   label: 'GAS IMPACT' },
  { key: 'sql',   label: 'SQL EXPLORER' },
] as const

type TabKey = typeof TABS[number]['key']

export function AnalyticsTabs() {
  const [active, setActive] = useState<TabKey>('pnl')
  const { forceAnalyticsTab, setForceAnalyticsTab } = useAppStore()

  // Allow the help modal "Show me" to switch the active tab programmatically
  useEffect(() => {
    if (forceAnalyticsTab) {
      setActive(forceAnalyticsTab as TabKey)
      setForceAnalyticsTab(null)
    }
  }, [forceAnalyticsTab, setForceAnalyticsTab])

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex border-b border-terminal-border shrink-0">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={clsx(
              'px-4 py-2 text-xs font-mono tracking-wider transition-colors border-b-2 -mb-px',
              active === tab.key
                ? 'text-terminal-cyan border-terminal-cyan bg-terminal-cyan/5'
                : 'text-terminal-muted border-transparent hover:text-terminal-dim hover:border-terminal-border'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {active === 'pnl'  && <PnlTab />}
        {active === 'dist' && <DistributionTab />}
        {active === 'heat' && <HeatmapTab />}
        {active === 'gas'  && <GasImpactTab />}
        {active === 'sql'  && <SqlExplorer />}
      </div>
    </div>
  )
}
