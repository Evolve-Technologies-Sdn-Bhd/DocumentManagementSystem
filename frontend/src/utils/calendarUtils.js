export const CATEGORY_STYLES = {
  CRITICAL: {
    bg: 'bg-[var(--dms-color-danger-soft)]',
    ink: 'text-[var(--dms-color-danger-ink)]',
    ring: 'ring-1 ring-[var(--dms-color-danger-ink)]/15',
    dot: 'bg-[var(--dms-color-danger-ink)]',
    label: 'Critical'
  },
  DEADLINE: {
    bg: 'bg-[var(--dms-color-danger-soft)]',
    ink: 'text-[var(--dms-color-danger-ink)]',
    ring: 'ring-1 ring-[var(--dms-color-danger-ink)]/20',
    dot: 'bg-[var(--dms-color-danger-default)]',
    label: 'Deadline'
  },
  WARNING: {
    bg: 'bg-[var(--dms-color-warning-soft)]',
    ink: 'text-[var(--dms-color-warning-ink)]',
    ring: 'ring-1 ring-[var(--dms-color-warning-ink)]/15',
    dot: 'bg-[var(--dms-color-warning-default)]',
    label: 'Warning'
  },
  TASK: {
    bg: 'bg-[var(--dms-color-warning-soft)]',
    ink: 'text-[var(--dms-color-warning-ink)]',
    ring: 'ring-1 ring-[var(--dms-color-warning-ink)]/15',
    dot: 'bg-[var(--dms-color-warning-ink)]',
    label: 'Task'
  },
  MILESTONE: {
    bg: 'bg-[var(--dms-color-info-soft)]',
    ink: 'text-[var(--dms-color-info-ink)]',
    ring: 'ring-1 ring-[var(--dms-color-info-ink)]/15',
    dot: 'bg-[var(--dms-color-info-default)]',
    label: 'Milestone'
  },
  INFO: {
    bg: 'bg-[var(--dms-color-success-soft)]',
    ink: 'text-[var(--dms-color-success-ink)]',
    ring: 'ring-1 ring-[var(--dms-color-success-ink)]/15',
    dot: 'bg-[var(--dms-color-success-default)]',
    label: 'Info'
  },
  CUSTOM: {
    bg: 'bg-purple-50 text-purple-800',
    ink: 'text-purple-800',
    ring: 'ring-1 ring-purple-700/15',
    dot: 'bg-purple-600',
    label: 'Custom'
  }
}

export const getCategoryStyle = (cat) => {
  const c = String(cat || 'INFO').toUpperCase()
  return CATEGORY_STYLES[c] || CATEGORY_STYLES.INFO
}

export const pad2 = (n) => String(n).padStart(2, '0')

export const startOfDay = (d) => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export const endOfDay = (d) => {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

export const addDays = (d, n) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export const addMonths = (d, n) => {
  const x = new Date(d)
  x.setMonth(x.getMonth() + n)
  return x
}

export const addWeeks = (d, n) => addDays(d, n * 7)

export const startOfMonth = (d) => {
  const x = new Date(d)
  x.setDate(1)
  x.setHours(0, 0, 0, 0)
  return x
}

export const endOfMonth = (d) => {
  const x = new Date(d)
  x.setMonth(x.getMonth() + 1, 0)
  x.setHours(23, 59, 59, 999)
  return x
}

export const startOfWeek = (d, weekStartsOn = 1) => {
  const x = startOfDay(d)
  const day = x.getDay()
  const diff = (day - weekStartsOn + 7) % 7
  x.setDate(x.getDate() - diff)
  return x
}

export const endOfWeek = (d, weekStartsOn = 1) => {
  const s = startOfWeek(d, weekStartsOn)
  s.setDate(s.getDate() + 6)
  s.setHours(23, 59, 59, 999)
  return s
}

export const isSameDay = (a, b) => {
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  )
}

export const isToday = (d) => isSameDay(d, new Date())

export const formatDDMMYYYY = (d) => {
  if (!d) return ''
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return ''
  return `${pad2(dt.getDate())}/${pad2(dt.getMonth() + 1)}/${dt.getFullYear()}`
}

export const formatTime24 = (d) => {
  if (!d) return ''
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return ''
  return `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`
}

export const formatDateTime = (d) => {
  const date = formatDDMMYYYY(d)
  const time = formatTime24(d)
  return date + (time ? ' · ' + time : '')
}

export const MONTH_NAMES_FULL = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
]

export const MONTH_NAMES_SHORT = [
  'Jan','Feb','Mar','Apr','May','Jun',
  'Jul','Aug','Sep','Oct','Nov','Dec'
]

export const WEEKDAY_NAMES_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
export const WEEKDAY_NAMES_LONG = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

export const formatMonthHeader = (d) => `${MONTH_NAMES_FULL[d.getMonth()]} ${d.getFullYear()}`

export const formatWeekHeader = (d, weekStartsOn = 1) => {
  const s = startOfWeek(d, weekStartsOn)
  const e = endOfWeek(d, weekStartsOn)
  const sameMonth = s.getMonth() === e.getMonth()
  const sameYear = s.getFullYear() === e.getFullYear()
  if (sameMonth && sameYear) {
    return `${MONTH_NAMES_FULL[s.getMonth()]} ${s.getDate()} - ${e.getDate()}, ${s.getFullYear()}`
  }
  if (sameYear) {
    return `${MONTH_NAMES_SHORT[s.getMonth()]} ${s.getDate()} - ${MONTH_NAMES_SHORT[e.getMonth()]} ${e.getDate()}, ${s.getFullYear()}`
  }
  return `${MONTH_NAMES_SHORT[s.getMonth()]} ${s.getDate()}, ${s.getFullYear()} - ${MONTH_NAMES_SHORT[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`
}

export const formatDayHeader = (d) => `${WEEKDAY_NAMES_LONG[d.getDay()]}, ${pad2(d.getDate())} ${MONTH_NAMES_FULL[d.getMonth()]} ${d.getFullYear()}`

export const getMonthGridDays = (cursor, weekStartsOn = 1) => {
  const first = startOfMonth(cursor)
  const last = endOfMonth(cursor)
  const start = startOfWeek(first, weekStartsOn)
  const end = endOfWeek(last, weekStartsOn)
  let totalDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
  if (totalDays > 35) totalDays = 35
  const days = []
  for (let i = 0; i < totalDays; i++) {
    days.push(addDays(start, i))
  }
  return days
}

export const isDateInRange = (d, from, to) => {
  const dt = startOfDay(d).getTime()
  return dt >= startOfDay(from).getTime() && dt <= endOfDay(to).getTime()
}

export const groupEventsByDate = (events) => {
  const map = new Map()
  for (const ev of events) {
    const key = formatDDMMYYYY(ev.startDateTime)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(ev)
  }
  return map
}

export const MONTH_NUMS_MY = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis']
export const WEEKDAY_SHORT_MY = ['Ahd', 'Isn', 'Sel', 'Rab', 'Kha', 'Jum', 'Sab']

export const CATEGORY_OPTIONS = [
  { value: 'CUSTOM', label: 'Custom' },
  { value: 'MILESTONE', label: 'Milestone' },
  { value: 'TASK', label: 'Task' },
  { value: 'DEADLINE', label: 'Deadline' },
  { value: 'INFO', label: 'Info' },
  { value: 'WARNING', label: 'Warning' }
]

export const REMINDER_OPTIONS = [
  { value: '', label: 'No reminder' },
  { value: 'PT0M', label: 'At time of event' },
  { value: 'PT5M', label: '5 minutes before' },
  { value: 'PT15M', label: '15 minutes before' },
  { value: 'PT30M', label: '30 minutes before' },
  { value: 'PT1H', label: '1 hour before' },
  { value: 'PT2H', label: '2 hours before' },
  { value: 'PT1D', label: '1 day before' },
  { value: 'PT2D', label: '2 days before' },
  { value: 'PT1W', label: '1 week before' }
]

export const RECURRENCE_OPTIONS = [
  { value: '', label: 'Does not repeat' },
  { value: 'FREQ=DAILY', label: 'Daily' },
  { value: 'FREQ=WEEKLY', label: 'Weekly' },
  { value: 'FREQ=BIWEEKLY', label: 'Every 2 weeks' },
  { value: 'FREQ=MONTHLY', label: 'Monthly' },
  { value: 'FREQ=YEARLY', label: 'Yearly' }
]

export const PRIORITY_OPTIONS = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'URGENT', label: 'Urgent' }
]

export const SEVERITY_OPTIONS = [
  { value: 'LOW', label: 'Low - Informational' },
  { value: 'MEDIUM', label: 'Medium - Attention needed' },
  { value: 'HIGH', label: 'High - Critical' }
]

export const CATEGORY_FIELD_CONFIG = {
  CUSTOM: {
    title: 'Custom Event Details',
    desc: 'Personal or team calendar entries with flexible fields.',
    fields: []
  },
  MILESTONE: {
    title: 'Project Milestone Details',
    desc: 'Track critical project milestones and their owners.',
    fields: [
      { key: 'projectId', label: 'Related Project', type: 'text', placeholder: 'e.g. Project Alpha / PROJ-001', required: false },
      { key: 'owner', label: 'Milestone Owner', type: 'text', placeholder: 'Person responsible', required: false },
      { key: 'priority', label: 'Priority', type: 'select', options: PRIORITY_OPTIONS, required: false }
    ]
  },
  TASK: {
    title: 'Task Details',
    desc: 'Assignable action items with due dates and progress.',
    fields: [
      { key: 'assignee', label: 'Assignee', type: 'text', placeholder: 'Name or email of task owner', required: false },
      { key: 'priority', label: 'Priority', type: 'select', options: PRIORITY_OPTIONS, required: false },
      { key: 'progressPct', label: 'Progress (%)', type: 'number', placeholder: '0 - 100', required: false, min: 0, max: 100 }
    ]
  },
  DEADLINE: {
    title: 'Document / Compliance Deadline',
    desc: 'Regulatory or document deadlines with responsible person and escalation.',
    fields: [
      { key: 'relatedDoc', label: 'Related Document', type: 'text', placeholder: 'e.g. MOM/01/260826/005', required: false },
      { key: 'responsible', label: 'Responsible Person', type: 'text', placeholder: 'Owner for this deadline', required: false },
      { key: 'escalationDate', label: 'Escalation Date', type: 'date', required: false }
    ]
  },
  INFO: {
    title: 'Announcement / Info Notice',
    desc: 'Share information with your team over a date range.',
    fields: [
      { key: 'audience', label: 'Target Audience', type: 'text', placeholder: 'e.g. All staff / Dept: QA', required: false },
      { key: 'validFrom', label: 'Display From', type: 'date', required: false },
      { key: 'validUntil', label: 'Display Until', type: 'date', required: false }
    ]
  },
  WARNING: {
    title: 'Alert / Warning Notice',
    desc: 'Urgent alerts, outages, or issues that need attention.',
    fields: [
      { key: 'severity', label: 'Severity', type: 'select', options: SEVERITY_OPTIONS, required: true },
      { key: 'alertContact', label: 'Alert Contact', type: 'text', placeholder: 'Person to contact (ext / email)', required: false },
      { key: 'escalationDate', label: 'Resolution Due', type: 'date', required: false }
    ]
  }
}

export const getReminderLabel = (offset) => {
  if (!offset) return 'No reminder'
  const o = REMINDER_OPTIONS.find((r) => r.value === offset)
  return o?.label || offset
}

export const getRecurrenceLabel = (rr) => {
  if (!rr) return 'Does not repeat'
  const o = RECURRENCE_OPTIONS.find((r) => r.value === rr)
  return o?.label || rr
}

export const formatOptionValue = (type, value, options) => {
  if (value === null || value === undefined || value === '') return '—'
  if (type === 'select' && Array.isArray(options)) {
    const m = options.find((o) => o.value === value)
    return m?.label || value
  }
  if (type === 'date') {
    const d = new Date(value)
    if (!Number.isNaN(d.getTime())) return formatDDMMYYYY(d)
  }
  if (type === 'number' && String(value).trim() !== '') {
    return String(value)
  }
  return String(value)
}

