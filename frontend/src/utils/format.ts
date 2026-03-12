/** Format a number to N decimal places */
export const fmt = (n: number | null | undefined, decimals = 2) =>
  n == null ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

/** Format currency with $ sign */
export const fmtUsd = (n: number | null | undefined, decimals = 2) =>
  n == null ? '—' : `$${fmt(n, decimals)}`

/** Format basis points */
export const fmtBps = (n: number | null | undefined) =>
  n == null ? '—' : `${fmt(n, 1)} bps`

/** Format duration in seconds to human-readable */
export const fmtDuration = (secs: number | null | undefined) => {
  if (secs == null) return '—'
  if (secs < 60) return `${secs}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
}

/** Format a UTC timestamp to HH:MM:SS */
export const fmtTime = (iso: string | null | undefined) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-US', { hour12: false, timeZone: 'UTC' })
}

/** Profit color class */
export const profitColor = (n: number) =>
  n > 0 ? 'text-terminal-green' : n < 0 ? 'text-terminal-red' : 'text-terminal-dim'

/** Spread color class */
export const spreadColor = (bps: number) => {
  if (bps >= 30) return 'text-terminal-green'
  if (bps >= 15) return 'text-terminal-amber'
  return 'text-terminal-dim'
}
