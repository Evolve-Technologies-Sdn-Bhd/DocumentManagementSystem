import React, { useMemo } from 'react'
import CalendarEventBlock from './CalendarEventBlock'
import {
  WEEKDAY_NAMES_LONG, MONTH_NAMES_FULL, pad2, formatDayHeader, isToday, addDays
} from '../../utils/calendarUtils'

export default function DayView({
  cursor, events, workdayStart = 9, workdayEnd = 18,
  onSelectEvent, onSelectDate, onEventClick
}) {
  const day = new Date(cursor)
  day.setHours(0, 0, 0, 0)
  const nextDay = addDays(day, 1)

  const hours = useMemo(() => {
    const arr = []
    for (let h = workdayStart; h <= workdayEnd; h++) arr.push(h)
    return arr
  }, [workdayStart, workdayEnd])

  const dayEvents = useMemo(() => {
    return events.filter((e) => {
      const d = new Date(e.startDateTime)
      return (
        d.getFullYear() === day.getFullYear() &&
        d.getMonth() === day.getMonth() &&
        d.getDate() === day.getDate()
      )
    }).sort((a, b) => new Date(a.startDateTime) - new Date(b.startDateTime))
  }, [events, day])

  const allDayEvents = dayEvents.filter((e) => e.isAllDay || !e.startDateTime)
  const timedEvents = dayEvents.filter((e) => !e.isAllDay && !!e.startDateTime)

  const isTodayFlag = isToday(day)

  return (
    <div className="flex flex-col h-full min-h-[70vh]">
      <div className="px-5 py-4 rounded-t-2xl border border-b-0 border-[var(--dms-color-border-default)] bg-gradient-to-r from-[color-mix(in_srgb,var(--dms-color-info-soft)_70%,var(--dms-color-bg-surface))] via-[var(--dms-color-bg-surface)] to-[color-mix(in_srgb,var(--dms-color-bg-surface)_92%,var(--dms-color-bg-surface-strong))]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.20em] text-[var(--dms-color-info-ink)]">
              {WEEKDAY_NAMES_LONG[day.getDay()]}
            </div>
            <div className="mt-1 flex items-center gap-3">
              <div className={[
                'h-14 w-14 rounded-2xl flex items-center justify-center text-2xl font-bold ring-1',
                isTodayFlag
                  ? 'bg-[var(--dms-color-brand-primary)] text-white ring-[var(--dms-color-info-ink)]/30 shadow-[0_10px_20px_rgba(0,51,102,0.30)]'
                  : 'bg-[color-mix(in_srgb,var(--dms-color-bg-surface-strong)_80%,var(--dms-color-bg-surface-muted))] border border-[var(--dms-color-border-default)] text-ink ring-[var(--dms-color-border-strong)]/20 shadow-[0_4px_14px_rgba(15,23,42,0.10)]'
              ].join(' ')}>
                {day.getDate()}
              </div>
              <div>
                <div className="text-xl font-bold text-ink leading-tight">{MONTH_NAMES_FULL[day.getMonth()]} {day.getFullYear()}</div>
                <div className="text-sm text-ink-secondary mt-0.5 font-medium">{dayEvents.length} event{dayEvents.length === 1 ? '' : 's'} scheduled</div>
              </div>
            </div>
          </div>
          {allDayEvents.length > 0 && (
            <div className="w-full lg:w-auto space-y-1">
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-muted">All-Day</div>
                <div className="space-y-1 max-w-md">
                  {allDayEvents.map((ev, i) => (
                    <CalendarEventBlock key={ev.id + '_' + i} event={ev} onEventClick={onEventClick} onOpen={() => onSelectEvent && onSelectEvent(ev)} />
                  ))}
                </div>
              </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[60px_minmax(0,1fr)] flex-1 border border-border rounded-b-2xl overflow-hidden bg-[var(--dms-color-bg-surface)]/80">
        <div className="border-r border-border">
          {hours.map((h) => (
            <div
              key={h}
              className="h-[56px] border-b border-border/50 last:border-b-0 text-[11px] text-ink-muted text-right pr-2.5 pt-2.5 font-medium"
            >
              {pad2(h)}:00
            </div>
          ))}
        </div>
        <div>
          {hours.map((h) => {
            const hourEvents = timedEvents.filter((e) => new Date(e.startDateTime).getHours() === h)
            return (
              <div
                key={h}
                onClick={(e) => {
                  e.stopPropagation()
                  onSelectDate && onSelectDate(new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, 0), e.currentTarget)
                }}
                className="h-[56px] border-b border-border/50 last:border-b-0 p-2 hover:bg-[var(--dms-color-info-soft)]/25 cursor-pointer transition-colors"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5">
                  {hourEvents.map((ev, i) => (
                    <div key={ev.id + '_' + i} onClick={(e) => e.stopPropagation()}>
                      <CalendarEventBlock event={ev} onEventClick={onEventClick} onOpen={(openedEv) => onSelectEvent && onSelectEvent(openedEv)} />
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
