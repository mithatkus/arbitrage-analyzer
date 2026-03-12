# ARB Scanner — Dashboard Guide

> **Live demo:** [https://your-live-site-url.com](https://your-live-site-url.com) ← replace with deployed URL

This guide walks you through the ARB Scanner dashboard the way a senior analyst would explain their trading screen to a new hire. It assumes you understand finance but have never seen this specific tool before. No code jargon.

---

## Top Bar — At a Glance

The top bar is your always-on status strip. Before trusting any signal on screen, glance here first.

| Element | What it tells you |
|---|---|
| **Connection dots (green/red)** | Each dot is a live data feed. Green = active and streaming. Red = offline. If BINANCE or UNISWAP goes red, price data will go stale — ignore signals until it recovers. |
| **GAS** | Current cost to execute a transaction on Ethereum in gwei. Green (<20 gwei) = cheap; amber = elevated; red (>50 gwei) = high fees may wipe out apparent opportunities. |
| **ETH** | Ether price in USD. Gas is denominated in ETH, so this directly affects the dollar cost of every trade. |
| **WIN %** | Running win rate — fraction of closed trades that ended with positive net profit after all fees. |
| **Clock** | UTC time. All timestamps on this dashboard use UTC. |

---

## Left Panel — Spread Monitor

The Spread Monitor is your live watchlist. It tracks three token pairs simultaneously and updates in real time.

**What each column means:**

- **Symbol & dot** — The pair name (e.g. ETH/USDC). A pulsing green dot means the spread currently exceeds the profitable threshold. No dot = no actionable gap.
- **CEX price (cyan)** — The mid-market price on Binance, from the best bid and ask. The smaller number below is the best bid.
- **DEX price (amber)** — The on-chain price in Uniswap's liquidity pool. The percentage below it is the pool's swap fee (e.g. 0.05%), deducted from every trade through the pool.
- **Spread (bps)** — How far apart the two prices are in basis points (1 bp = 0.01%). The detection threshold is 30 bps. Gas cost is shown below for quick comparison.
- **Sparkline** — A miniature chart of the spread over the last few minutes. Flat = tight prices. Spike = recent dislocation worth investigating.
- **Row flash** — Rows briefly flash green or red on each new price tick. Click any row to select that pair for the Price Chart.

---

## Centre Panel — Price Chart

The Price Chart plots the CEX price (**cyan — Binance**) and DEX price (**amber — Uniswap**) for your selected pair.

**How to read it:**

- **Lines tracking closely** — The market is efficient; other traders have eliminated the gap. This is normal most of the time.
- **Lines diverging** — One venue moved sharply while the other lagged. That's the spread opening. The wider the visual gap, the larger the spread in basis points — and the more likely the opportunity feed on the right will log a card.

**Controls:**

- **1H / 4H / 12H / 24H / 7D** — Time range buttons. Use 1H for intraday micro-movements; use 7D to see longer-term price correlation between venues.
- **Hover crosshair** — Move your cursor over the chart to see exact CEX price, DEX price, and spread at that moment.

---

## Right Panel — Opportunity Feed

Every time the spread exceeds the profitable threshold, the system logs it here as a card. This is the trade blotter — a running record of every signal the engine has fired.

**What each card shows:**

| Field | Meaning |
|---|---|
| **Direction** | Where you're buying and selling. **DEX → CEX** = buy on Uniswap (cheaper), sell on Binance. **CEX → DEX** = buy on Binance, sell on Uniswap. The profit is the price gap between venues. |
| **Spread (bps)** | How wide the gap was at detection. Wider = larger gross profit before costs. |
| **Duration** | How long the spread stayed above threshold before closing. Real arbitrage windows typically last seconds — faster bots close gaps quickly. |
| **Net profit (green/red)** | What remains after all costs: Uniswap pool fee, Binance taker fee, on-chain gas, and estimated slippage. Green = profitable. Red = spread existed but costs exceeded it. |

Click any card to expand the full cost breakdown: entry prices on each venue, gross profit, gas paid, execution costs, and trade size.

**Filter tabs at the top:** All · Profitable · Active (currently open, live session)

---

## Bottom Panel — Analytics Tabs

### P&L Summary

*Answers: Is the strategy making money over time?*

The chart is the equity curve — the cumulative sum of every net profit and loss from all closed opportunities. A steadily rising line = positive expected value. A flat or declining line = costs are outpacing spreads.

The five stat cards show: total P&L, win rate, best single trade, worst single trade, and total opportunity count.

> **Note on win rate:** A 40% win rate isn't necessarily bad. If winning trades are significantly larger than losses — which is natural with exponential spread distributions — the strategy can be profitable despite more losses than wins.

---

### Spread Distribution

*Answers: Where do most opportunities cluster?*

A histogram of how often different spread sizes occur. Most bars will be on the left (small spreads are common), with a long right tail (large spreads are rare but represent the biggest potential profits). If the histogram is heavily clustered at the detection threshold, the strategy is in a thin-margin environment and highly sensitive to gas cost changes.

---

### Heatmap

*Answers: When do opportunities happen?*

Each cell is one hour-of-day × day-of-week slot (UTC). Brighter cyan = more opportunities detected in that window. Patterns to look for:

- Are there more inefficiencies during low-liquidity windows (late US night / early Asian morning)?
- Do weekends behave differently from weekdays?
- Crypto trades 24/7 — unlike equities, there's no overnight gap to close.

---

### Gas Impact

*Answers: How much spread do you actually need to cover costs?*

The table shows the minimum spread (in basis points) required to break even at six different trade sizes, across three gas price scenarios (median, 90th-percentile, 99th-percentile gas days).

Read it as: *"If gas is at its typical level and I'm trading $10K, I need at least X bps just to cover all fees."*

**Key insight:** Smaller trades require proportionally wider spreads because gas is a fixed-dollar cost — it doesn't scale with trade size the way spread profit does. A $1K trade at median gas needs ~120 bps just to break even; a $50K trade needs only ~22 bps.

---

### SQL Explorer

*A live query window into the analytical database behind the dashboard.*

Pre-loaded examples showcase the data model and SQL techniques:

| Query | Technique demonstrated |
|---|---|
| Rolling Spread Average | Window functions — `AVG OVER ROWS BETWEEN` |
| Profitability Percentiles | Ordered-set aggregates — `PERCENTILE_CONT WITHIN GROUP` |
| Gas Break-Even CTEs | Common table expressions + `CROSS JOIN UNNEST` |
| Cumulative P&L | `SUM OVER UNBOUNDED PRECEDING` (equity curve) |

Select a query from the dropdown, click **RUN QUERY**, and results appear in the table. You can also write your own `SELECT` queries. The system blocks any query that would modify data.

---

## Key Terms Glossary

| Term | Plain-English definition |
|---|---|
| **CEX** | A centralised exchange like Binance — a company holds your funds and matches orders against other traders. |
| **DEX** | A decentralised exchange like Uniswap — trades execute from your wallet via a smart contract, no company in the middle. |
| **Spread** | The difference in price for the same asset between two venues, expressed in basis points (1 bp = 0.01%, so 30 bps = 0.30%). |
| **Basis points (bps)** | A unit for small percentage differences — 100 bps equals 1%. Used because "0.03%" is easy to mishear; "3 bps" is precise. |
| **Gas fees** | The cost to execute a transaction on Ethereum, paid in ETH to the network's validators — set by real-time demand for block space. |
| **Slippage** | The gap between the price you expected and the price you actually got, caused by your trade moving the market — bigger trades in thinner pools slip more. |
| **Arbitrage** | Simultaneously buying an asset where it's cheaper and selling where it's more expensive to capture the price gap as near-risk-free profit. |
| **Liquidity** | The depth of tradeable volume at current prices — high liquidity means tighter spreads and less slippage when you trade. |

---

*ARB Scanner is a portfolio project demonstrating real-time data engineering, quantitative finance modelling, and full-stack development. All data is simulated — this is not a live trading system.*
