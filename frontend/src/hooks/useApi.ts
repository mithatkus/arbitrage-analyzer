import { useQuery } from '@tanstack/react-query'
import type { LivePrice, ArbitrageOpportunity, AnalyticsSummary, HeatmapCell, CumulativePnlPoint, SpreadDistributionBucket, GasBreakevenRow } from '../types'

const BASE = '/api'

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export function useLivePrices() {
  return useQuery<LivePrice[]>({
    queryKey: ['livePrices'],
    queryFn: () => fetchJson('/prices/live'),
    refetchInterval: 5000,
  })
}

export function useOpportunities(params?: {
  pair_id?: number
  is_profitable?: boolean
  status?: string
  limit?: number
}) {
  const qs = new URLSearchParams()
  if (params?.pair_id) qs.set('pair_id', String(params.pair_id))
  if (params?.is_profitable !== undefined) qs.set('is_profitable', String(params.is_profitable))
  if (params?.status) qs.set('status', params.status)
  if (params?.limit) qs.set('limit', String(params.limit))

  return useQuery<{ total: number; offset: number; limit: number; items: ArbitrageOpportunity[] }>({
    queryKey: ['opportunities', params],
    queryFn: () => fetchJson(`/opportunities?${qs}`),
    refetchInterval: 10000,
  })
}

export function useAnalyticsSummary() {
  return useQuery<AnalyticsSummary>({
    queryKey: ['analyticsSummary'],
    queryFn: () => fetchJson('/analytics/summary'),
    refetchInterval: 15000,
  })
}

export function useHeatmap(pairIds = '1,2,3') {
  return useQuery<HeatmapCell[]>({
    queryKey: ['heatmap', pairIds],
    queryFn: () => fetchJson(`/analytics/heatmap?pair_ids=${pairIds}`),
    refetchInterval: 60000,
  })
}

export function useCumulativePnl(pairIds = '1,2,3', days = 7) {
  return useQuery<CumulativePnlPoint[]>({
    queryKey: ['cumulativePnl', pairIds, days],
    queryFn: () => fetchJson(`/analytics/pnl-cumulative?pair_ids=${pairIds}&days=${days}`),
    refetchInterval: 30000,
  })
}

export function useSpreadDistribution(pairIds = '1,2,3') {
  return useQuery<SpreadDistributionBucket[]>({
    queryKey: ['spreadDist', pairIds],
    queryFn: () => fetchJson(`/analytics/distribution?pair_ids=${pairIds}`),
    refetchInterval: 60000,
  })
}

export function useGasBreakeven() {
  return useQuery<GasBreakevenRow[]>({
    queryKey: ['gasBreakeven'],
    queryFn: () => fetchJson('/analytics/gas-breakeven'),
    refetchInterval: 60000,
  })
}

export function usePriceHistory(pairId: number, hours = 1) {
  return useQuery<{ cex: Array<{time: string; value: number}>; dex: Array<{time: string; value: number}> }>({
    queryKey: ['priceHistory', pairId, hours],
    queryFn: () => fetchJson(`/prices/history?pair_id=${pairId}&hours=${hours}`),
    refetchInterval: 15000,
  })
}
