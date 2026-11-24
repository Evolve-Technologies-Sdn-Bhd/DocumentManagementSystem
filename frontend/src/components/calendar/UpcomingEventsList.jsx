import React, { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  WEEKDAY_NAMES_SHORT, MONTH_NAMES_SHORT, formatTime24,
  isSameDay, isToday, pad2, addDays, getCategoryStyle
} from '../../utils/calendarUtils'

const timeAgoUntil = (d) => {
  const now = new Date()
  const dt = new Date(d)
  const diffMs = dt.getTime() - now.getTime()
  const absMs = Math.abs(diffMs)
  const dayMs = 24 * 3600 * 1000
  const isPast = diffMs < 0
  const days = Math.round(absMs / dayMs)
  if (days >= 30) return `${Math.round(days / 30)}m ${isPast ? 'ago' : 'left'}`
  if (days >= 1) return `${days}d ${isPast ? 'ago' : 'left'}`
  const hrs = Math.round(absMs / 3600000)
  if (hrs >= 1) return `${hrs}h ${isPast ? 'ago' : 'left'}`
  const mins = Math.max(1, Math.round(absMs / 60000))
  return `${mins}m ${isPast ? 'ago' : 'left'}`
}

export default function UpcomingEventsList({
  events = [], days = 7, title = 'Upcoming',
  showHeader = true, maxItems = 8
}) {
  const navigate = useNavigate()
  const cutoff = addDays(new Date(), Math.max(1, days))
  cutoff.setHours(23, 59, 59, 999)

  const filtered = useMemo(() => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    return events
      .filter((ev) => {
        const s = new Date(ev.startDateTime)
        return s <= cutoff
      })
      .sort((a, b) => new Date(a.startDateTime) - new Date(b.startDateTime))
      .slice(0, maxItems)
  }, [events, cutoff, maxItems])

  const handleClick = (ev) => {
    if (ev.deepLink) {
      navigate(ev.deepLink)
      return
    }
    const d = new Date(ev.startDateTime)
    const iso = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
    navigate(`/calendar?view=day&date=${iso}`)
  }

  const grouped = useMemo(() => {
    const map = new Map()
    for (const ev of filtered) {
      const d = new Date(ev.startDateTime)
      const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
      if (!map.has(key)) map.set(key, { date: new Date(d.getFullYear(), d.getMonth(), d.getDate()), items: [] })
      map.get(key).items.push(ev)
    }
    return Array.from(map.values())
  }, [filtered])

  return (
    <div className="space-y-3 w-full">
      {showHeader && (
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--dms-color-brand-primary)]">
              {title}
            </div>
            <div className="text-xs text-ink-muted mt-0.5">
              Next {days} days · {filtered.length} event{filtered.length === 1 ? '' : 's'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/calendar')}
            className="text-[11px] font-semibold text-[var(--dms-color-brand-primary)] hover:underline"
          >
            View all →
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/80 bg-[var(--dms-color-bg-surface-muted)]/40 px-4 py-5 text-center">
          <div className="text-xs font-semibold text-ink-secondary">All clear</div>
          <div className="text-[11px] text-ink-muted mt-1">No upcoming events within {days} days.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(({ date, items }) => {
            const isTodayFlag = isToday(date)
            return (
              <div key={date.toISOString()} className="space-y-1.5">
                <div className="flex items-center gap-2 px-0.5">
                  <div className={[
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold',
                    isTodayFlag
                      ? 'bg-[var(--dms-color-brand-primary)] text-white shadow-[0_4px_10px_rgba(0,51,102,0.22)]'
                      : 'bg-[var(--dms-color-bg-surface-muted)] text-ink-muted'
                  ].join(' ')}>
                    {WEEKDAY_NAMES_SHORT[date.getDay()]} · {MONTH_NAMES_SHORT[date.getMonth()]} {date.getDate()}
                    {isTodayFlag ? ' · Today' : ''}
                  </div>
                  <div className="flex-1 h-px bg-border/60" />
                </div>
                <div className="space-y-1.5 pl-1">
                  {items.map((ev, i) => {
                    const style = getCategoryStyle(ev.category)
                    return (
                      <button
                        key={ev.id + '_' + i}
                        type="button"
                        onClick={() => handleClick(ev)}
                        className={[
                          'w-full text-left rounded-xl border border-transparent px-3 py-2 hover:shadow-[0_4px_14px_rgba(15,23,42,0.08)] hover:-translate-y-0.5 transition-all',
                          style.bg, style.ring
                        ].join(' ')}
                      >
                        <div className="flex items-start gap-2 min-w-0">
                          <span className={['mt-1.5 h-2 w-2 rounded-full shrink-0', style.dot].join(' ')} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className={`text-[12px] font-semibold leading-tight line-clamp-2 ${style.ink}`}>
                                {ev.title || 'Untitled'}
                              </div>
                              <span className="shrink-0 text-[10px] text-ink-muted font-medium">
                                {timeAgoUntil(ev.startDateTime)}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-[10px] text-ink-muted">
                              {!ev.isAllDay && <span>{formatTime24(ev.startDateTime)}</span>}
                              {ev.isAllDay && <span>All day</span>}
                              {ev.assignee && (
                                <>
                                  <span className="opacity-40">·</span>
                                  <span className="truncate">
                                    {[ev.assignee.firstName, ev.assignee.lastName].filter(Boolean).join(' ') || ev.assignee.email}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
