import React, { useEffect, useState } from 'react'
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal'
import Button from '../ui/Button'
import SelectField from '../ui/SelectField'
import { formatDateTime } from '../../utils/calendarUtils'

const PRESET_OPTIONS = [
  { value: 0, label: 'At time of event' },
  { value: 5, label: '5 minutes before' },
  { value: 15, label: '15 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 1440, label: '1 day before' },
  { value: 4320, label: '3 days before' },
  { value: 10080, label: '1 week before' }
]

export default function ReminderModal({
  open, onClose, onSubmit, event, saving = false
}) {
  const [form, setForm] = useState({ reminderType: 'IN_APP', offsetMinutes: 1440 })

  useEffect(() => {
    if (!open) return
    setForm({ reminderType: 'IN_APP', offsetMinutes: 1440 })
  }, [open])

  const handleSubmit = (e) => {
    if (e) e.preventDefault()
    onSubmit && onSubmit(form)
  }

  if (!event) return null

  return (
    <Modal open={open} onClose={onClose} size="sm">
      <ModalHeader
        title="Set Reminder"
        subtitle={event.title}
        onClose={onClose}
      />
      <form onSubmit={handleSubmit}>
        <ModalBody className="space-y-4">
          <div className="rounded-xl border border-border bg-[var(--dms-color-bg-surface-muted)] px-3 py-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Event Time</div>
            <div className="mt-1 text-sm font-medium text-ink">{formatDateTime(event.startDateTime)}</div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Notify me</label>
            <SelectField
              value={form.offsetMinutes}
              onChange={(e) => setForm((p) => ({ ...p, offsetMinutes: Number(e.target.value) }))}
            >
              {PRESET_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </SelectField>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Delivery Method</label>
            <SelectField
              value={form.reminderType}
              onChange={(e) => setForm((p) => ({ ...p, reminderType: e.target.value }))}
            >
              <option value="IN_APP">In-App Notification</option>
              <option value="EMAIL">Email</option>
              <option value="SMS">SMS (if configured)</option>
            </SelectField>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" loading={saving} loadingText="Setting...">
            Set Reminder
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
