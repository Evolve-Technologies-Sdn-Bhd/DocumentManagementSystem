import React, { useEffect, useRef } from 'react'
import * as ReactDOM from 'react-dom'
import { useNavigate } from 'react-router-dom'
import Button from '../ui/Button'
import {
  getCategoryStyle, formatDateTime, formatDDMMYYYY, formatTime24
} from '../../utils/calendarUtils'

const SOURCE_LABELS = {
  DOCUMENT_EXPIRY: 'Document Expiry',
  DOCUMENT_EXPIRY_REMINDER: 'Expiry Reminder',
  DOCUMENT_SHARE_EXPIRY: 'Share Link Expiry',
  PROJECT_START: 'Project Start',
  PROJECT_COMPLETION: 'Project Completion',
  PROJECT_ITEM_DUE: 'Project Item Due',
  ITERATION_START: 'Iteration Start',
  ITERATION_END: 'Iteration End',
  ASSIGNMENT_CREATED: 'Assignment Created',
  WORKFLOW_SLA_DUE: 'Workflow SLA',
  DOCUMENT_DATE: 'Document Date',
  PUBLISHED_DATE: 'Published Date',
  OBSOLETE_DATE: 'Obsolete Date',
  VERSION_REQUEST_TARGET: 'Version Request Target',
  TENDER_SUBMISSION_DEADLINE: 'Tender Submission',
  TENDER_FOLLOW_UP: 'Tender Follow-up',
  TENDER_FOLLOW_UP_LOG: 'Tender Follow-up Log',
  FB_ENQUIRY_DATE: 'Enquiry Date',
  FB_FOLLOW_UP: 'Enquiry Follow-up',
  FB_FOLLOW_UP_LOG: 'Enquiry Follow-up Log',
  CUSTOM: 'Custom Event'
}

function EventPopover({
  event,
  anchorEl,
  onClose,
  onEdit,
  onDelete,
  onAddReminder,
  onViewDetails
}) {
  const navigate = useNavigate()
  const ref = useRef(null)
  const style = getCategoryStyle(event.category)

  useEffect(() => {
    const onEsc = (e) => { if (e.key === 'Escape') onClose && onClose() }
    document.addEventListener('keydown', onEsc)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onEsc)
      document.body.style.overflow = ''
    }
  }, [onClose])

  if (!event) return null

  const isCustom = event.sourceType === 'CUSTOM' && !event.synthetic
  const canEdit = isCustom

  const handleNavigate = () => {
    if (!event.deepLink) return
    navigate(event.deepLink)
  }

  const locationValue = event.customEvent?.location || event.location

  return (
    <div className="fixed inset-0 z-[100]">
      <div
        className="absolute inset-0 bg-overlay"
        onClick={(e) => { if (e.target === e.currentTarget) onClose && onClose() }}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-6 pointer-events-none">
        <div
          ref={ref}
          className="pointer-events-auto w-full max-w-3xl max-h-[78vh] flex flex-col"
        >
          <div className="rounded-[20px] border-2 border-[var(--dms-color-border-default)] bg-[var(--dms-color-bg-surface)] shadow-[0_24px_60px_rgba(15,23,42,0.40)] ring-1 ring-black/10 overflow-hidden flex flex-col h-full animate-[popoverIn_0.18s_ease-out]">
            <div className={['px-5 sm:px-6 py-4 flex items-start justify-between gap-3 border-b-2 border-[var(--dms-color-border-default)]', style.bg, style.ring].join(' ')}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={['h-2.5 w-2.5 rounded-full shrink-0', style.dot].join(' ')} />
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-90">
                    {SOURCE_LABELS[event.sourceType] || event.sourceType}
                  </span>
                </div>
                <h3 className="text-[19px] font-bold leading-tight line-clamp-2 text-ink">
                  {event.title || 'Untitled'}
                </h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-xl p-2 text-ink-secondary hover:bg-[var(--dms-color-bg-surface-muted)] hover:text-ink transition-colors"
                aria-label="Close"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-5 sm:px-6 py-5 space-y-5 flex-1 min-h-0 overflow-y-auto dms-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 h-9 w-9 rounded-xl flex items-center justify-center bg-[var(--dms-color-brand-primary)]/10 text-[var(--dms-color-brand-primary)] shrink-0">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1">Date & Time</div>
                      <div className="text-sm leading-6 text-ink-secondary font-medium">
                        {event.isAllDay
                          ? formatDDMMYYYY(event.startDateTime)
                          : formatDateTime(event.startDateTime)}
                        {event.endDateTime && (
                          <>
                            <span className="mx-1.5 text-ink-muted">→</span>
                            {event.isAllDay
                              ? formatDDMMYYYY(event.endDateTime)
                              : formatTime24(event.endDateTime)}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {locationValue && (
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 h-9 w-9 rounded-xl flex items-center justify-center bg-[var(--dms-color-info-soft)]/60 text-[var(--dms-color-info-ink)] shrink-0">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1">Location</div>
                        <div className="text-sm leading-6 text-ink-secondary font-medium break-words">{locationValue}</div>
                      </div>
                    </div>
                  )}

                  {event.reminderOffset != null && (
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 h-9 w-9 rounded-xl flex items-center justify-center bg-[var(--dms-color-warning-soft)]/60 text-[var(--dms-color-warning-ink)] shrink-0">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1">Reminder</div>
                        <div className="text-sm leading-6 text-ink-secondary font-medium">
                          {typeof event.reminderOffset === 'number'
                            ? `${event.reminderOffset} minute${event.reminderOffset === 1 ? '' : 's'} before`
                            : String(event.reminderOffset)}
                        </div>
                      </div>
                    </div>
                  )}

                  {event.recurrence && event.recurrence !== 'NONE' && (
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 h-9 w-9 rounded-xl flex items-center justify-center bg-[var(--dms-color-success-soft)]/60 text-[var(--dms-color-success-ink)] shrink-0">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1">Repeats</div>
                        <div className="text-sm leading-6 text-ink-secondary font-medium">{String(event.recurrence)}</div>
                      </div>
                    </div>
                  )}

                  {event.assignee && (
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 h-9 w-9 rounded-xl flex items-center justify-center bg-[var(--dms-color-brand-primary)]/10 text-[var(--dms-color-brand-primary)] shrink-0">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="8" r="4" />
                          <path d="M4 21c0-4.418 3.582-8 8-8s8 3.582 8 8" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1">Assignee</div>
                        <div className="text-sm leading-6 text-ink-secondary font-medium">
                          {[event.assignee.firstName, event.assignee.lastName].filter(Boolean).join(' ') || event.assignee.email}
                        </div>
                      </div>
                    </div>
                  )}

                  {event.categoryMeta && Object.keys(event.categoryMeta).length > 0 && (
                    <div className="rounded-[18px] border-2 border-[var(--dms-color-border-default)] bg-[color-mix(in_srgb,var(--dms-color-bg-surface)_95%,var(--dms-color-bg-surface-muted))] p-5 space-y-4 shadow-[0_6px_18px_rgba(15,23,42,0.06)]">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Category Details</div>
                      {Object.entries(event.categoryMeta).map(([k, v]) => (
                        v !== null && v !== undefined && v !== '' ? (
                          <div key={k} className="grid grid-cols-3 gap-3 items-start">
                            <span className="text-[11px] text-ink-muted uppercase tracking-wide pt-0.5 col-span-1 font-semibold">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                            <span className="text-sm text-ink-secondary font-semibold break-words col-span-2">{String(v)}</span>
                          </div>
                        ) : null
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="rounded-[18px] border-2 border-[var(--dms-color-border-default)] bg-[color-mix(in_srgb,var(--dms-color-bg-surface)_95%,var(--dms-color-bg-card))] p-5 space-y-4 shadow-[0_6px_18px_rgba(15,23,42,0.06)] min-h-[220px]">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Description</div>
                    {event.description ? (
                      <p className="text-sm leading-7 text-ink-secondary font-medium whitespace-pre-wrap break-words">
                        {event.description}
                      </p>
                    ) : (
                      <p className="text-sm leading-7 text-ink-muted italic font-medium">No description provided.</p>
                    )}
                  </div>

                  {event.extra && Object.keys(event.extra).length > 0 && (
                    <div className="rounded-[18px] border-2 border-[var(--dms-color-border-default)] bg-[color-mix(in_srgb,var(--dms-color-bg-surface)_95%,var(--dms-color-bg-surface-muted))] p-5 space-y-4 shadow-[0_6px_18px_rgba(15,23,42,0.06)]">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Additional Info</div>
                      {Object.entries(event.extra).map(([k, v]) => (
                        v !== null && v !== undefined && v !== '' ? (
                          <div key={k} className="grid grid-cols-3 gap-3 items-start">
                            <span className="text-[11px] text-ink-muted uppercase tracking-wide pt-0.5 col-span-1 font-semibold">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                            <span className="text-sm text-ink-secondary font-semibold break-words col-span-2">{String(v)}</span>
                          </div>
                        ) : null
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="px-5 sm:px-6 py-4 border-t-2 border-[var(--dms-color-border-default)] bg-[var(--dms-color-bg-surface-muted)] flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {onViewDetails && (
                  <Button size="md" variant="primary" onClick={() => { onClose && onClose(); onViewDetails && onViewDetails(event) }}>
                    View Full Details
                  </Button>
                )}
                {event.deepLink && (
                  <Button size="md" variant="secondary" onClick={handleNavigate}>
                    View Source
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!event.synthetic && (
                  <Button
                    size="md"
                    variant="ghost"
                    onClick={() => { onAddReminder && onAddReminder(event) }}
                  >
                    Remind Me
                  </Button>
                )}
                {canEdit && (
                  <Button
                    size="md"
                    variant="secondary"
                    onClick={() => { onEdit && onEdit(event) }}
                  >
                    Edit
                  </Button>
                )}
                {canEdit && (
                  <Button
                    size="md"
                    variant="danger"
                    onClick={() => { if (window.confirm('Delete this event?')) { onDelete && onDelete(event); onClose && onClose(); } }}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function EventPopoverWrapper(props) {
  const inner = <EventPopover {...props} />
  if (typeof document === 'undefined' || !ReactDOM?.createPortal || !document.body) return inner
  return ReactDOM.createPortal(inner, document.body)
}

export default EventPopoverWrapper
