import React, { useMemo } from 'react'
import CalendarEventBlock from './CalendarEventBlock'
import {
  WEEKDAY_NAMES_LONG, MONTH_NAMES_SHORT, formatTime24,
  addDays, pad2, isSameDay, isToday, formatDDMMYYYY
} from '../../utils/calendarUtils'

const sortEventsByStart = (list) =>
  [...list].sort((a, b) => new Date(a.startDateTime) - new Date(b.startDateTime))

export default function AgendaView({
  cursor, events, onSelectEvent, onSelectDate, onEventClick
}) {
  const start = new Date(cursor)
  start.setHours(0, 0, 0, 0)
  const days = useMemo(() => {
    const arr = []
    for (let i = 0; i < 30; i++) arr.push(addDays(start, i))
    return arr
  }, [start])

  const eventsByDate = useMemo(() => {
    const map = new Map()
    for (const ev of events) {
      const d = new Date(ev.startDateTime)
      const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(ev)
    }
    for (const [k, v] of map) map.set(k, sortEventsByStart(v))
    return map
  }, [events])

  const getEventsForDay = (d) => {
    const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
    return eventsByDate.get(key) || []
  }

  const daysWithEvents = days.map((d) => ({ d, evs: getEventsForDay(d) }))
  const totalEvents = daysWithEvents.reduce((acc, r) => acc + r.evs.length, 0)

  return (
    <div className="flex flex-col h-full min-h-[70vh]">
      <div className="px-5 py-4 rounded-t-2xl border border-b-0 border-border bg-gradient-to-r from-white via-[var(--dms-color-info-soft)]/30 to-white flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--dms-color-info-ink)]">Agenda View</div>
          <div className="mt-1 text-lg font-semibold text-ink">
            Next 30 Days from {formatDDMMYYYY(start)}
          </div>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 bg-[var(--dms-color-info-soft)] text-[var(--dms-color-info-ink)] text-xs font-semibold">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--dms-color-info-ink)]" />
          {totalEvents} event{totalEvents === 1 ? '' : 's'}
        </div>
      </div>

      <div className="flex-1 border border-border rounded-b-2xl overflow-hidden bg-[var(--dms-color-bg-surface)]/80">
        <div className="divide-y divide-border/70 overflow-y-auto max-h-[75vh]">
          {daysWithEvents.map(({ d, evs }) => {
            const isTodayFlag = isToday(d)
            return (
              <div
                key={d.toISOString()}
                className="grid grid-cols-[90px_minmax(0,1fr)] hover:bg-[var(--dms-color-bg-surface-muted)]/60 transition-colors"
              >
                <button
                  type="button"
                  onClick={(e) => onSelectDate && onSelectDate(d, e.currentTarget)}
                  className={[
                    'p-3 text-left border-r border-border/60 transition-colors',
                    isTodayFlag ? 'bg-[var(--dms-color-info-soft)]/50' : ''
                  ].join(' ')}
                >
                  <div className={[
                    'text-[10px] font-semibold uppercase tracking-[0.22em]',
                    isTodayFlag ? 'text-[var(--dms-color-info-ink)]' : 'text-ink-muted'
                  ].join(' ')}>
                    {WEEKDAY_NAMES_LONG[d.getDay()]}
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <div className={[
                      'text-2xl font-semibold leading-none',
                      isTodayFlag ? 'text-[var(--dms-color-info-ink)]' : 'text-ink'
                    ].join(' ')}>
                      {d.getDate()}
                    </div>
                    <div className="text-xs text-ink-muted">{MONTH_NAMES_SHORT[d.getMonth()]}</div>
                  </div>
                </button>
                <div className="p-3">
                  {evs.length === 0 ? (
                    <button
                      type="button"
                      onClick={(e) => onSelectDate && onSelectDate(d, e.currentTarget)}
                      className="w-full text-left py-2 px-3 rounded-xl text-xs text-ink-muted hover:text-ink hover:bg-[var(--dms-color-bg-surface-muted)] transition-colors"
                    >
                      No events — click to add
                    </button>
                  ) : (
                    <div className="space-y-1.5">
                      {evs.map((ev, i) => (
                        <div key={ev.id + '_' + i} className="flex items-start gap-3">
                          <div className="min-w-[68px] pt-1 text-[10px] font-mono text-ink-muted text-right">
                            {ev.isAllDay ? 'ALL DAY' : formatTime24(ev.startDateTime)}
                          </div>
                          <div className="flex-1">
                            <CalendarEventBlock
                              event={ev}
                              onEventClick={onEventClick}
                              onOpen={(openedEv) => onSelectEvent && onSelectEvent(openedEv)}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
