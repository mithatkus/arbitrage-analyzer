export interface TokenPair {
  id: number
  symbol: string
  base_token: string
  quote_token: string
  uniswap_pool_address: string
  binance_symbol: string
  is_active: boolean
  cex_price: number | null
  cex_bid: number | null
  cex_ask: number | null
  dex_price: number | null
  dex_liquidity_usd: number | null
  cex_updated_at: string | null
  dex_updated_at: string | null
}

export interface LivePrice {
  pair_id: number
  symbol: string
  cex_price: number
  bid: number
  ask: number
  dex_price: number
  liquidity_usd: number
  pool_fee_tier: number
  spread_bps: number
  direction: 'CEX_TO_DEX' | 'DEX_TO_CEX'
  gas_cost_usd: number
  base_fee_gwei: number
  cex_updated_at: string
  dex_updated_at: string
}

export interface ArbitrageOpportunity {
  id: number
  pair_id: number
  symbol: string
  direction: 'DEX_TO_CEX' | 'CEX_TO_DEX'
  cex_price: number
  dex_price: number
  spread_bps: number
  gross_profit_usd: number
  gas_cost_usd: number
  slippage_estimate_usd: number
  net_profit_usd: number
  is_profitable: boolean
  trade_size_usd: number
  opened_at: string
  closed_at: string | null
  duration_seconds: number | null
  status: 'open' | 'closed' | 'expired'
}

export interface AnalyticsSummary {
  total_opportunities: number
  profitable_count: number
  win_rate_pct: number
  total_pnl: number
  avg_spread_bps: number
  best_trade: number
  worst_trade: number
  open_count: number
  base_fee_gwei: number
  eth_price_usd: number
  swap_cost_usd: number
}

export interface PricePoint {
  time: string
  value: number
  source: 'cex' | 'dex'
}

export interface HeatmapCell {
  day_of_week: number
  hour_of_day: number
  opportunity_count: number
  profitable_count: number
  avg_spread_bps: number
  avg_net_profit: number
  total_net_profit: number
}

export interface CumulativePnlPoint {
  symbol: string
  ts: string
  net_profit_usd: number
  cumulative_pnl: number
  direction: string
  spread_bps: number
  seq: number
}

export interface SpreadDistributionBucket {
  bucket: number
  spread_bps_midpoint: number
  frequency: number
}

export interface GasBreakevenRow {
  trade_size_usd: number
  breakeven_p25_gas_bps: number
  breakeven_p50_gas_bps: number
  breakeven_p75_gas_bps: number
  breakeven_p90_gas_bps: number
  breakeven_p99_gas_bps: number
  avg_base_fee_gwei: number
  avg_priority_fee_gwei: number
}

export interface ConnectionStatus {
  binance: boolean
  uniswap: boolean
  gas: boolean
  database: boolean
  websocket: boolean
}

// WebSocket message types
export type WsMessage =
  | { type: 'price_update'; pair_id: number; symbol: string; cex_price: number; dex_price: number; spread_bps: number; direction: string; timestamp: string }
  | { type: 'opportunity_opened'; pair_id: number; symbol: string; opportunity_id: number; spread_bps: number; direction: string }
  | { type: 'opportunity_closed'; pair_id: number; symbol: string; opportunity_id: number; spread_bps: number }
  | { type: 'ping' }
