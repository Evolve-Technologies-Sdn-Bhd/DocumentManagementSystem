import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePreferences } from '../contexts/PreferencesContext'
import { hasPermission } from '../utils/permissions'
import useCalendar from '../hooks/useCalendar'
import PageHeader from './ui/PageHeader'
import Button from './ui/Button'
import TextInput from './ui/TextInput'
import SelectField from './ui/SelectField'
import AppSurface from './ui/AppSurface'
import InlineSpinner from './ui/InlineSpinner'
import EmptyPanelState from './ui/EmptyPanelState'
import MonthView from './calendar/MonthView'
import WeekView from './calendar/WeekView'
import DayView from './calendar/DayView'
import AgendaView from './calendar/AgendaView'
import EventPopover from './calendar/EventPopover'
import DayActivityPopover from './calendar/DayActivityPopover'
import CustomEventModal from './calendar/CustomEventModal'
import EventDetailsModal from './calendar/EventDetailsModal'
import ReminderModal from './calendar/ReminderModal'
import {
  formatMonthHeader, formatWeekHeader, formatDayHeader, addDays, MONTH_NAMES_SHORT, getCategoryStyle
} from '../utils/calendarUtils'

const SCOPE_OPTIONS = [
  { value: 'ALL', label: 'All Events', short: 'All' },
  { value: 'MY', label: 'My Calendar', short: 'My' },
  { value: 'SYSTEM', label: 'System Calendar', short: 'System' }
]

const VIEW_OPTIONS = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'day', label: 'Day' },
  { value: 'agenda', label: 'Agenda' }
]

const ChevronLeft = (p) => (
  <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
  </svg>
)
const ChevronRight = (p) => (
  <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
)
const PlusIcon = (p) => (
  <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
  </svg>
)
const FilterIcon = (p) => (
  <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M6 12h12M10 20h4" />
  </svg>
)
const RefreshIcon = (p) => (
  <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
  </svg>
)

export default function CalendarPage() {
  const navigate = useNavigate()
  const { t } = usePreferences()
  const cal = useCalendar()
  const {
    view, events, filteredEvents, loading, error, sources, categoryMeta, filters, setFilters,
    scopeFilter, setScopeFilter,
    cursor, range,
    navigate: navDir, goToday, setView,
    createEvent, updateEvent, deleteEvent, addReminder, savePreferences, loadEvents,
    prefs
  } = cal

  const [popover, setPopover] = useState({ open: false, event: null, anchor: null })
  const [dayPopover, setDayPopover] = useState({ open: false, date: null, anchor: null })
  const [customModal, setCustomModal] = useState({ open: false, existing: null, initialDate: null, saving: false, deleting: false })
  const [eventDetailsModal, setEventDetailsModal] = useState({ open: false, event: null })
  const [reminderModal, setReminderModal] = useState({ open: false, event: null, saving: false })
  const [showFilters, setShowFilters] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(t)
  }, [toast])

  const headerTitle = useMemo(() => {
    switch (view) {
      case 'week': return formatWeekHeader(cursor, prefs.weekStartsOn)
      case 'day': return formatDayHeader(cursor)
      case 'agenda': return `30-Day Agenda — ${MONTH_NAMES_SHORT[cursor.getMonth()]} ${cursor.getFullYear()}`
      case 'month':
      default: return formatMonthHeader(cursor)
    }
  }, [view, cursor, prefs.weekStartsOn])

  const handleSelectEvent = (ev, anchorEl = null) => {
    setDayPopover({ open: false, date: null, anchor: null })
    setPopover({ open: false, event: null, anchor: null })
    setEventDetailsModal({ open: true, event: ev })
  }

  const handleEventClick = (ev, anchorEl = null) => {
    setDayPopover({ open: false, date: null, anchor: null })
    setPopover({ open: false, event: null, anchor: null })
    setEventDetailsModal({ open: true, event: ev })
  }

  const handleViewFullDetails = (ev) => {
    setEventDetailsModal({ open: true, event: ev })
  }

  const handleSelectDate = (d, anchorEl = null) => {
    setPopover({ open: false, event: null, anchor: null })
    setDayPopover({ open: true, date: d, anchor: anchorEl })
  }

  const handleAddEventFromDayPopover = (d) => {
    setDayPopover({ open: false, date: null, anchor: null })
    setCustomModal({ open: true, existing: null, initialDate: d, saving: false, deleting: false })
  }

  const handleEditFromDetails = (ev) => {
    setEventDetailsModal({ open: false, event: null })
    setCustomModal({ open: true, existing: ev, initialDate: new Date(ev.startDateTime), saving: false, deleting: false })
  }

  const handleDeleteFromDetails = async (ev) => {
    await handleDeleteSubmit(ev)
    setEventDetailsModal({ open: false, event: null })
  }

  const handleCreateSubmit = async (payload) => {
    setCustomModal((p) => ({ ...p, saving: true }))
    try {
      if (customModal.existing) {
        await updateEvent(customModal.existing.id, payload)
        setToast({ type: 'success', msg: 'Event updated' })
      } else {
        await createEvent(payload)
        setToast({ type: 'success', msg: 'Event created' })
      }
      setCustomModal({ open: false, existing: null, initialDate: null, saving: false, deleting: false })
    } catch (e) {
      setToast({ type: 'error', msg: e?.response?.data?.message || 'Failed to save' })
      setCustomModal((p) => ({ ...p, saving: false }))
    }
  }

  const handleDeleteSubmit = async (existing) => {
    setCustomModal((p) => ({ ...p, deleting: true }))
    try {
      await deleteEvent(existing.id)
      setToast({ type: 'success', msg: 'Event deleted' })
      setPopover({ open: false, event: null, anchor: null })
      setCustomModal({ open: false, existing: null, initialDate: null, saving: false, deleting: false })
    } catch (e) {
      setToast({ type: 'error', msg: e?.response?.data?.message || 'Failed to delete' })
      setCustomModal((p) => ({ ...p, deleting: false }))
    }
  }

  const handleReminderSubmit = async (payload) => {
    setReminderModal((p) => ({ ...p, saving: true }))
    try {
      await addReminder(reminderModal.event.id, payload)
      setToast({ type: 'success', msg: 'Reminder set' })
      setReminderModal({ open: false, event: null, saving: false })
    } catch (e) {
      setToast({ type: 'error', msg: e?.response?.data?.message || 'Failed to set reminder' })
      setReminderModal((p) => ({ ...p, saving: false }))
    }
  }

  const sourceLabels = useMemo(() => (sources || []).map((s) => ({ value: s.source, label: s.label })), [sources])
  const categoryOptions = useMemo(() => {
    if (!categoryMeta || typeof categoryMeta !== 'object') return []
    return Object.keys(categoryMeta).map((k) => ({ value: k, label: categoryMeta[k]?.label || k }))
  }, [categoryMeta])

  const toggleFilter = (key, value) => {
    setFilters((p) => {
      const list = Array.isArray(p[key]) ? [...p[key]] : []
      const idx = list.indexOf(value)
      if (idx >= 0) list.splice(idx, 1)
      else list.push(value)
      return { ...p, [key]: list }
    })
  }

  const canCreate = hasPermission('calendar', 'create') || hasPermission('calendar', 'edit')

  const renderView = () => {
    switch (view) {
      case 'week':
        return (
          <WeekView
            cursor={cursor}
            events={filteredEvents}
            weekStartsOn={prefs.weekStartsOn}
            hideWeekends={prefs.hideWeekends}
            workdayStart={prefs.workdayStart}
            workdayEnd={prefs.workdayEnd}
            onSelectEvent={(ev, el) => handleSelectEvent(ev, el)}
            onEventClick={handleEventClick}
            onSelectDate={handleSelectDate}
          />
        )
      case 'day':
        return (
          <DayView
            cursor={cursor}
            events={filteredEvents}
            workdayStart={prefs.workdayStart}
            workdayEnd={prefs.workdayEnd}
            onSelectEvent={(ev) => handleSelectEvent(ev)}
            onEventClick={handleEventClick}
            onSelectDate={handleSelectDate}
          />
        )
      case 'agenda':
        return (
          <AgendaView
            cursor={cursor}
            events={filteredEvents}
            onSelectEvent={handleSelectEvent}
            onEventClick={handleEventClick}
            onSelectDate={handleSelectDate}
          />
        )
      case 'month':
      default:
        return (
          <MonthView
            cursor={cursor}
            events={filteredEvents}
            weekStartsOn={prefs.weekStartsOn}
            hideWeekends={prefs.hideWeekends}
            onSelectEvent={handleSelectEvent}
            onEventClick={handleEventClick}
            onSelectDate={handleSelectDate}
          />
        )
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Calendar"
        subtitle="Track document deadlines, project milestones, follow-ups and personal events."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowFilters((p) => !p)}>
              <FilterIcon className="h-4 w-4" /> Filters
            </Button>
            <Button variant="secondary" size="sm" onClick={() => loadEvents()}>
              <RefreshIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            {canCreate && (
              <Button
                size="sm"
                onClick={() => setCustomModal({ open: true, existing: null, initialDate: new Date(), saving: false, deleting: false })}
              >
                <PlusIcon className="h-4 w-4" /> New Event
              </Button>
            )}
          </div>
        }
      />

      {showFilters && (
        <AppSurface variant="panel" padding="md" className="rounded-[24px] space-y-4 border border-border shadow-[0_14px_36px_rgba(15,23,42,0.06)]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-2">Search</div>
              <TextInput
                value={filters.search}
                onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
                placeholder="Search event titles or descriptions..."
              />
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-2">Hide Weekends</div>
              <label className="inline-flex items-center gap-2 text-sm text-ink-secondary select-none mt-1">
                <input
                  type="checkbox"
                  checked={!!prefs.hideWeekends}
                  onChange={(e) => savePreferences({ hideWeekends: e.target.checked })}
                  className="rounded border-gray-300 text-[var(--dms-primary)] focus:ring-[var(--dms-primary)]/30"
                />
                Hide Saturday and Sunday
              </label>
            </div>
          </div>

          {categoryOptions.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-2">Categories</div>
              <div className="flex flex-wrap gap-2">
                {categoryOptions.map((o) => {
                  const style = getCategoryStyle(o.value)
                  const active = filters.categories.includes(o.value)
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => toggleFilter('categories', o.value)}
                      className={[
                        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors border',
                        active
                          ? [style.bg, style.ink, style.ring].join(' ')
                          : 'bg-[var(--dms-color-bg-surface-muted)] text-ink-muted border-border hover:text-ink'
                      ].join(' ')}
                    >
                      <span className={['h-1.5 w-1.5 rounded-full', style.dot].join(' ')} />
                      {o.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {sourceLabels.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-2">Sources</div>
              <div className="flex flex-wrap gap-1.5">
                {sourceLabels.map((o) => {
                  const active = filters.sources.includes(o.value)
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => toggleFilter('sources', o.value)}
                      className={[
                        'inline-flex items-center rounded-lg px-2.5 py-1 text-[11px] font-medium border transition-colors',
                        active
                          ? 'bg-[var(--dms-color-brand-primary)] text-white border-transparent shadow-sm'
                          : 'bg-[var(--dms-color-bg-surface-muted)] text-ink-secondary border-border hover:text-ink hover:bg-[var(--dms-color-bg-surface)]'
                      ].join(' ')}
                    >
                      {o.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </AppSurface>
      )}

      <AppSurface variant="panel" padding="none" className="rounded-[24px] overflow-hidden shadow-[0_14px_36px_rgba(15,23,42,0.10)] border border-[var(--dms-color-border-default)]">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b border-[var(--dms-color-border-default)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--dms-color-bg-surface-muted)_60%,var(--dms-color-bg-surface))_0%,var(--dms-color-bg-surface-muted)_100%)]">
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center rounded-lg border border-[var(--dms-color-border-default)] bg-[var(--dms-color-bg-surface)] shadow-[0_2px_8px_rgba(15,23,42,0.08)]">
              <button
                type="button"
                onClick={() => navDir(-1)}
                className="p-1.5 rounded-l-lg hover:bg-[var(--dms-color-bg-surface-muted)] transition-colors text-ink-secondary hover:text-ink"
                aria-label="Previous"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={goToday}
                className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider border-x border-[var(--dms-color-border-default)] text-[var(--dms-color-brand-primary)] hover:bg-[var(--dms-color-info-soft)]/45 transition-colors"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => navDir(1)}
                className="p-1.5 rounded-r-lg hover:bg-[var(--dms-color-bg-surface-muted)] transition-colors text-ink-secondary hover:text-ink"
                aria-label="Next"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <h2 className="text-base font-semibold text-ink ml-1">{headerTitle}</h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center p-0.5 rounded-lg bg-[var(--dms-color-bg-surface-muted)] border border-[var(--dms-color-border-default)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              {SCOPE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setScopeFilter(o.value)}
                  title={o.label}
                  className={[
                    'px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-md transition-all',
                    scopeFilter === o.value
                      ? (o.value === 'MY'
                          ? 'bg-[color-mix(in_srgb,var(--dms-color-category-custom-soft,#ddd6fe)_55%,var(--dms-color-bg-surface-strong))] text-[color:var(--dms-color-category-custom-ink,#6d28d9)] shadow-[0_1px_6px_rgba(15,23,42,0.14)] ring-1 ring-[color:var(--dms-color-category-custom-ink,#6d28d9)]/20'
                          : o.value === 'SYSTEM'
                          ? 'bg-[color-mix(in_srgb,var(--dms-color-info-soft)_55%,var(--dms-color-bg-surface-strong))] text-[var(--dms-color-brand-primary)] shadow-[0_1px_6px_rgba(15,23,42,0.14)] ring-1 ring-[var(--dms-color-brand-primary)]/20'
                          : 'bg-[var(--dms-color-bg-surface-strong)] text-ink shadow-[0_1px_6px_rgba(15,23,42,0.12)] ring-1 ring-[var(--dms-color-border-strong)]/25')
                      : 'text-ink-secondary hover:text-ink'
                  ].join(' ')}
                >
                  {o.short}
                </button>
              ))}
            </div>

            <div className="inline-flex items-center p-0.5 rounded-lg bg-[var(--dms-color-bg-surface-muted)] border border-[var(--dms-color-border-default)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              {VIEW_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setView(o.value)}
                  className={[
                    'px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-md transition-all',
                    view === o.value
                      ? 'bg-[color-mix(in_srgb,var(--dms-color-info-soft)_55%,var(--dms-color-bg-surface-strong))] text-[var(--dms-color-brand-primary)] shadow-[0_1px_6px_rgba(15,23,42,0.14)] ring-1 ring-[var(--dms-color-brand-primary)]/20'
                      : 'text-ink-secondary hover:text-ink'
                  ].join(' ')}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-2 sm:p-3">
          {loading && events.length === 0 ? (
            <div className="min-h-[30vh] flex items-center justify-center">
              <InlineSpinner className="h-8 w-8 border-[var(--dms-color-brand-primary)]/30 border-t-[var(--dms-color-brand-primary)]" />
            </div>
          ) : error ? (
            <EmptyPanelState
              iconType="error"
              title="Could not load calendar events"
              description={error}
              action={{
                label: 'Retry',
                onClick: () => loadEvents()
              }}
            />
          ) : (
            renderView()
          )}
        </div>
      </AppSurface>

      {popover.open && popover.event && (
        <EventPopover
          event={popover.event}
          anchorEl={popover.anchor}
          onClose={() => setPopover({ open: false, event: null, anchor: null })}
          onViewDetails={handleViewFullDetails}
          onEdit={(ev) => {
            setPopover({ open: false, event: null, anchor: null })
            setCustomModal({ open: true, existing: ev, initialDate: null, saving: false, deleting: false })
          }}
          onDelete={(ev) => handleDeleteSubmit(ev)}
          onAddReminder={(ev) => {
            setPopover({ open: false, event: null, anchor: null })
            setReminderModal({ open: true, event: ev, saving: false })
          }}
        />
      )}

      {dayPopover.open && dayPopover.date && (
        <DayActivityPopover
          date={dayPopover.date}
          events={filteredEvents}
          anchorEl={dayPopover.anchor}
          onClose={() => setDayPopover({ open: false, date: null, anchor: null })}
          onAddEvent={(d) => handleAddEventFromDayPopover(d)}
          onEventClick={handleEventClick}
          onSelectEvent={(ev, anchor) => handleSelectEvent(ev, anchor)}
        />
      )}

      <CustomEventModal
        open={customModal.open}
        onClose={() => setCustomModal((p) => ({ ...p, open: false }))}
        onSubmit={handleCreateSubmit}
        onDelete={handleDeleteSubmit}
        existing={customModal.existing}
        initialDate={customModal.initialDate}
        saving={customModal.saving}
        deleting={customModal.deleting}
      />

      {eventDetailsModal.open && eventDetailsModal.event && (
        <EventDetailsModal
          event={eventDetailsModal.event}
          onClose={() => setEventDetailsModal({ open: false, event: null })}
          onEdit={handleEditFromDetails}
          onDelete={handleDeleteFromDetails}
          deleting={customModal.deleting}
        />
      )}

      <ReminderModal
        open={reminderModal.open}
        onClose={() => setReminderModal({ open: false, event: null, saving: false })}
        onSubmit={handleReminderSubmit}
        event={reminderModal.event}
        saving={reminderModal.saving}
      />

      {toast && (
        <div className="fixed bottom-5 right-5 z-[110]">
          <div className={[
            'rounded-2xl px-4 py-3 text-sm font-medium shadow-[0_14px_36px_rgba(15,23,42,0.18)] ring-1 ring-black/5',
            toast.type === 'success'
              ? 'bg-[var(--dms-color-success-soft)] text-[var(--dms-color-success-ink)]'
              : 'bg-[var(--dms-color-danger-soft)] text-[var(--dms-color-danger-ink)]'
          ].join(' ')}>
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  )
}
