import { useHeatmap } from '../../hooks/useApi'
import { fmt } from '../../utils/format'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HOURS = Array.from({ length: 24 }, (_, i) => i)

export function HeatmapTab() {
  const { data } = useHeatmap()

  // Build lookup: day × hour → cell
  const lookup: Record<string, { count: number; pnl: number }> = {}
  let maxCount = 0

  data?.forEach(cell => {
    const key = `${cell.day_of_week}-${cell.hour_of_day}`
    lookup[key] = { count: cell.opportunity_count, pnl: cell.avg_net_profit }
    if (cell.opportunity_count > maxCount) maxCount = cell.opportunity_count
  })

  function opacity(count: number) {
    return maxCount > 0 ? Math.max(0.05, count / maxCount) : 0.05
  }

  return (
    <div className="h-full flex flex-col p-3 gap-2">
      <div className="flex items-center gap-4 shrink-0 text-[10px] font-mono text-terminal-muted">
        <span>Opportunity frequency by hour × day of week (last 30 days)</span>
        <div className="flex items-center gap-1 ml-auto">
          <span>Low</span>
          {[0.1, 0.25, 0.5, 0.75, 1].map(o => (
            <span key={o} className="w-4 h-3 rounded-sm" style={{ backgroundColor: `rgba(0,240,255,${o})` }} />
          ))}
          <span>High</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <div className="inline-block min-w-full">
          {/* Hour headers */}
          <div className="flex mb-1">
            <div className="w-8 shrink-0" />
            {HOURS.map(h => (
              <div key={h} className="w-7 text-center text-[9px] font-mono text-terminal-muted shrink-0">
                {h.toString().padStart(2, '0')}
              </div>
            ))}
          </div>

          {/* Grid rows */}
          {DAYS.map((day, dayIdx) => (
            <div key={day} className="flex mb-0.5">
              <div className="w-8 flex items-center text-[10px] font-mono text-terminal-muted shrink-0">{day}</div>
              {HOURS.map(hour => {
                const cell = lookup[`${dayIdx + 1}-${hour}`]
                const count = cell?.count ?? 0
                const pnl = cell?.pnl ?? 0
                return (
                  <div
                    key={hour}
                    className="w-7 h-6 rounded-sm mx-px cursor-default group relative shrink-0"
                    style={{ backgroundColor: `rgba(0,240,255,${opacity(count)})` }}
                  >
                    {/* Tooltip */}
                    {count > 0 && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-20 bg-terminal-panel border border-terminal-border rounded px-2 py-1 text-[10px] font-mono whitespace-nowrap shadow-lg">
                        <div className="text-terminal-cyan">{day} {hour.toString().padStart(2,'0')}:00</div>
                        <div className="text-terminal-text">{count} opps</div>
                        <div className={pnl >= 0 ? 'text-terminal-green' : 'text-terminal-red'}>
                          avg ${fmt(pnl, 2)}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
