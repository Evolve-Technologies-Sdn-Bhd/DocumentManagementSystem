import React, { useMemo } from 'react'
import CalendarEventBlock from './CalendarEventBlock'
import {
  WEEKDAY_NAMES_SHORT, WEEKDAY_NAMES_LONG, startOfWeek, endOfWeek,
  formatWeekHeader, pad2, isSameDay, isToday, addDays
} from '../../utils/calendarUtils'

export default function WeekView({
  cursor, events, weekStartsOn = 1, hideWeekends = false,
  workdayStart = 9, workdayEnd = 18, onSelectEvent, onSelectDate, onEventClick
}) {
  const start = startOfWeek(cursor, weekStartsOn)
  const end = endOfWeek(cursor, weekStartsOn)

  const days = useMemo(() => {
    const arr = []
    let cur = start
    while (cur <= end) {
      const d = new Date(cur)
      const wd = d.getDay()
      if (!hideWeekends || (wd !== 0 && wd !== 6)) arr.push(d)
      cur = addDays(cur, 1)
    }
    return arr
  }, [start, end, hideWeekends])

  const hours = useMemo(() => {
    const arr = []
    for (let h = workdayStart; h <= workdayEnd; h++) arr.push(h)
    return arr
  }, [workdayStart, workdayEnd])

  const colCount = days.length

  const eventsByDayHour = useMemo(() => {
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
    return eventsByDayHour.get(key) || []
  }

  return (
    <div className="flex flex-col h-full min-h-[70vh]">
      <div
        className="grid gap-0 border border-border rounded-t-2xl overflow-hidden bg-[var(--dms-color-bg-surface)]"
        style={{ gridTemplateColumns: `60px repeat(${colCount}, minmax(0, 1fr))` }}
      >
        <div className="p-2 border-r border-border text-[10px] uppercase tracking-widest text-ink-muted flex items-end justify-center">
          {formatWeekHeader(cursor, weekStartsOn)}
        </div>
        {days.map((d) => {
          const isTodayFlag = isToday(d)
          return (
            <button
              type="button"
              key={d.toISOString()}
              className="p-2 border-r border-border last:border-r-0 text-center text-left hover:bg-[var(--dms-color-info-soft)]/20 transition-colors"
              onClick={(e) => onSelectDate && onSelectDate(d, e.currentTarget)}
              title="Click to open daily activity"
            >
              <div className="text-[10px] uppercase tracking-widest text-ink-muted">{WEEKDAY_NAMES_SHORT[d.getDay()]}</div>
              <div className={[
                'mt-1 inline-flex items-center justify-center h-7 w-7 rounded-full text-sm font-semibold',
                isTodayFlag
                  ? 'bg-[var(--dms-color-brand-primary)] text-white shadow-[0_6px_14px_rgba(0,51,102,0.30)]'
                  : 'text-ink'
              ].join(' ')}>
                {d.getDate()}
              </div>
            </button>
          )
        })}
      </div>

      <div
        className="grid gap-0 flex-1 border border-t-0 border-border rounded-b-2xl overflow-hidden bg-[var(--dms-color-bg-surface)]/80"
        style={{ gridTemplateColumns: `60px repeat(${colCount}, minmax(0, 1fr))` }}
      >
        <div className="border-r border-border">
          {hours.map((h) => (
            <div
              key={h}
              className="h-[30px] border-b border-border/50 last:border-b-0 text-[10px] text-ink-muted text-right pr-2 pt-1"
            >
              {pad2(h)}:00
            </div>
          ))}
        </div>
        {days.map((d) => {
          const dayEvents = getEventsForDay(d)
          const allDayEvents = dayEvents.filter((e) => e.isAllDay || !new Date(e.startDateTime))
          const timedEvents = dayEvents.filter((e) => !e.isAllDay && !!new Date(e.startDateTime))
          return (
            <div key={d.toISOString() + '_col'} className="relative border-r border-border last:border-r-0">
              {allDayEvents.length > 0 && (
                <div className="absolute top-0 left-0 right-0 p-1 space-y-1 z-10 bg-[var(--dms-color-warning-soft)]/60 border-b border-border/60">
                  {allDayEvents.slice(0, 2).map((ev, i) => (
                    <CalendarEventBlock key={ev.id + '_' + i} event={ev} size="sm" onEventClick={onEventClick} onOpen={() => onSelectEvent && onSelectEvent(ev)} showTime={false} />
                  ))}
                </div>
              )}
              {hours.map((h) => {
                const hourEvents = timedEvents.filter((e) => new Date(e.startDateTime).getHours() === h)
                return (
                  <div
                    key={h}
                    className="h-[30px] border-b border-border/50 last:border-b-0 p-1 relative hover:bg-[var(--dms-color-info-soft)]/20 cursor-pointer transition-colors"
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelectDate && onSelectDate(new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, 0), e.currentTarget)
                    }}
                  >
                    {hourEvents.map((ev, i) => (
                      <div
                        key={ev.id + '_h_' + i}
                        className="mb-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <CalendarEventBlock event={ev} size="sm" onEventClick={onEventClick} onOpen={(openedEv) => onSelectEvent && onSelectEvent(openedEv)} />
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
