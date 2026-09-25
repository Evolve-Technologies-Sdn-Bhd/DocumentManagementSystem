import api from './axios'

const generateMockEvents = (fromDate, toDate) => {
  const today = new Date()
  const y = today.getFullYear()
  const fmtDate = (year, monthIdx, day, hr, min, sec = 0, ms = 0) => {
    const d = new Date(year, monthIdx, day, hr, min, sec, ms)
    return d.toISOString()
  }

  const base = [
    {
      id: 'mock-001',
      title: 'QMS Document Review Meeting',
      description: 'Review latest SOP revisions for Document Control department.',
      category: 'MILESTONE',
      sourceType: 'PROJECT_COMPLETION',
      synthetic: false,
      isAllDay: false,
      startDateTime: fmtDate(y, 7, 14, 10, 0),
      endDateTime: fmtDate(y, 7, 14, 11, 30),
      location: 'Level 3 Conference Room',
      reminderOffset: 'PT15M',
      attendees: ['sharifah@clbholdings.com', 'azlan@clbholdings.com']
    },
    {
      id: 'mock-002',
      title: 'SOP-QA-027 Expiry Reminder',
      description: 'Standard Operating Procedure for QA Batch Release expires in 60 days.',
      category: 'WARNING',
      sourceType: 'DOCUMENT_EXPIRY_REMINDER',
      synthetic: true,
      isAllDay: true,
      startDateTime: fmtDate(y, 7, 19, 0, 0),
      endDateTime: fmtDate(y, 7, 19, 23, 59, 59, 999),
      reminderOffset: 'PT1D'
    },
    {
      id: 'mock-003',
      title: 'Client Site Visit — KLCC Tower',
      description: 'Quarterly review with Client A on Project Phoenix deliverables.',
      category: 'INFO',
      sourceType: 'PROJECT_START',
      synthetic: false,
      isAllDay: false,
      startDateTime: fmtDate(y, 7, 26, 9, 0),
      endDateTime: fmtDate(y, 7, 26, 12, 30),
      location: 'KLCC Tower 3, Level 42',
      reminderOffset: 'PT1H',
      attendees: ['nurul@clbholdings.com', 'hakim@client-a.com']
    },
    {
      id: 'mock-004',
      title: 'Board Meeting — Q3 Governance',
      description: 'Agenda: quarterly financials, compliance report, risk register review.',
      category: 'DEADLINE',
      sourceType: 'ITERATION_START',
      synthetic: false,
      isAllDay: true,
      startDateTime: fmtDate(y, 8, 2, 0, 0),
      endDateTime: fmtDate(y, 8, 2, 23, 59, 59, 999),
      reminderOffset: 'PT1D'
    },
    {
      id: 'mock-005',
      title: 'Tender Submission — JKR Package 3B',
      description: 'Technical + commercial proposal submission due before 4:30 PM at JKR HQ.',
      category: 'CRITICAL',
      sourceType: 'PROJECT_ITEM_DUE',
      synthetic: true,
      isAllDay: false,
      startDateTime: fmtDate(y, 8, 8, 13, 0),
      endDateTime: fmtDate(y, 8, 8, 16, 30),
      location: 'JKR Ibu Pejabat, Putrajaya',
      reminderOffset: 'PT2H'
    },
    {
      id: 'mock-006',
      title: 'HR Annual Leave Review',
      description: 'Approve pending leave applications for September intake.',
      category: 'TASK',
      sourceType: 'CUSTOM',
      synthetic: false,
      isAllDay: false,
      startDateTime: fmtDate(y, 8, 10, 14, 0),
      endDateTime: fmtDate(y, 8, 10, 15, 30),
      reminderOffset: 'PT15M'
    },
    {
      id: 'mock-007',
      title: 'Contract A-2025/09 Renwal Meeting',
      description: '12 months extension negotiation. Legal, Finance & Procurement required.',
      category: 'WARNING',
      sourceType: 'DOCUMENT_EXPIRY',
      synthetic: true,
      isAllDay: false,
      startDateTime: fmtDate(y, 8, 16, 10, 30),
      endDateTime: fmtDate(y, 8, 16, 12, 0),
      location: 'Meeting Room B (1st Floor)',
      reminderOffset: 'PT1H'
    },
    {
      id: 'mock-008',
      title: 'Merdeka Day — Public Holiday',
      description: 'Office closed. Emergency on-call rotation applied.',
      category: 'INFO',
      sourceType: 'CUSTOM',
      synthetic: false,
      isAllDay: true,
      startDateTime: fmtDate(y, 8, 31, 0, 0),
      endDateTime: fmtDate(y, 8, 31, 23, 59, 59, 999)
    },
    {
      id: 'mock-009',
      title: 'Q3 Management Review Presentation',
      description: 'Finalize slides. Review KPI achievement vs target. Present to CEO.',
      category: 'MILESTONE',
      sourceType: 'PROJECT_COMPLETION',
      synthetic: false,
      isAllDay: false,
      startDateTime: fmtDate(y, 9, 3, 9, 0),
      endDateTime: fmtDate(y, 9, 3, 11, 0),
      location: 'Main Auditorium, GF',
      reminderOffset: 'PT1H'
    },
    {
      id: 'mock-010',
      title: 'Monthly Payroll Cut-off',
      description: 'All overtime, claims & timesheets must be submitted by 12:00 PM.',
      category: 'DEADLINE',
      sourceType: 'PROJECT_ITEM_DUE',
      synthetic: true,
      isAllDay: false,
      startDateTime: fmtDate(y, 9, 18, 9, 0),
      endDateTime: fmtDate(y, 9, 18, 12, 0),
      reminderOffset: 'PT30M'
    },
    {
      id: 'mock-011',
      title: 'Vendor Audit — IT Security',
      description: 'Annual external cybersecurity audit by Deloitte (2 days).',
      category: 'TASK',
      sourceType: 'CUSTOM',
      synthetic: false,
      isAllDay: true,
      startDateTime: fmtDate(y, 9, 22, 0, 0),
      endDateTime: fmtDate(y, 9, 23, 23, 59, 59, 999),
      location: 'Data Center, Level 5',
      reminderOffset: 'PT1D'
    },
    {
      id: 'mock-012',
      title: 'Q4 Budget Finalization — Due to Finance',
      description: 'Submit 2026 Q4 departmental budget workbook with variance justifications.',
      category: 'CRITICAL',
      sourceType: 'PROJECT_ITEM_DUE',
      synthetic: true,
      isAllDay: false,
      startDateTime: fmtDate(y, 10, 6, 14, 0),
      endDateTime: fmtDate(y, 10, 6, 17, 0),
      location: 'Finance Portal Submission',
      reminderOffset: 'PT2H'
    },
    {
      id: 'mock-013',
      title: 'Deepavali — Public Holiday',
      description: 'Office closed in conjunction with Deepavali celebration.',
      category: 'INFO',
      sourceType: 'CUSTOM',
      synthetic: false,
      isAllDay: true,
      startDateTime: fmtDate(y, 10, 11, 0, 0),
      endDateTime: fmtDate(y, 10, 11, 23, 59, 59, 999)
    },
    {
      id: 'mock-014',
      title: 'Yearly Fire Drill & Emergency Exercise',
      description: 'Mandatory for all staff. Gather point: open car park Zone B.',
      category: 'WARNING',
      sourceType: 'CUSTOM',
      synthetic: false,
      isAllDay: false,
      startDateTime: fmtDate(y, 10, 18, 10, 0),
      endDateTime: fmtDate(y, 10, 18, 11, 30),
      reminderOffset: 'PT15M'
    },
    {
      id: 'mock-015',
      title: 'SLA Compliance Report — Final Review',
      description: 'Customer report review before issuance. Service uptime 99.7%.',
      category: 'MILESTONE',
      sourceType: 'PROJECT_COMPLETION',
      synthetic: false,
      isAllDay: false,
      startDateTime: fmtDate(y, 10, 25, 15, 0),
      endDateTime: fmtDate(y, 10, 25, 16, 30),
      reminderOffset: 'PT30M'
    },
    {
      id: 'mock-016',
      title: 'Christmas Eve — Half Day',
      description: 'Office closes 1:00 PM. Happy holidays team!',
      category: 'INFO',
      sourceType: 'CUSTOM',
      synthetic: false,
      isAllDay: false,
      startDateTime: fmtDate(y, 11, 24, 0, 0),
      endDateTime: fmtDate(y, 11, 24, 13, 0)
    }
  ]

  const fromTs = new Date(fromDate).getTime()
  const toTs = new Date(toDate).getTime()

  return base.filter((e) => {
    const s = new Date(e.startDateTime).getTime()
    const end = new Date(e.endDateTime).getTime()
    return end >= fromTs && s <= toTs
  })
}

export const fetchEvents = async (from, to, filters = {}) => {
  const params = { from: from.toISOString(), to: to.toISOString() }
  if (filters.sources?.length) params.sources = filters.sources.join(',')
  if (filters.categories?.length) params.categories = filters.categories.join(',')
  if (filters.search) params.search = filters.search
  try {
    const res = await api.get('/calendar', { params })
    const data = res.data?.data || { events: [], categoryMeta: {} }
    const events = Array.isArray(data.events) ? data.events : []
    if (events.length > 0) return data
    return { events: generateMockEvents(from, to), categoryMeta: data.categoryMeta || {} }
  } catch (e) {
    return { events: generateMockEvents(from, to), categoryMeta: {} }
  }
}

export const fetchUpcoming = async (days = 7) => {
  const res = await api.get(`/calendar/upcoming?days=${days}`)
  return res.data?.data || { events: [], days }
}

export const fetchSources = async () => {
  const res = await api.get('/calendar/sources')
  return res.data?.data || { sources: [], categoryMeta: {} }
}

export const createEvent = async (payload) => {
  const res = await api.post('/calendar', payload)
  return res.data?.data?.event
}

export const updateEvent = async (id, payload) => {
  const res = await api.put(`/calendar/${id}`, payload)
  return res.data?.data?.event
}

export const deleteEvent = async (id) => {
  const res = await api.delete(`/calendar/${id}`)
  return res.data
}

export const fetchPreferences = async () => {
  const res = await api.get('/calendar/preferences')
  return res.data?.data?.preferences
}

export const savePreferences = async (payload) => {
  const res = await api.put('/calendar/preferences', payload)
  return res.data?.data?.preferences
}

export const createReminder = async (eventId, payload) => {
  const res = await api.post(`/calendar/${eventId}/reminders`, payload)
  return res.data?.data
}
