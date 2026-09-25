import React, { useMemo, useState } from 'react'
import CalendarEventBlock from './CalendarEventBlock'
import {
  WEEKDAY_NAMES_SHORT, getMonthGridDays, formatMonthHeader,
  isSameDay, isToday, pad2, getCategoryStyle
} from '../../utils/calendarUtils'

export default function MonthView({
  cursor, events, weekStartsOn = 1, hideWeekends = false,
  onSelectEvent, onSelectDate, onEventClick
}) {
  const days = useMemo(() => getMonthGridDays(cursor, weekStartsOn), [cursor, weekStartsOn])
  const today = new Date()
  const currentMonth = cursor.getMonth()
  const currentYear = cursor.getFullYear()

  const visibleDays = useMemo(() => {
    if (!hideWeekends) return days
    return days.filter((d) => {
      const wd = d.getDay()
      return wd !== 0 && wd !== 6
    })
  }, [days, hideWeekends])

  const weekdays = useMemo(() => {
    const order = []
    for (let i = 0; i < 7; i++) {
      order.push((weekStartsOn + i) % 7)
    }
    let wk = order.map((i) => WEEKDAY_NAMES_SHORT[i])
    if (hideWeekends) wk = wk.filter((_, idx) => {
      const orig = order[idx]
      return orig !== 0 && orig !== 6
    })
    return wk
  }, [weekStartsOn, hideWeekends])

  const cols = weekdays.length

  const eventsByDate = useMemo(() => {
    const map = new Map()
    for (const ev of events) {
      const key = `${new Date(ev.startDateTime).getFullYear()}-${pad2(new Date(ev.startDateTime).getMonth() + 1)}-${pad2(new Date(ev.startDateTime).getDate())}`
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(ev)
    }
    return map
  }, [events])

  const getEventsForDay = (d) => {
    const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
    return eventsByDate.get(key) || []
  }

  const columnsPerRow = cols

  const outOfMonthBg =
    'bg-gradient-to-br from-[color-mix(in_srgb,var(--dms-color-bg-surface-muted)_75%,var(--dms-color-border-strong)_25%)] via-[color-mix(in_srgb,var(--dms-color-bg-surface-muted)_60%,var(--dms-color-border-strong)_40%)] to-[color-mix(in_srgb,var(--dms-color-bg-surface-muted)_70%,var(--dms-color-border-strong)_30%)]'
  const outOfMonthHover =
    'hover:from-[color-mix(in_srgb,var(--dms-color-bg-surface-muted)_65%,var(--dms-color-border-strong)_35%)] hover:via-[color-mix(in_srgb,var(--dms-color-bg-surface-muted)_50%,var(--dms-color-border-strong)_50%)] hover:to-[color-mix(in_srgb,var(--dms-color-bg-surface-muted)_60%,var(--dms-color-border-strong)_40%)]'
  const outOfMonthText = 'text-ink-muted group-hover:text-ink-secondary'
  const outOfMonthMore =
    'text-ink-muted/90 bg-[color-mix(in_srgb,var(--dms-color-bg-surface-strong)_85%,var(--dms-color-border-strong)_15%)]/90 border-[var(--dms-color-border-default)]/80'
  const todayGradient =
    'bg-gradient-to-br from-[color-mix(in_srgb,var(--dms-color-info-soft)_70%,var(--dms-color-brand-primary)_10%)] via-[var(--dms-color-info-soft)]/45 to-[color-mix(in_srgb,var(--dms-color-info-soft)_35%,var(--dms-color-bg-surface))]'

  return (
    <div className="flex flex-col h-full">
      <div
        className="grid gap-0 mb-0.5"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {weekdays.map((w, i) => (
          <div
            key={w + '_' + i}
            className="px-2 py-1.5 text-[11px] sm:text-xs font-bold uppercase tracking-[0.14em] text-ink text-center border-b-2 border-[var(--dms-color-border-default)]"
          >
            {w}
          </div>
        ))}
      </div>

      <div
        className="grid gap-0 grid-flow-row border-2 border-[var(--dms-color-border-default)] rounded-xl overflow-hidden bg-[var(--dms-color-bg-surface-muted)]/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {visibleDays.map((d, idx) => {
          const inMonth = d.getMonth() === currentMonth && d.getFullYear() === currentYear
          const dayEvents = getEventsForDay(d)
          const isTodayFlag = isToday(d)
          return (
            <button
              type="button"
              key={d.toISOString() + '_' + idx}
              onClick={(e) => onSelectDate && onSelectDate(d, e.currentTarget)}
              className={[
                'group relative h-[30px] border-b border-r border-[var(--dms-color-border-default)] text-left p-1 transition-all duration-200 overflow-hidden',
                inMonth
                  ? 'bg-[var(--dms-color-bg-surface)]'
                  : outOfMonthBg,
                (idx + 1) % columnsPerRow === 0 ? 'border-r-0' : '',
                idx >= visibleDays.length - columnsPerRow ? 'border-b-0' : '',
                isTodayFlag
                  ? `${todayGradient} ring-[2.5px] ring-inset ring-[var(--dms-color-brand-primary)] shadow-[inset_0_0_0_1px_rgba(0,51,102,0.12),0_0_0_1px_color-mix(in_srgb,var(--dms-color-brand-primary)_40%,transparent)] z-10`
                  : inMonth
                    ? 'hover:bg-[var(--dms-color-info-soft)]/25 hover:shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)]'
                    : outOfMonthHover
              ].filter(Boolean).join(' ')}
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className={[
                  'inline-flex items-center justify-center text-[11px] sm:text-xs font-bold rounded-full h-[20px] w-[20px] shrink-0 transition-all',
                  isTodayFlag
                    ? 'bg-[var(--dms-color-brand-primary)] text-white shadow-[0_4px_12px_rgba(0,51,102,0.32)] ring-2 ring-[color:color-mix(in_srgb,var(--dms-color-brand-primary)_40%,white)]'
                    : inMonth
                      ? 'text-ink hover:bg-black/5 dark:hover:bg-white/5'
                      : `${outOfMonthText} opacity-95 group-hover:opacity-100`
                ].join(' ')}>
                  {d.getDate()}
                </span>
                {dayEvents.length > 2 && (
                  <span className={[
                    'text-[10px] font-bold px-1.5 py-0.5 rounded-full border shadow-md leading-none',
                    inMonth
                      ? 'text-ink bg-[var(--dms-color-bg-surface-strong)]/90 border-[var(--dms-color-border-default)]'
                      : outOfMonthMore
                  ].join(' ')}>
                    +{dayEvents.length - 2}
                  </span>
                )}
              </div>
              <div className={['space-y-0.5 min-h-0', !inMonth ? 'opacity-40 grayscale-[60%]' : ''].join(' ')}>
                {dayEvents.slice(0, 2).map((ev, evi) => (
                  <CalendarEventBlock
                    key={ev.id + '_' + evi}
                    event={ev}
                    size="xs"
                    onEventClick={onEventClick}
                    onOpen={(openedEvent) => onSelectEvent && onSelectEvent(openedEvent)}
                    showTime={false}
                  />
                ))}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
