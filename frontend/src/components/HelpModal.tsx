import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '../store'

// ─── Section definitions ────────────────────────────────────────────────────

interface Section {
  title: string
  tag: string           // short label for step pill
  panelId: string       // DOM id of the panel to pulse on "Show me"
  analyticsTab?: string // which analytics tab to activate (bottom panel only)
  content: React.ReactNode
}

const SECTIONS: Section[] = [
  {
    title: 'Top Bar — At a Glance',
    tag: 'TOP BAR',
    panelId: 'panel-topbar',
    content: (
      <div className="space-y-4">
        <p className="text-terminal-dim text-sm leading-relaxed">
          The top bar is your always-on status strip. Before trusting any signal on this screen, glance here first.
        </p>
        <div className="space-y-3">
          <Row label="Connection dots">
            Each dot represents a live data feed. <Hl>Green</Hl> means
            the connection is active and streaming. <Hl c="red">Red</Hl> means
            it's offline — if BINANCE or UNISWAP goes red, price data will go
            stale and you should ignore any signals until it recovers.
          </Row>
          <Row label="GAS">
            The current cost to execute a transaction on the Ethereum blockchain,
            in gwei. Think of it as a toll that every trade must pay.{' '}
            <Hl>Green (&lt;20 gwei)</Hl> means cheap execution;{' '}
            <Hl c="amber">amber</Hl> means elevated;{' '}
            <Hl c="red">red (&gt;50 gwei)</Hl> means many opportunities that
            look profitable on paper will be wiped out by fees — treat signals
            with extra scepticism.
          </Row>
          <Row label="ETH">
            The current price of Ether in USD. This matters because gas is
            denominated in ETH — the same 20-gwei transaction costs twice as
            much at $6,000 ETH as it does at $3,000 ETH.
          </Row>
          <Row label="WIN %">
            Your running win rate — the fraction of closed opportunities that
            ended with a positive net profit after all costs.
          </Row>
          <Row label="Clock">
            UTC time. Crypto markets are global, so all timestamps on this
            dashboard use UTC as the standard reference.
          </Row>
        </div>
      </div>
    ),
  },
  {
    title: 'Spread Monitor',
    tag: 'LEFT PANEL',
    panelId: 'panel-spread-monitor',
    content: (
      <div className="space-y-4">
        <p className="text-terminal-dim text-sm leading-relaxed">
          The Spread Monitor is your live watchlist. It tracks three token pairs
          simultaneously and updates in real time as prices change on both venues.
        </p>
        <div className="space-y-3">
          <Row label="Symbol & dot">
            The pair name (e.g. ETH/USDC). A <Hl>pulsing green dot</Hl> to its
            left means the spread is currently wide enough to be flagged as an
            arbitrage opportunity. No dot = prices are tracking closely, no
            actionable gap.
          </Row>
          <Row label="CEX price (cyan)">
            The mid-market price on Binance, derived from the best bid and ask.
            The smaller number below it is the best bid — the highest price a
            buyer is currently willing to pay.
          </Row>
          <Row label="DEX price (amber)">
            The on-chain price in Uniswap's liquidity pool for this pair. The
            small percentage below it is the pool's swap fee (e.g. 0.05%) —
            this fee is deducted from every trade that goes through the pool.
          </Row>
          <Row label="Spread (bps)">
            How far apart the two prices are, in basis points (1 bp = 0.01%).
            A spread of 30 bps means the prices differ by 0.30%, which is the
            system's detection threshold. The gas cost shown below the spread
            is the current on-chain cost to execute in dollars — compare this
            to the opportunity's net profit to sanity-check viability.
          </Row>
          <Row label="Sparkline">
            A miniature chart of how the spread has moved over the last few
            minutes. Flat = prices tracking tightly. A spike = a recent
            dislocation worth investigating in the centre chart.
          </Row>
          <Row label="Row flash">
            Rows flash briefly green or red whenever a new price tick arrives.
            Click any row to select that pair — the Price Chart in the centre
            will update to that pair's history.
          </Row>
        </div>
      </div>
    ),
  },
  {
    title: 'Price Chart',
    tag: 'CENTRE',
    panelId: 'panel-price-chart',
    content: (
      <div className="space-y-4">
        <p className="text-terminal-dim text-sm leading-relaxed">
          The Price Chart is your main analytical view. It plots both the CEX
          price (<Hl>cyan — Binance</Hl>) and the DEX price (
          <Hl c="amber">amber — Uniswap</Hl>) for whichever pair you've selected
          in the Spread Monitor.
        </p>
        <div className="space-y-3">
          <Row label="Lines tracking closely">
            When the two lines run almost on top of each other, the market is
            efficient — other traders have already eliminated the price gap.
            This is normal most of the time.
          </Row>
          <Row label="Lines diverging">
            When one line moves sharply while the other lags, that's the spread
            opening. The wider the visual gap, the larger the spread in basis
            points. This is when the opportunity feed on the right starts
            logging cards.
          </Row>
          <Row label="Time range buttons">
            The <Hl>1H / 4H / 12H / 24H / 7D</Hl> buttons in the top right
            control the time window. Use 1H to see intraday micro-movements;
            use 7D to assess longer-term price correlation between the two
            venues.
          </Row>
          <Row label="Hover crosshair">
            Move your cursor over the chart to see a crosshair with the exact
            CEX price, DEX price, and computed spread at that moment in time.
          </Row>
        </div>
      </div>
    ),
  },
  {
    title: 'Opportunity Feed',
    tag: 'RIGHT PANEL',
    panelId: 'panel-opportunity-feed',
    content: (
      <div className="space-y-4">
        <p className="text-terminal-dim text-sm leading-relaxed">
          Every time the spread between the two venues exceeds the profitable
          threshold, the system logs it here as a card. Think of this as the
          trade blotter — a running record of every signal the engine has
          fired.
        </p>
        <div className="space-y-3">
          <Row label="Direction">
            This tells you where you're buying and selling.{' '}
            <Hl>DEX → CEX</Hl> means the asset is cheaper on Uniswap, so you'd
            buy there and sell on Binance.{' '}
            <Hl>CEX → DEX</Hl> is the reverse — buy on Binance, sell on
            Uniswap. In both cases, the profit comes from the price gap between
            the two venues.
          </Row>
          <Row label="Spread (bps)">
            How wide the gap was at the moment the opportunity was detected.
            Wider spread = larger gross profit before costs.
          </Row>
          <Row label="Duration">
            How long the spread stayed above the threshold before closing back
            down. Real-world CEX-DEX arbitrage windows typically last seconds —
            faster bots close gaps quickly.
          </Row>
          <Row label="Net profit (green / red)">
            What would have remained after deducting all costs: the Uniswap
            pool swap fee, Binance taker fee, on-chain gas, and estimated
            slippage. <Hl>Green</Hl> = profitable after all costs.{' '}
            <Hl c="red">Red</Hl> = the spread existed, but costs exceeded it.
          </Row>
          <Row label="Expanding a card">
            Click any card to see the full cost breakdown: entry prices on each
            venue, gross spread profit, gas cost, execution costs, and trade
            size.
          </Row>
          <Row label="Filter tabs">
            The tabs at the top of the feed let you filter to <Hl>All</Hl>,{' '}
            <Hl>Profitable only</Hl>, or <Hl>Active</Hl> (currently open
            opportunities detected in the current live session).
          </Row>
        </div>
      </div>
    ),
  },
  {
    title: 'Analytics: P&L & Spread Distribution',
    tag: 'P&L / DIST.',
    panelId: 'panel-analytics',
    analyticsTab: 'pnl',
    content: (
      <div className="space-y-4">
        <p className="text-terminal-dim text-sm leading-relaxed">
          The bottom panel contains five analytical views. The first two answer
          the most fundamental question: <em className="text-terminal-cyan not-italic">Is the strategy actually making money?</em>
        </p>
        <div className="space-y-3">
          <Row label="P&L Summary — the equity curve">
            The chart is the cumulative sum of every net profit and loss from
            all closed opportunities. A steadily rising line means positive
            expected value — the strategy is generating edge. A flat or
            declining line means costs are outpacing spreads. The five stat
            cards above give you: total P&L, win rate, best trade, worst trade,
            and total opportunity count.
          </Row>
          <Row label="Win rate">
            The fraction of closed trades that ended with positive net profit.
            A 40% win rate isn't necessarily bad — if winners are significantly
            larger than losers (as is common with exponential spread
            distributions), the strategy can still be profitable overall.
          </Row>
          <Row label="Spread Distribution">
            Switch to this tab to see a histogram of how often different spread
            sizes occur. Most bars will be near the left (small spreads are
            common), with a long right tail (large spreads are rare but
            represent the biggest winners). If the histogram is heavily
            clustered at the detection threshold, the strategy is operating in
            a thin-margin environment and is highly sensitive to gas cost
            changes.
          </Row>
        </div>
      </div>
    ),
  },
  {
    title: 'Analytics: Heatmap & Gas Impact',
    tag: 'HEATMAP / GAS',
    panelId: 'panel-analytics',
    analyticsTab: 'heat',
    content: (
      <div className="space-y-4">
        <p className="text-terminal-dim text-sm leading-relaxed">
          These two tabs answer timing and cost questions: <em className="text-terminal-cyan not-italic">When do opportunities appear, and how much spread do you need to cover your costs?</em>
        </p>
        <div className="space-y-3">
          <Row label="Heatmap — when do opportunities happen?">
            Each cell is one hour-of-day × day-of-week slot (UTC). Brighter
            cyan = more opportunities detected in that window. Look for
            patterns: are there more inefficiencies during periods of low
            liquidity (late US night / early Asian morning)? Do weekends
            behave differently from weekdays? Crypto markets trade 24/7, so
            unlike equities there's no overnight gap.
          </Row>
          <Row label="Gas Impact — what spread do you actually need?">
            The table shows the minimum spread (in basis points) required to
            break even at six different trade sizes, across three gas price
            scenarios: median-day gas, 90th percentile (elevated), and 99th
            percentile (congested network). Read it as: "If gas is at its
            typical level and I'm trading $10K, I need at least X bps just to
            cover all fees." Smaller trades need proportionally wider spreads
            because gas is a fixed-dollar cost — it doesn't scale with trade
            size the way the spread profit does.
          </Row>
        </div>
      </div>
    ),
  },
  {
    title: 'SQL Explorer & Key Terms',
    tag: 'SQL / GLOSSARY',
    panelId: 'panel-analytics',
    analyticsTab: 'sql',
    content: (
      <div className="space-y-5">
        <div className="space-y-3">
          <p className="text-terminal-dim text-sm leading-relaxed">
            The SQL Explorer is a live query window connected directly to the
            database powering this dashboard. The pre-loaded examples showcase
            the analytical techniques behind each chart — select one from the
            dropdown, click <Hl>RUN QUERY</Hl>, and results appear in the table
            below. You can also write your own SELECT queries. The system blocks
            anything that would modify data.
          </p>
          <div className="grid grid-cols-1 gap-1.5 text-xs font-mono">
            {[
              ['Rolling Spread Average', 'Moving averages with SQL window functions (AVG OVER ROWS BETWEEN)'],
              ['Profitability Percentiles', 'P25/P50/P75/P95 of net profit using PERCENTILE_CONT'],
              ['Gas Break-Even CTEs', 'Minimum viable spread by trade size using CROSS JOIN + UNNEST'],
              ['Cumulative P&L', 'Equity curve via SUM OVER UNBOUNDED PRECEDING'],
            ].map(([name, desc]) => (
              <div key={name} className="flex gap-2">
                <span className="text-terminal-cyan shrink-0">▸</span>
                <span><span className="text-terminal-text">{name}</span> — <span className="text-terminal-muted">{desc}</span></span>
              </div>
            ))}
          </div>
        </div>

        {/* Glossary */}
        <div>
          <div className="text-[10px] font-mono text-terminal-cyan tracking-widest mb-3 flex items-center gap-2">
            <span className="h-px flex-1 bg-terminal-border/60" />
            KEY TERMS
            <span className="h-px flex-1 bg-terminal-border/60" />
          </div>
          <div className="grid grid-cols-1 gap-2">
            {[
              ['CEX', 'A centralised exchange like Binance — a company holds your funds and matches your orders against other traders.'],
              ['DEX', 'A decentralised exchange like Uniswap — trades execute directly from your wallet via a smart contract; no company in the middle.'],
              ['Spread', 'The difference in price for the same asset between two venues, expressed in basis points (1 bp = 0.01%, so 30 bps = 0.30%).'],
              ['Basis points (bps)', 'A unit for small percentage differences — 100 bps equals 1%. Used because saying "0.03%" is easy to mishear; "3 bps" is precise.'],
              ['Gas fees', 'The cost to execute a transaction on Ethereum, paid in ETH to the network\'s validators — set by real-time demand for block space.'],
              ['Slippage', 'The gap between the price you expected and the price you actually got, caused by your trade moving the market — bigger trades in thinner pools slip more.'],
              ['Arbitrage', 'Simultaneously buying an asset where it\'s cheaper and selling where it\'s more expensive to capture the price gap as near-risk-free profit.'],
              ['Liquidity', 'The depth of tradeable volume at current prices — high liquidity means tighter spreads and less slippage when you trade.'],
            ].map(([term, def]) => (
              <div key={term} className="flex gap-2 text-xs leading-relaxed">
                <span className="text-terminal-cyan font-mono font-semibold shrink-0 w-32">{term}</span>
                <span className="text-terminal-dim">{def}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },
]

// ─── Small helpers ───────────────────────────────────────────────────────────

function Hl({ children, c = 'cyan' }: { children: React.ReactNode; c?: 'cyan' | 'amber' | 'red' }) {
  const color = c === 'cyan' ? 'text-terminal-cyan' : c === 'amber' ? 'text-terminal-amber' : 'text-terminal-red'
  return <span className={`${color} font-semibold`}>{children}</span>
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="text-[10px] font-mono text-terminal-cyan tracking-wider shrink-0 w-28 pt-0.5 uppercase">{label}</span>
      <span className="text-terminal-dim text-xs leading-relaxed">{children}</span>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

interface HelpModalProps {
  open: boolean
  onClose: () => void
}

export function HelpModal({ open, onClose }: HelpModalProps) {
  const [step, setStep] = useState(0)
  const [dontShow, setDontShow] = useState(false)
  const { setHighlightedPanel, setForceAnalyticsTab } = useAppStore()

  // Reset to first step whenever the modal opens
  useEffect(() => { if (open) setStep(0) }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  const handleClose = useCallback(() => {
    if (dontShow) localStorage.setItem('arb-help-dismissed', '1')
    onClose()
  }, [dontShow, onClose])

  const handleShowMe = useCallback(() => {
    const section = SECTIONS[step]
    if (dontShow) localStorage.setItem('arb-help-dismissed', '1')
    onClose()
    // Small delay so the modal finishes closing before we highlight
    setTimeout(() => {
      setHighlightedPanel(section.panelId)
      if (section.analyticsTab) setForceAnalyticsTab(section.analyticsTab)
      setTimeout(() => setHighlightedPanel(null), 3000)
    }, 120)
  }, [step, dontShow, onClose, setHighlightedPanel, setForceAnalyticsTab])

  if (!open) return null

  const section = SECTIONS[step]
  const total = SECTIONS.length

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ animation: 'backdropIn 0.2s ease-out forwards' }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/72 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal panel */}
      <div
        className="relative w-full max-w-2xl flex flex-col rounded-sm border border-terminal-border bg-terminal-panel shadow-2xl"
        style={{
          animation: 'modalIn 0.25s ease-out forwards',
          maxHeight: 'min(86vh, 680px)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-terminal-border/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-terminal-cyan animate-pulse-slow shadow-glow-cyan" />
            <span className="font-mono text-xs font-bold tracking-widest text-terminal-cyan">
              DASHBOARD GUIDE
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-mono text-[10px] text-terminal-muted tracking-wider">
              STEP {step + 1} OF {total}
            </span>
            <button
              onClick={handleClose}
              className="text-terminal-muted hover:text-terminal-text transition-colors font-mono text-lg leading-none"
              aria-label="Close guide"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── Section title ── */}
        <div className="px-5 pt-4 pb-3 shrink-0">
          <div className="flex items-center gap-3">
            <span className="px-2 py-0.5 rounded-sm bg-terminal-cyan/10 border border-terminal-cyan/25 text-terminal-cyan font-mono text-[9px] tracking-widest">
              {section.tag}
            </span>
            <h2 className="font-mono text-sm font-semibold text-terminal-text tracking-wide">
              {section.title}
            </h2>
          </div>
          <div className="mt-2.5 h-px bg-gradient-to-r from-terminal-cyan/30 via-terminal-border/40 to-transparent" />
        </div>

        {/* ── Content (scrollable) ── */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-2">
          {section.content}
        </div>

        {/* ── Navigation ── */}
        <div className="shrink-0 border-t border-terminal-border/60 px-5 py-3">
          {/* Progress dots */}
          <div className="flex justify-center gap-1.5 mb-3">
            {SECTIONS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className="transition-all"
                aria-label={`Go to step ${i + 1}`}
              >
                <span
                  className={`block rounded-full transition-all ${
                    i === step
                      ? 'w-5 h-1.5 bg-terminal-cyan'
                      : i < step
                      ? 'w-1.5 h-1.5 bg-terminal-cyan/40'
                      : 'w-1.5 h-1.5 bg-terminal-border'
                  }`}
                />
              </button>
            ))}
          </div>

          {/* Buttons row */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStep(s => Math.max(0, s - 1))}
              disabled={step === 0}
              className="px-3 py-1.5 text-xs font-mono text-terminal-muted border border-terminal-border/60 rounded hover:border-terminal-border hover:text-terminal-dim disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              ← Back
            </button>

            {/* Show me — centred */}
            <button
              onClick={handleShowMe}
              className="flex-1 py-1.5 text-xs font-mono bg-terminal-cyan/10 border border-terminal-cyan/35 text-terminal-cyan rounded hover:bg-terminal-cyan/20 hover:border-terminal-cyan/55 transition-colors"
            >
              Show me on screen ↗
            </button>

            {step < total - 1 ? (
              <button
                onClick={() => setStep(s => s + 1)}
                className="px-3 py-1.5 text-xs font-mono text-terminal-cyan border border-terminal-cyan/35 bg-terminal-cyan/10 rounded hover:bg-terminal-cyan/20 transition-colors"
              >
                Next →
              </button>
            ) : (
              <button
                onClick={handleClose}
                className="px-3 py-1.5 text-xs font-mono text-terminal-green border border-terminal-green/35 bg-terminal-green/10 rounded hover:bg-terminal-green/20 transition-colors"
              >
                Done ✓
              </button>
            )}
          </div>
        </div>

        {/* ── Don't show again ── */}
        <div className="shrink-0 px-5 pb-3.5 flex items-center gap-2">
          <input
            id="dont-show"
            type="checkbox"
            checked={dontShow}
            onChange={e => setDontShow(e.target.checked)}
            className="w-3 h-3 accent-terminal-cyan cursor-pointer"
          />
          <label
            htmlFor="dont-show"
            className="text-[10px] font-mono text-terminal-muted cursor-pointer hover:text-terminal-dim transition-colors select-none"
          >
            Don't show this guide automatically on startup
          </label>
        </div>
      </div>
    </div>
  )
}
