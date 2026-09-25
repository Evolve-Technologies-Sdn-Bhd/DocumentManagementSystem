import React, { useEffect, useMemo, useRef } from 'react'
import * as ReactDOM from 'react-dom'
import Button from '../ui/Button'
import {
  formatDayHeader, formatDDMMYYYY, getCategoryStyle, isSameDay
} from '../../utils/calendarUtils'
import CalendarEventBlock from './CalendarEventBlock'

function DayActivityPopover({
  date,
  events,
  anchorEl,
  onClose,
  onAddEvent,
  onSelectEvent,
  onEventClick
}) {
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (!ref.current) return
      if (ref.current.contains(e.target)) return
      if (anchorEl && anchorEl.contains(e.target)) return
      onClose && onClose()
    }
    setTimeout(() => {
      document.addEventListener('mousedown', handler)
    }, 0)
    return () => document.removeEventListener('mousedown', handler)
  }, [anchorEl, onClose])

  const dayEvents = useMemo(() => {
    if (!Array.isArray(events) || !date) return []
    return events.filter((e) => isSameDay(e.startDateTime, date)).sort((a, b) => {
      const ad = new Date(a.startDateTime).getTime()
      const bd = new Date(b.startDateTime).getTime()
      return ad - bd
    })
  }, [events, date])

  if (!date) return null

  const PlusIcon = (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
    </svg>
  )
  const CalendarIcon = (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )

  return (
    <div className="fixed inset-0 z-[100]">
      <div
        className="absolute inset-0 bg-overlay"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose && onClose()
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-6 pointer-events-none">
        <div
          ref={ref}
          className="pointer-events-auto w-full max-w-2xl max-h-[75vh] flex flex-col"
        >
          <div className="rounded-[20px] border-2 border-[var(--dms-color-border-default)] bg-[var(--dms-color-bg-surface)] shadow-[0_24px_60px_rgba(15,23,42,0.35)] ring-1 ring-black/10 overflow-hidden animate-[popoverIn_0.18s_ease-out] flex flex-col h-full">
            <div className="px-5 sm:px-6 py-3.5 flex items-start justify-between gap-3 bg-gradient-to-br from-[color-mix(in_srgb,var(--dms-color-bg-surface-muted)_80%,var(--dms-color-bg-surface))] via-[var(--dms-color-bg-surface)] to-[color-mix(in_srgb,var(--dms-color-info-soft)_40%,var(--dms-color-bg-surface))] border-b-2 border-[var(--dms-color-border-default)]">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-8 w-8 rounded-xl flex items-center justify-center bg-[var(--dms-color-brand-primary)] text-white shadow-[0_6px_14px_rgba(0,51,102,0.28)] ring-1 ring-white/10">
                    <CalendarIcon className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--dms-color-brand-primary)]">
                    Daily Activity
                  </span>
                </div>
                <h3 className="text-[17px] font-bold leading-tight line-clamp-1 text-ink">
                  {formatDayHeader(date)}
                </h3>
                <div className="text-[12px] text-ink-secondary mt-0.5 font-medium">
                  {formatDDMMYYYY(date)} · <span className="font-bold text-ink">{dayEvents.length}</span> {dayEvents.length === 1 ? 'event' : 'events'} scheduled
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-xl p-2 text-ink-secondary hover:bg-[var(--dms-color-bg-surface-muted)] hover:text-ink transition-all"
                aria-label="Close"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-5 sm:px-6 py-5 flex-1 min-h-0">
              {dayEvents.length === 0 ? (
                <div className="py-10 sm:py-12 text-center rounded-[18px] bg-gradient-to-br from-[color-mix(in_srgb,var(--dms-color-bg-surface-muted)_80%,var(--dms-color-bg-surface))] to-[color-mix(in_srgb,var(--dms-color-success-soft)_30%,var(--dms-color-bg-surface))] border-2 border-dashed border-[var(--dms-color-border-default)]">
                  <div className="mx-auto mb-4 h-16 w-16 rounded-2xl flex items-center justify-center bg-[color-mix(in_srgb,var(--dms-color-success-soft)_70%,var(--dms-color-bg-surface-strong))] text-[var(--dms-color-success-ink)] shadow-[0_8px_20px_rgba(16,185,129,0.20)] ring-1 ring-[var(--dms-color-success-ink)]/15">
                    <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.20em] text-[var(--dms-color-success-ink)] mb-1.5">
                    All clear
                  </div>
                  <div className="text-sm text-ink-secondary leading-relaxed max-w-sm mx-auto font-medium">
                    No events scheduled for this day. Tap below to add your first activity.
                  </div>
                </div>
              ) : (
                <div className="space-y-3 overflow-y-auto dms-scrollbar pr-2 h-full">
                  {dayEvents.map((ev) => (
                    <div
                      key={String(ev.id)}
                      className="rounded-[18px] border-2 border-[var(--dms-color-border-default)] bg-[color-mix(in_srgb,var(--dms-color-bg-surface)_98%,var(--dms-color-bg-surface-muted))] hover:bg-[var(--dms-color-bg-surface-muted)]/70 hover:border-[var(--dms-color-brand-primary)]/35 hover:shadow-[0_8px_20px_rgba(15,23,42,0.10)] transition-all p-3"
                    >
                      <CalendarEventBlock
                        event={ev}
                        size="md"
                        onEventClick={onEventClick}
                        onOpen={(openedEvent) => {
                          const btn = ref.current?.querySelector(`[data-event-id="${String(openedEvent.id)}"]`)
                          onSelectEvent && onSelectEvent(openedEvent, btn || ref.current)
                        }}
                        showTime={!ev.isAllDay}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-5 sm:px-6 py-3.5 border-t-2 border-[var(--dms-color-border-default)] bg-gradient-to-r from-[color-mix(in_srgb,var(--dms-color-bg-surface-muted)_70%,var(--dms-color-bg-surface))] via-[var(--dms-color-bg-surface)] to-[color-mix(in_srgb,var(--dms-color-info-soft)_35%,var(--dms-color-bg-surface))] flex items-center justify-between gap-3">
              <div className="text-[12px] text-ink-secondary leading-relaxed font-medium">
                {dayEvents.length === 0 ? 'Ready to plan your day?' : 'Need to schedule something else?'}
              </div>
              <Button
                size="md"
                onClick={() => onAddEvent && onAddEvent(date)}
                className="shadow-[0_8px_20px_rgba(0,51,102,0.20)]"
              >
                <PlusIcon className="h-4 w-4" /> Add Event
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function DayActivityPopoverWrapper(props) {
  const inner = <DayActivityPopover {...props} />
  if (typeof document === 'undefined' || !ReactDOM?.createPortal || !document.body) return inner
  return ReactDOM.createPortal(inner, document.body)
}

export default DayActivityPopoverWrapper
