import React, { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  WEEKDAY_NAMES_SHORT, getMonthGridDays, isSameDay, isToday, pad2, getCategoryStyle
} from '../../utils/calendarUtils'

export default function DashboardMiniCalendar({
  events = [], cursor = new Date(), weekStartsOn = 1, hideWeekends = false
}) {
  const navigate = useNavigate()
  const days = useMemo(() => getMonthGridDays(cursor, weekStartsOn), [cursor, weekStartsOn])
  const currentMonth = cursor.getMonth()
  const currentYear = cursor.getFullYear()

  const weekdays = useMemo(() => {
    const order = []
    for (let i = 0; i < 7; i++) order.push((weekStartsOn + i) % 7)
    let wk = order.map((i) => WEEKDAY_NAMES_SHORT[i])
    if (hideWeekends) wk = wk.filter((_, idx) => {
      const orig = order[idx]
      return orig !== 0 && orig !== 6
    })
    return wk
  }, [weekStartsOn, hideWeekends])

  const visibleDays = useMemo(() => {
    if (!hideWeekends) return days
    return days.filter((d) => {
      const wd = d.getDay()
      return wd !== 0 && wd !== 6
    })
  }, [days, hideWeekends])

  const eventsByDate = useMemo(() => {
    const map = new Map()
    for (const ev of events) {
      const d = new Date(ev.startDateTime)
      const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(ev)
    }
    return map
  }, [events])

  const getEventsForDay = (d) => {
    const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
    return eventsByDate.get(key) || []
  }

  const cols = weekdays.length

  const handleDayClick = (d) => {
    const iso = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
    navigate(`/calendar?view=day&date=${iso}`)
  }

  const uniqueCategoriesForDay = (list) => {
    const seen = new Set()
    return list.map((ev) => {
      if (seen.has(ev.category)) return null
      seen.add(ev.category)
      return ev.category
    }).filter(Boolean)
  }

  return (
    <div className="w-full">
      <div className="grid gap-0 mb-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {weekdays.map((w, i) => (
          <div key={w + '_' + i} className="py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted text-center">
            {w}
          </div>
        ))}
      </div>

      <div
        className="grid gap-0 grid-flow-row auto-rows-fr"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {visibleDays.map((d, idx) => {
          const inMonth = d.getMonth() === currentMonth && d.getFullYear() === currentYear
          const dayEvents = getEventsForDay(d)
          const isTodayFlag = isToday(d)
          const cats = uniqueCategoriesForDay(dayEvents).slice(0, 3)

          return (
            <button
              type="button"
              key={d.toISOString() + '_' + idx}
              onClick={() => handleDayClick(d)}
              className={[
                'group relative h-[30px] p-0.5 flex flex-col items-center justify-start transition-colors rounded-lg',
                inMonth ? 'text-ink' : 'text-ink-soft/50',
                isTodayFlag ? 'bg-[var(--dms-color-info-soft)]/70 ring-1 ring-[var(--dms-color-info-ink)]/20' : 'hover:bg-[var(--dms-color-bg-surface-muted)]'
              ].join(' ')}
            >
              <span className={[
                'inline-flex items-center justify-center text-[11px] font-semibold h-6 w-6 rounded-full mt-0.5 shrink-0',
                isTodayFlag
                  ? 'bg-[var(--dms-color-brand-primary)] text-white shadow-[0_4px_10px_rgba(0,51,102,0.25)]'
                  : ''
              ].join(' ')}>
                {d.getDate()}
              </span>
              {cats.length > 0 && (
                <div className="mt-0.5 flex items-center justify-center gap-0.5">
                  {cats.map((cat, i) => {
                    const style = getCategoryStyle(cat)
                    return (
                      <span key={i} className={['h-1 w-1 rounded-full shrink-0', style.dot].join(' ')} />
                    )
                  })}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
