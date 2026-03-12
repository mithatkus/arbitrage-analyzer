import { create } from 'zustand'
import type { LivePrice, ArbitrageOpportunity, ConnectionStatus, WsMessage } from '../types'

interface AppState {
  // Live prices keyed by pair_id
  livePrices: Record<number, LivePrice>
  // Connection statuses
  connections: ConnectionStatus
  // Recent opportunities from WS feed (newest first, max 100)
  recentOpportunities: ArbitrageOpportunity[]
  // Selected pair for charts
  selectedPairId: number
  // Flash states for price row animations
  priceFlash: Record<number, 'green' | 'red' | null>
  // Help modal: panel to pulse-highlight after "Show me" click
  highlightedPanel: string | null
  // Help modal: analytics tab to switch to after "Show me" click
  forceAnalyticsTab: string | null

  // Actions
  setLivePrices: (prices: LivePrice[]) => void
  handleWsMessage: (msg: WsMessage) => void
  setConnection: (key: keyof ConnectionStatus, value: boolean) => void
  setSelectedPair: (id: number) => void
  prependOpportunity: (opp: ArbitrageOpportunity) => void
  setHighlightedPanel: (id: string | null) => void
  setForceAnalyticsTab: (tab: string | null) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  livePrices: {},
  connections: { binance: false, uniswap: false, gas: false, database: false, websocket: false },
  recentOpportunities: [],
  selectedPairId: 1,
  priceFlash: {},
  highlightedPanel: null,
  forceAnalyticsTab: null,

  setLivePrices: (prices) => {
    const map: Record<number, LivePrice> = {}
    prices.forEach(p => { map[p.pair_id] = p })
    set({ livePrices: map })
  },

  handleWsMessage: (msg) => {
    if (msg.type === 'price_update') {
      const prev = get().livePrices[msg.pair_id]
      const flash = prev
        ? (msg.cex_price > prev.cex_price ? 'green' : msg.cex_price < prev.cex_price ? 'red' : null)
        : null
      set(state => ({
        livePrices: {
          ...state.livePrices,
          [msg.pair_id]: {
            ...(state.livePrices[msg.pair_id] || {}),
            pair_id: msg.pair_id,
            symbol: msg.symbol,
            cex_price: msg.cex_price,
            dex_price: msg.dex_price,
            spread_bps: msg.spread_bps,
            direction: msg.direction as LivePrice['direction'],
          } as LivePrice,
        },
        priceFlash: { ...state.priceFlash, [msg.pair_id]: flash },
      }))
      // Clear flash after 600ms
      if (flash) {
        setTimeout(() => {
          set(state => ({ priceFlash: { ...state.priceFlash, [msg.pair_id]: null } }))
        }, 600)
      }
    }
  },

  setConnection: (key, value) =>
    set(state => ({ connections: { ...state.connections, [key]: value } })),

  setSelectedPair: (id) => set({ selectedPairId: id }),

  prependOpportunity: (opp) =>
    set(state => ({
      recentOpportunities: [opp, ...state.recentOpportunities].slice(0, 100),
    })),

  setHighlightedPanel: (id) => set({ highlightedPanel: id }),
  setForceAnalyticsTab: (tab) => set({ forceAnalyticsTab: tab }),
}))
