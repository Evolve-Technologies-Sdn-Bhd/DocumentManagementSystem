import React, { useMemo } from 'react'
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal'
import Button from '../ui/Button'
import {
  formatDDMMYYYY, formatTime24, formatDateTime, getCategoryStyle,
  CATEGORY_FIELD_CONFIG, getReminderLabel, getRecurrenceLabel, formatOptionValue
} from '../../utils/calendarUtils'

const isSynthetic = (ev) => Boolean(ev?.isSynthetic) || String(ev?.id ?? '').startsWith('syn_')

const getNameLabel = (u) => {
  if (!u) return null
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || null
}

const Icon = ({ d, className = 'h-4 w-4', ...rest }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...rest}
  >
    <path d={d} />
  </svg>
)

const ICONS = {
  calendar: 'M8 2v4M16 2v4M3 10h18M5 6h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z',
  clock: 'M12 6v6l4 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  location: 'M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 1 1 18 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  bell: 'M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0',
  repeat: 'M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
  notes: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  warning: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01'
}

const InfoRow = ({ label, children, icon }) => (
  <div className="flex items-start gap-3">
    <div className="mt-0.5 h-9 w-9 shrink-0 rounded-2xl flex items-center justify-center bg-[var(--dms-color-bg-surface-muted)] text-ink-secondary">
      {icon}
    </div>
    <div className="min-w-0 flex-1">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted mb-0.5">{label}</div>
      <div className="text-sm text-ink leading-relaxed break-words">
        {children || <span className="text-ink-soft italic">—</span>}
      </div>
    </div>
  </div>
)

const EmptyMeta = () => (
  <div className="col-span-full text-xs text-ink-muted italic text-center py-4 border border-dashed border-border/70 rounded-2xl bg-[var(--dms-color-bg-surface-muted)]/40">
    No additional category fields configured for this event.
  </div>
)

export default function EventDetailsModal({
  event,
  onClose,
  onEdit,
  onDelete,
  deleting = false
}) {
  if (!event) return null
  const synthetic = isSynthetic(event)
  const style = useMemo(() => getCategoryStyle(event.category), [event.category])
  const catConfig = useMemo(() => CATEGORY_FIELD_CONFIG[event.category], [event.category])
  const rawCustom = event.customEvent || {}
  const custom = {
    location: rawCustom.location || event.location || '',
    reminderOffset: rawCustom.reminderOffset !== undefined && rawCustom.reminderOffset !== null
      ? rawCustom.reminderOffset
      : (event.reminderOffset !== undefined && event.reminderOffset !== null ? event.reminderOffset : null),
    recurrenceRule: rawCustom.recurrenceRule || event.recurrence || null,
    notes: rawCustom.notes || event.description || '',
    categoryMeta: rawCustom.categoryMeta || event.categoryMeta || {}
  }
  const categoryMeta = custom.categoryMeta

  const metaEntries = useMemo(() => {
    const list = []
    const fields = catConfig?.fields || []
    for (const cfg of fields) {
      const rawVal = categoryMeta[cfg.key]
      if (rawVal === null || rawVal === undefined || rawVal === '') {
        list.push({ ...cfg, value: null, display: '—' })
        continue
      }
      const display = formatOptionValue(cfg.type, rawVal, cfg.options)
      list.push({ ...cfg, value: rawVal, display })
    }
    return list
  }, [catConfig, categoryMeta])

  const anyMetaWithValue = metaEntries.some((m) => m.value !== null && m.value !== '' && m.value !== undefined)

  const StartRow = () => (
    <InfoRow label="Starts" icon={<Icon d={ICONS.calendar} />}>
      <div className="font-semibold text-ink">
        {formatDDMMYYYY(event.startDateTime)}
        {!event.isAllDay && (
          <span className="ml-2 inline-flex items-center gap-1 text-ink-secondary font-medium">
            <Icon d={ICONS.clock} className="h-3.5 w-3.5" />
            {formatTime24(event.startDateTime)}
          </span>
        )}
      </div>
    </InfoRow>
  )

  const EndRow = () => (
    <InfoRow label="Ends" icon={<Icon d={ICONS.calendar + ''} />}>
      {event.endDateTime ? (
        <div className="font-semibold text-ink">
          {formatDDMMYYYY(event.endDateTime)}
          {!event.isAllDay && (
            <span className="ml-2 inline-flex items-center gap-1 text-ink-secondary font-medium">
              <Icon d={ICONS.clock} className="h-3.5 w-3.5" />
              {formatTime24(event.endDateTime)}
            </span>
          )}
        </div>
      ) : (
        <span className="text-ink-soft italic">No end date set</span>
      )}
    </InfoRow>
  )

  return (
    <Modal open onClose={onClose} size="2xl" className="w-full max-w-2xl max-h-[78vh] flex flex-col rounded-[20px] overflow-hidden shadow-[0_24px_60px_rgba(15,23,42,0.40)] ring-1 ring-black/10 border-2 border-[var(--dms-color-border-default)]">
      <ModalHeader
        title={
          <div className="flex flex-wrap items-center gap-3">
            <span className={['inline-flex h-2.5 w-2.5 rounded-full shrink-0', style.dot].join(' ')} />
            <span className="line-clamp-1">{event.title || 'Untitled Event'}</span>
            <span className={['inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold', style.bg, style.ink, style.ring].join(' ')}>
              {style.label}
            </span>
            {synthetic && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--dms-color-brand-primary)]/30 bg-[var(--dms-color-info-soft)]/60 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--dms-color-brand-primary)]">
                <Icon d={ICONS.warning} className="h-3.5 w-3.5" />
                Synthetic System Event
              </span>
            )}
          </div>
        }
        subtitle={
          synthetic
            ? 'System-generated events are read-only and managed by their source modules (Document Control, Projects, Workflows, etc.).'
            : event.description
              ? 'View full event details below.'
              : 'View full event details below. No description provided.'
        }
        onClose={onClose}
      />
      <ModalBody className="flex-1 overflow-y-auto dms-scrollbar space-y-6 px-5 sm:px-6 py-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-5">
            <div className="rounded-[24px] border border-border/80 bg-gradient-to-br from-white via-[var(--dms-color-bg-surface)] to-[var(--dms-color-info-soft)]/20 p-5 space-y-5 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--dms-color-brand-primary)] mb-3">Schedule</div>
                <div className="space-y-4">
                  <StartRow />
                  <EndRow />
                  {event.isAllDay && (
                    <div className="flex items-center gap-2 rounded-full bg-[var(--dms-color-warning-soft)]/70 border border-[var(--dms-color-warning-ink)]/15 px-3 py-1.5 w-fit">
                      <Icon d={ICONS.calendar} className="h-3.5 w-3.5 text-[var(--dms-color-warning-ink)]" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--dms-color-warning-ink)]">All-day Event</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InfoRow label="Reminder" icon={<Icon d={ICONS.bell} />}>
                <span className="font-medium">{getReminderLabel(custom.reminderOffset)}</span>
              </InfoRow>
              <InfoRow label="Recurrence" icon={<Icon d={ICONS.repeat} />}>
                <span className="font-medium">{getRecurrenceLabel(custom.recurrenceRule)}</span>
              </InfoRow>
              <InfoRow label="Location" icon={<Icon d={ICONS.location} />}>
                <span className="font-medium break-words">{custom.location}</span>
              </InfoRow>
              <InfoRow label="Organizer / Creator" icon={<Icon d={ICONS.user} />}>
                <span className="font-medium">{getNameLabel(event.user) || event.createdById || 'System'}</span>
              </InfoRow>
              {event.assignee && (
                <InfoRow label="Assignee" icon={<Icon d={ICONS.user} />}>
                  <span className="font-medium">{getNameLabel(event.assignee)}</span>
                </InfoRow>
              )}
              <InfoRow label="Visibility" icon={<Icon d={ICONS.user} />}>
                {event.userId === null ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--dms-color-success-soft)]/80 border border-[var(--dms-color-success-ink)]/20 px-2.5 py-0.5 text-[11px] font-bold text-[var(--dms-color-success-ink)]">
                    Public · All staff
                  </span>
                ) : (
                  <div className="space-y-1">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--dms-color-brand-primary-soft)]/70 border border-[var(--dms-color-brand-primary)]/20 px-2.5 py-0.5 text-[11px] font-bold text-[var(--dms-color-brand-primary)]">
                      Private
                    </span>
                    <div className="text-[11px] text-ink-muted leading-snug">
                      {event.user && (
                        <span>Owner: {getNameLabel(event.user)}</span>
                      )}
                      {event.assignee && event.user && <span className="mx-1">·</span>}
                      {event.assignee && <span>1 assignee</span>}
                      {(event.user || event.assignee) && event.viewers?.length ? <span className="mx-1">·</span> : ''}
                      {event.viewers?.length ? (
                        <span>{event.viewers.length} viewer{event.viewers.length === 1 ? '' : 's'}</span>
                      ) : null}
                    </div>
                  </div>
                )}
              </InfoRow>
              {event.userId !== null && (event.viewers?.length > 0 || event.assignee) && (
                <div className="col-span-2 space-y-2 pt-1">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted flex items-center gap-1.5">
                    <Icon d={ICONS.user} className="h-3 w-3" />
                    People with access
                  </div>
                  <div className="flex flex-wrap gap-2 p-3 rounded-2xl bg-[var(--dms-color-bg-surface)] border-2 border-border/70">
                    {event.user && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 border-border bg-[var(--dms-color-bg-surface)] font-semibold text-ink text-xs">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--dms-color-success-ink)]" />
                        {getNameLabel(event.user)}
                        <span className="ml-1 inline-flex items-center rounded-full bg-[var(--dms-color-success-soft)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--dms-color-success-ink)] border border-[var(--dms-color-success-ink)]/20">
                          Owner
                        </span>
                      </span>
                    )}
                    {event.assignee && (
                      <span key={`assignee-${event.assignee.id}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 border-border bg-[var(--dms-color-bg-surface)] font-semibold text-ink text-xs">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--dms-color-brand-primary)]" />
                        {getNameLabel(event.assignee)}
                        <span className="ml-1 inline-flex items-center rounded-full bg-[var(--dms-color-brand-primary-soft)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--dms-color-brand-primary)] border border-[var(--dms-color-brand-primary)]/20">
                          Assignee
                        </span>
                      </span>
                    )}
                    {(event.viewers || []).map((v) => (
                      <span key={`viewer-${v.id}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 border-border bg-[var(--dms-color-bg-surface)] font-semibold text-ink text-xs">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--dms-color-info-ink)]" />
                        {getNameLabel(v)}
                        {v.department && (
                          <span className="ml-0.5 text-[10px] text-ink-muted">· {v.department}</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-5">
            {catConfig && (
              <div className="rounded-[24px] border border-border/80 bg-[var(--dms-color-bg-surface-muted)]/40 p-5 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
                <div className="flex items-center gap-2 mb-4">
                  <span className={['h-2.5 w-2.5 rounded-full shrink-0', style.dot].join(' ')} />
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.20em] text-ink leading-none">
                      {catConfig.title}
                    </div>
                    <div className="text-[11px] text-ink-muted mt-1 leading-relaxed">
                      {catConfig.desc}
                    </div>
                  </div>
                </div>
                <div className="pt-3 border-t border-border/60">
                  {!anyMetaWithValue ? (
                    <EmptyMeta />
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
                      {metaEntries.map((m) => (
                        <div key={m.key} className="space-y-1">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted flex items-center gap-1.5">
                            {m.label}
                            {m.required && <span className="text-[var(--dms-color-danger-ink)]">*</span>}
                          </div>
                          <div className="text-sm font-medium text-ink leading-relaxed break-words min-h-[24px]">
                            {m.display}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {(event.description || custom.notes) && (
              <div className="rounded-[24px] border border-border/80 bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-8 w-8 rounded-2xl flex items-center justify-center bg-[var(--dms-color-success-soft)] text-[var(--dms-color-success-ink)]">
                    <Icon d={ICONS.notes} className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.20em] text-ink leading-none">Description / Notes</div>
                  </div>
                </div>
                <div className="text-sm text-ink leading-relaxed whitespace-pre-wrap rounded-2xl bg-[var(--dms-color-bg-surface-muted)]/50 p-4 border border-border/60">
                  {event.description || custom.notes || <span className="text-ink-soft italic">No description provided.</span>}
                </div>
              </div>
            )}
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        {!synthetic && (
          <div className="mr-auto flex items-center gap-2">
            <Button
              type="button"
              variant="danger"
              size="sm"
              loading={deleting}
              loadingText="Deleting..."
              onClick={() => onDelete && onDelete(event)}
            >
              Delete Event
            </Button>
          </div>
        )}
        <Button type="button" variant="secondary" onClick={onClose} disabled={deleting}>
          Close
        </Button>
        {!synthetic && (
          <Button
            type="button"
            loading={deleting}
            onClick={() => onEdit && onEdit(event)}
          >
            Edit Event
          </Button>
        )}
      </ModalFooter>
    </Modal>
  )
}
