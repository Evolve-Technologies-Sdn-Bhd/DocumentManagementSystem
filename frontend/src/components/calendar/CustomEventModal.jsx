import React, { useEffect, useMemo, useState } from 'react'
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal'
import Button from '../ui/Button'
import TextInput from '../ui/TextInput'
import SelectField from '../ui/SelectField'
import TextArea from '../ui/TextArea'
import api from '../../api/axios'
import {
  formatDDMMYYYY, formatTime24, getCategoryStyle,
  CATEGORY_OPTIONS, REMINDER_OPTIONS, RECURRENCE_OPTIONS,
  PRIORITY_OPTIONS, SEVERITY_OPTIONS, CATEGORY_FIELD_CONFIG
} from '../../utils/calendarUtils'

const toInputDate = (d) => {
  if (!d) return ''
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return ''
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

const toInputTime = (d) => {
  if (!d) return ''
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return ''
  return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
}

const combineDateTime = (dateStr, timeStr, defaultTime = '09:00') => {
  if (!dateStr) return null
  const t = timeStr || defaultTime
  const iso = `${dateStr}T${t}:00`
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d
}

const formatUserName = (u) => {
  if (!u) return 'Unknown'
  const parts = []
  if (u.firstName) parts.push(u.firstName)
  if (u.lastName) parts.push(u.lastName)
  if (parts.length === 0 && u.email) parts.push(u.email)
  const base = parts.join(' ') || `User #${u.id}`
  return u.department ? `${base} — ${u.department}` : base
}

export default function CustomEventModal({
  open, onClose, onSubmit, onDelete,
  existing = null, initialDate = null, deleting = false, saving = false
}) {
  const [users, setUsers] = useState([])
  const [usersLoading, setUsersLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const load = async () => {
      setUsersLoading(true)
      try {
        const res = await api.get('/users', { params: { status: 'ACTIVE' } })
        if (cancelled) return
        const list = res.data?.data?.users || res.data?.users || []
        setUsers(Array.isArray(list) ? list : [])
      } catch (_) {
        if (!cancelled) setUsers([])
      } finally {
        if (!cancelled) setUsersLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [open])

  const [form, setForm] = useState(() => {
    const defaultCategoryMeta = {}
    CATEGORY_FIELD_CONFIG.CUSTOM.fields.forEach((f) => { defaultCategoryMeta[f.key] = '' })
    if (existing) {
      const existingMeta = existing.customEvent?.categoryMeta || {}
      const cat = existing.category || 'CUSTOM'
      const isAnnouncementOrAlert = cat === 'INFO' || cat === 'WARNING'
      return {
        title: existing.title || '',
        description: existing.description || '',
        startDate: toInputDate(existing.startDateTime),
        startTime: toInputTime(existing.startDateTime),
        endDate: toInputDate(existing.endDateTime),
        endTime: toInputTime(existing.endDateTime),
        isAllDay: existing.isAllDay === true,
        category: cat,
        location: existing.customEvent?.location || '',
        recurrenceRule: existing.customEvent?.recurrenceRule || '',
        reminderOffset: existing.customEvent?.reminderOffset || '',
        categoryMeta: { ...defaultCategoryMeta, ...existingMeta },
        viewerIds: Array.isArray(existing.viewerIds) ? existing.viewerIds : [],
        assigneeId: existing.assigneeId || '',
        isPublic: existing.userId == null ? !isAnnouncementOrAlert : false
      }
    }
    const dt = initialDate ? new Date(initialDate) : new Date()
    dt.setHours(9, 0, 0, 0)
    const end = new Date(dt.getTime() + 3600 * 1000)
    return {
      title: '',
      description: '',
      startDate: toInputDate(dt),
      startTime: toInputTime(dt),
      endDate: toInputDate(end),
      endTime: toInputTime(end),
      isAllDay: false,
      category: 'CUSTOM',
      location: '',
      recurrenceRule: '',
      reminderOffset: 'PT15M',
      categoryMeta: { ...defaultCategoryMeta },
      viewerIds: [],
      assigneeId: '',
      isPublic: false
    }
  })

  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (!open) return
    const defaultCategoryMeta = {}
    const initCat = (existing?.category) || 'CUSTOM'
    ;(CATEGORY_FIELD_CONFIG[initCat]?.fields || []).forEach((f) => { defaultCategoryMeta[f.key] = '' })
    if (existing) {
      const existingMeta = existing.customEvent?.categoryMeta || {}
      const cat = existing.category || 'CUSTOM'
      const isAnnouncementOrAlert = cat === 'INFO' || cat === 'WARNING'
      setForm({
        title: existing.title || '',
        description: existing.description || '',
        startDate: toInputDate(existing.startDateTime),
        startTime: toInputTime(existing.startDateTime),
        endDate: toInputDate(existing.endDateTime),
        endTime: toInputTime(existing.endDateTime),
        isAllDay: existing.isAllDay === true,
        category: cat,
        location: existing.customEvent?.location || '',
        recurrenceRule: existing.customEvent?.recurrenceRule || '',
        reminderOffset: existing.customEvent?.reminderOffset || '',
        categoryMeta: { ...defaultCategoryMeta, ...existingMeta },
        viewerIds: Array.isArray(existing.viewerIds) ? existing.viewerIds : [],
        assigneeId: existing.assigneeId || '',
        isPublic: existing.userId == null ? !isAnnouncementOrAlert : false
      })
    } else {
      const dt = initialDate ? new Date(initialDate) : new Date()
      dt.setHours(9, 0, 0, 0)
      const end = new Date(dt.getTime() + 3600 * 1000)
      setForm({
        title: '',
        description: '',
        startDate: toInputDate(dt),
        startTime: toInputTime(dt),
        endDate: toInputDate(end),
        endTime: toInputTime(end),
        isAllDay: false,
        category: 'CUSTOM',
        location: '',
        recurrenceRule: '',
        reminderOffset: 'PT15M',
        categoryMeta: { ...defaultCategoryMeta },
        viewerIds: [],
        assigneeId: '',
        isPublic: false
      })
    }
    setErrors({})
  }, [open, existing, initialDate])

  const currentStyle = useMemo(() => getCategoryStyle(form.category), [form.category])
  const currentCatConfig = useMemo(() => CATEGORY_FIELD_CONFIG[form.category], [form.category])
  const isAnnouncementOrAlert = form.category === 'INFO' || form.category === 'WARNING'
  const effectiveIsPublic = isAnnouncementOrAlert || form.isPublic === true

  const toggleViewerId = (id) => {
    const nid = Number(id)
    setForm((p) => {
      const set = new Set(p.viewerIds || [])
      if (set.has(nid)) set.delete(nid)
      else set.add(nid)
      return { ...p, viewerIds: [...set] }
    })
  }

  const handleChange = (field, value) => {
    setForm((p) => {
      const next = { ...p, [field]: value }
      if (field === 'isAllDay' && value === true) {
        next.startTime = ''
        next.endTime = ''
      }
      if (field === 'category') {
        const defaults = {}
        ;(CATEGORY_FIELD_CONFIG[value]?.fields || []).forEach((f) => { defaults[f.key] = '' })
        next.categoryMeta = { ...p.categoryMeta, ...defaults }
      }
      return next
    })
  }

  const handleMetaChange = (key, value) => {
    setForm((p) => ({
      ...p,
      categoryMeta: { ...p.categoryMeta, [key]: value }
    }))
  }

  const handleSubmit = (e) => {
    if (e) e.preventDefault()
    const nextErrors = {}
    if (!form.title.trim()) nextErrors.title = 'Title is required'
    if (!form.startDate) nextErrors.startDate = 'Start date is required'
    ;(currentCatConfig?.fields || []).forEach((f) => {
      if (f.required && !String(form.categoryMeta?.[f.key] || '').trim()) {
        nextErrors['meta_' + f.key] = `${f.label} is required`
      }
    })
    const start = combineDateTime(form.startDate, form.isAllDay ? '00:00' : form.startTime)
    let end = null
    if (form.endDate) {
      end = combineDateTime(form.endDate, form.isAllDay ? '23:59' : form.endTime, '10:00')
    }
    if (start && end && end < start) nextErrors.endDate = 'End cannot be before start'
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      return
    }
    setErrors({})
    const assigneeIdNum = form.assigneeId ? Number(form.assigneeId) : null
    const cleanViewerIds = (form.viewerIds || [])
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id !== assigneeIdNum)
    onSubmit && onSubmit({
      title: form.title.trim(),
      description: form.description.trim() || null,
      startDateTime: start,
      endDateTime: end,
      isAllDay: form.isAllDay,
      category: form.category,
      location: form.location.trim() || null,
      recurrenceRule: form.recurrenceRule || null,
      reminderOffset: form.reminderOffset || null,
      categoryMeta: (form.categoryMeta && Object.keys(form.categoryMeta).length > 0) ? form.categoryMeta : null,
      assigneeId: assigneeIdNum,
      viewerIds: cleanViewerIds,
      isPublic: effectiveIsPublic
    })
  }

  const renderField = (cfg) => {
    const val = form.categoryMeta?.[cfg.key] ?? ''
    const err = errors['meta_' + cfg.key]
    const sharedInputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:ring-2 focus:ring-[var(--dms-color-brand-primary)]/30 focus:border-[var(--dms-color-brand-primary)] outline-none'
    switch (cfg.type) {
      case 'text':
      case 'number':
      case 'date':
        return (
          <div className="space-y-1" key={cfg.key}>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
              {cfg.label} {cfg.required && <span className="text-[var(--dms-color-danger-ink)]">*</span>}
            </label>
            <input
              type={cfg.type}
              value={val}
              min={cfg.min}
              max={cfg.max}
              placeholder={cfg.placeholder || ''}
              onChange={(e) => handleMetaChange(cfg.key, e.target.value)}
              className={[sharedInputCls, err ? 'border-[var(--dms-color-danger-ink)]' : ''].join(' ')}
            />
            {cfg.note && <p className="text-[10px] text-ink-muted">{cfg.note}</p>}
            {err && <p className="text-[11px] text-[var(--dms-color-danger-ink)]">{err}</p>}
          </div>
        )
      case 'select':
        return (
          <div className="space-y-1" key={cfg.key}>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
              {cfg.label} {cfg.required && <span className="text-[var(--dms-color-danger-ink)]">*</span>}
            </label>
            <SelectField
              value={val}
              onChange={(e) => handleMetaChange(cfg.key, e.target.value)}
            >
              <option value="">— Select —</option>
              {(cfg.options || []).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </SelectField>
            {err && <p className="text-[11px] text-[var(--dms-color-danger-ink)]">{err}</p>}
          </div>
        )
      default:
        return null
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="2xl" className="w-full max-w-2xl max-h-[78vh] flex flex-col rounded-[20px] overflow-hidden shadow-[0_24px_60px_rgba(15,23,42,0.40)] ring-1 ring-black/10 border-2 border-[var(--dms-color-border-default)]">
      <ModalHeader
        title={existing ? 'Edit Event' : 'New Event'}
        subtitle={existing?.synthetic ? 'System-generated event cannot be edited.' : 'Create a new calendar entry with time and category details.'}
        onClose={onClose}
        className="rounded-t-[20px]"
      />
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <ModalBody className="space-y-5 flex-1 overflow-y-auto dms-scrollbar px-5 sm:px-6 py-5">
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Title <span className="text-[var(--dms-color-danger-ink)]">*</span>
            </label>
            <TextInput
              value={form.title}
              onChange={(e) => handleChange('title', e.target.value)}
              placeholder="e.g. Team Meeting / Document Review"
              invalid={Boolean(errors.title)}
            />
            {errors.title && <p className="text-[11px] text-[var(--dms-color-danger-ink)]">{errors.title}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Category</label>
              <SelectField value={form.category} onChange={(e) => handleChange('category', e.target.value)}>
                {CATEGORY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </SelectField>
              <div className={['mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold', currentStyle.bg, currentStyle.ink].join(' ')}>
                <span className={['h-1.5 w-1.5 rounded-full', currentStyle.dot].join(' ')} />
                {currentStyle.label} preview
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Reminder</label>
              <SelectField
                value={form.reminderOffset}
                onChange={(e) => handleChange('reminderOffset', e.target.value)}
              >
                {REMINDER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </SelectField>
              <p className="text-[10px] text-ink-muted mt-1">
                Default: 15 minutes before
              </p>
            </div>
          </div>

          {currentCatConfig && (
            <div className="rounded-2xl border border-border/80 bg-[var(--dms-color-bg-surface-muted)]/50 p-4 space-y-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className={['h-2 w-2 rounded-full shrink-0', currentStyle.dot].join(' ')} />
                  <div className="text-[11px] font-semibold uppercase tracking-[0.20em] text-ink">
                    {currentCatConfig.title}
                  </div>
                </div>
                <div className="text-[11px] text-ink-muted mt-0.5 ml-4">
                  {currentCatConfig.desc}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border/60">
                {(currentCatConfig.fields || []).map(renderField)}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Schedule (Include Time)</label>
              <label className="inline-flex items-center gap-2 text-xs text-ink-secondary select-none">
                <input
                  type="checkbox"
                  checked={form.isAllDay}
                  onChange={(e) => handleChange('isAllDay', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-[var(--dms-color-brand-primary)] focus:ring-[var(--dms-color-brand-primary)]/30"
                />
                All day (no specific time)
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                  Starts <span className="text-[var(--dms-color-danger-ink)]">*</span>
                </label>
                <div className={['grid gap-2', form.isAllDay ? 'grid-cols-1' : 'grid-cols-2'].join(' ')}>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => handleChange('startDate', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:ring-2 focus:ring-[var(--dms-color-brand-primary)]/30 focus:border-[var(--dms-color-brand-primary)] outline-none"
                  />
                  {!form.isAllDay && (
                    <input
                      type="time"
                      value={form.startTime}
                      onChange={(e) => handleChange('startTime', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:ring-2 focus:ring-[var(--dms-color-brand-primary)]/30 focus:border-[var(--dms-color-brand-primary)] outline-none"
                    />
                  )}
                </div>
                {errors.startDate && <p className="text-[11px] text-[var(--dms-color-danger-ink)]">{errors.startDate}</p>}
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Ends (optional)</label>
                <div className={['grid gap-2', form.isAllDay ? 'grid-cols-1' : 'grid-cols-2'].join(' ')}>
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => handleChange('endDate', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:ring-2 focus:ring-[var(--dms-color-brand-primary)]/30 focus:border-[var(--dms-color-brand-primary)] outline-none"
                  />
                  {!form.isAllDay && (
                    <input
                      type="time"
                      value={form.endTime}
                      onChange={(e) => handleChange('endTime', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:ring-2 focus:ring-[var(--dms-color-brand-primary)]/30 focus:border-[var(--dms-color-brand-primary)] outline-none"
                    />
                  )}
                </div>
                {errors.endDate && <p className="text-[11px] text-[var(--dms-color-danger-ink)]">{errors.endDate}</p>}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Recurrence</label>
              <SelectField
                value={form.recurrenceRule}
                onChange={(e) => handleChange('recurrenceRule', e.target.value)}
              >
                {RECURRENCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </SelectField>
              <p className="text-[10px] text-ink-muted mt-1">
                RRULE pattern stored (calendar series)
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Location</label>
              <TextInput
                value={form.location}
                onChange={(e) => handleChange('location', e.target.value)}
                placeholder="Conference Room / Google Meet link"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-border/80 bg-[var(--dms-color-bg-surface-muted)]/50 p-4 space-y-4">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full shrink-0 bg-[var(--dms-color-info-default)]" />
              <div className="text-[11px] font-semibold uppercase tracking-[0.20em] text-ink">
                Visibility & Assignment
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border/60">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                  Assignee
                </label>
                <SelectField
                  value={String(form.assigneeId || '')}
                  onChange={(e) => handleChange('assigneeId', e.target.value)}
                >
                  <option value="">— No assignee —</option>
                  {users.map((u) => (
                    <option key={u.id} value={String(u.id)}>{formatUserName(u)}</option>
                  ))}
                </SelectField>
                <p className="text-[10px] text-ink-muted mt-1">
                  Person responsible for completing this event/task.
                </p>
              </div>

              <div className="space-y-2">
                <label className="inline-flex items-center gap-2 text-xs text-ink-secondary select-none">
                  <input
                    type="checkbox"
                    checked={effectiveIsPublic}
                    disabled={isAnnouncementOrAlert}
                    onChange={(e) => handleChange('isPublic', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-[var(--dms-color-brand-primary)] focus:ring-[var(--dms-color-brand-primary)]/30"
                  />
                  <span className="font-semibold uppercase tracking-wider text-ink-muted text-[11px]">
                    Visible to all users
                  </span>
                </label>
                {isAnnouncementOrAlert ? (
                  <p className="text-[10px] text-[var(--dms-color-success-ink)]">
                    {form.category === 'INFO' ? 'Announcements (INFO)' : 'Alerts (WARNING)'} are always public for all staff.
                  </p>
                ) : effectiveIsPublic ? (
                  <p className="text-[10px] text-[var(--dms-color-info-ink)]">
                    Everyone on the system will see this event.
                  </p>
                ) : (
                  <p className="text-[10px] text-ink-muted">
                    Only you + assignee + viewers below can see this event.
                  </p>
                )}
              </div>
            </div>

            {!effectiveIsPublic && (
              <div className="space-y-2 pt-2 border-t border-border/60">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                    Additional viewers ({form.viewerIds.length})
                  </label>
                  <span className="text-[10px] text-ink-muted">
                    {usersLoading ? 'Loading users…' : `${users.length} users loaded`}
                  </span>
                </div>
                <div className="max-h-48 overflow-y-auto dms-scrollbar space-y-1.5 pr-1 rounded-xl border border-border/60 bg-[var(--dms-color-bg-surface)] p-2.5">
                  {usersLoading && users.length === 0 && (
                    <p className="text-[11px] text-ink-muted px-2 py-1">Loading users…</p>
                  )}
                  {!usersLoading && users.length === 0 && (
                    <p className="text-[11px] text-ink-muted px-2 py-1">No active users available.</p>
                  )}
                  {users.map((u) => {
                    const isAssignee = String(form.assigneeId) === String(u.id)
                    const checked = form.viewerIds.includes(Number(u.id)) || isAssignee
                    return (
                      <label
                        key={u.id}
                        className={[
                          'flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg cursor-pointer select-none border-2',
                          checked ? 'border-[var(--dms-color-brand-primary)]/40 bg-[var(--dms-color-brand-primary)]/5' : 'border-transparent hover:bg-[var(--dms-color-bg-surface-muted)]'
                        ].join(' ')}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={isAssignee}
                          onChange={() => toggleViewerId(u.id)}
                          className="h-4 w-4 rounded border-gray-300 text-[var(--dms-color-brand-primary)] focus:ring-[var(--dms-color-brand-primary)]/30"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-[12px] font-semibold text-ink truncate">{formatUserName(u)}</div>
                          {u.position && <div className="text-[10px] text-ink-muted truncate">{u.position}{u.email ? ` • ${u.email}` : ''}</div>}
                        </div>
                        {isAssignee && (
                          <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-[var(--dms-color-info-ink)] bg-[var(--dms-color-info-soft)] rounded-full px-2 py-0.5">
                            Assignee
                          </span>
                        )}
                      </label>
                    )
                  })}
                </div>
                <p className="text-[10px] text-ink-muted">
                  Tip: Assignees automatically receive viewer access — no need to tick them.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Description / Notes</label>
            <TextArea
              rows={4}
              value={form.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Additional context, agenda, checklist, attachments..."
            />
          </div>
        </ModalBody>
        <ModalFooter>
          {existing && !existing.synthetic && (
            <div className="mr-auto">
              <Button
                type="button"
                variant="danger"
                size="sm"
                loading={deleting}
                loadingText="Deleting..."
                onClick={() => onDelete && onDelete(existing)}
              >
                Delete Event
              </Button>
            </div>
          )}
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={saving}
            loadingText={existing ? 'Saving...' : 'Creating...'}
          >
            {existing ? 'Save Changes' : 'Create Event'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
