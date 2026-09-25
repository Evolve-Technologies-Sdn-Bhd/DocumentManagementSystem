import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchEvents, fetchUpcoming, fetchSources, fetchPreferences, savePreferences,
  createEvent, updateEvent, deleteEvent, createReminder
} from '../api/calendar'
import {
  addMonths, addWeeks, addDays, endOfMonth, endOfWeek,
  startOfMonth, startOfWeek
} from '../utils/calendarUtils'

const DEFAULT_PREFS = {
  defaultView: 'month',
  workdayStart: 9,
  workdayEnd: 18,
  hideWeekends: false,
  weekStartsOn: 1,
  showPastEvents: true
}

export default function useCalendar() {
  const [cursor, setCursor] = useState(() => new Date())
  const [view, setView] = useState(DEFAULT_PREFS.defaultView)
  const [events, setEvents] = useState([])
  const [upcoming, setUpcoming] = useState([])
  const [sources, setSources] = useState([])
  const [categoryMeta, setCategoryMeta] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState({ sources: [], categories: [], search: '' })
  const [scopeFilter, setScopeFilter] = useState('ALL')
  const [prefs, setPrefs] = useState(DEFAULT_PREFS)
  const loadedRef = useRef({ sources: false, prefs: false })

  const computeRange = useCallback((viewType, cur, weekStartsOn = 1) => {
    switch (viewType) {
      case 'week':
        return { from: startOfWeek(cur, weekStartsOn), to: endOfWeek(cur, weekStartsOn) }
      case 'day': {
        const d = new Date(cur); d.setHours(0,0,0,0)
        const e = new Date(cur); e.setHours(23,59,59,999)
        return { from: d, to: e }
      }
      case 'agenda': {
        const f = new Date(cur); f.setHours(0,0,0,0)
        const t = addDays(f, 29)
        t.setHours(23,59,59,999)
        return { from: f, to: t }
      }
      case 'month':
      default:
        return { from: startOfMonth(cur), to: endOfMonth(cur) }
    }
  }, [])

  const loadEvents = useCallback(async (viewType = view, cur = cursor, weekStartsOn = prefs.weekStartsOn) => {
    setLoading(true)
    setError(null)
    try {
      const { from, to } = computeRange(viewType, cur, weekStartsOn)
      const paddedFrom = addDays(from, -2)
      const paddedTo = addDays(to, 2)
      const data = await fetchEvents(paddedFrom, paddedTo, filters)
      setEvents(Array.isArray(data.events) ? data.events : [])
      if (data.categoryMeta) setCategoryMeta(data.categoryMeta)
    } catch (e) {
      console.error(e)
      setError(e?.response?.data?.message || 'Unable to load calendar events')
    } finally {
      setLoading(false)
    }
  }, [view, cursor, filters, prefs.weekStartsOn, computeRange])

  const loadUpcoming = useCallback(async (days = 7) => {
    try {
      const { events } = await fetchUpcoming(days)
      setUpcoming(Array.isArray(events) ? events : [])
    } catch (e) {
      console.error('upcoming load failed', e)
    }
  }, [])

  const loadSources = useCallback(async () => {
    if (loadedRef.current.sources) return
    try {
      const data = await fetchSources()
      setSources(Array.isArray(data.sources) ? data.sources : [])
      if (data.categoryMeta) setCategoryMeta(data.categoryMeta)
      loadedRef.current.sources = true
    } catch (e) {
      console.error('sources load failed', e)
    }
  }, [])

  const loadPreferences = useCallback(async () => {
    if (loadedRef.current.prefs) return
    try {
      const p = await fetchPreferences()
      if (p) {
        setPrefs({ ...DEFAULT_PREFS, ...p })
        if (p.defaultView) setView(p.defaultView)
      }
      loadedRef.current.prefs = true
    } catch (e) {
      console.error('prefs load failed', e)
    }
  }, [])

  const init = useCallback(async () => {
    await Promise.all([loadSources(), loadPreferences()])
  }, [loadSources, loadPreferences])

  useEffect(() => {
    init()
  }, [init])

  useEffect(() => {
    if (!loadedRef.current.sources || !loadedRef.current.prefs) return
    loadEvents()
  }, [loadEvents, loadedRef.current.sources, loadedRef.current.prefs])

  const navigate = useCallback((direction) => {
    setCursor((cur) => {
      switch (view) {
        case 'month':
          return addMonths(cur, direction)
        case 'week':
        case 'agenda':
          return addWeeks(cur, direction)
        case 'day':
          return addDays(cur, direction)
        default:
          return addMonths(cur, direction)
      }
    })
  }, [view])

  const goToday = useCallback(() => setCursor(new Date()), [])

  const changeView = useCallback((nextView) => {
    setView(nextView)
  }, [])

  const createNewEvent = useCallback(async (payload) => {
    const evt = await createEvent(payload)
    await loadEvents()
    await loadUpcoming()
    return evt
  }, [loadEvents, loadUpcoming])

  const updateExistingEvent = useCallback(async (id, payload) => {
    const evt = await updateEvent(id, payload)
    await loadEvents()
    await loadUpcoming()
    return evt
  }, [loadEvents, loadUpcoming])

  const removeEvent = useCallback(async (id) => {
    await deleteEvent(id)
    await loadEvents()
    await loadUpcoming()
  }, [loadEvents, loadUpcoming])

  const saveUserPrefs = useCallback(async (payload) => {
    const next = { ...prefs, ...payload }
    setPrefs(next)
    try {
      const saved = await savePreferences(next)
      if (saved) setPrefs(saved)
    } catch (e) {
      console.error('save prefs failed', e)
    }
  }, [prefs])

  const addReminderToEvent = useCallback(async (eventId, payload) => {
    return createReminder(eventId, payload)
  }, [])

  const _isSynthetic = (e) => {
    if (typeof e?.isSynthetic === 'boolean') return e.isSynthetic
    const id = String(e?.id ?? '')
    return id.startsWith('syn_')
  }

  const filteredEvents = useMemo(() => {
    switch (scopeFilter) {
      case 'MY':
        return events.filter(e => !_isSynthetic(e))
      case 'SYSTEM':
        return events.filter(e => _isSynthetic(e))
      case 'ALL':
      default:
        return events
    }
  }, [events, scopeFilter])

  const filteredUpcoming = useMemo(() => {
    switch (scopeFilter) {
      case 'MY':
        return upcoming.filter(e => !_isSynthetic(e))
      case 'SYSTEM':
        return upcoming.filter(e => _isSynthetic(e))
      case 'ALL':
      default:
        return upcoming
    }
  }, [upcoming, scopeFilter])

  const range = useMemo(
    () => computeRange(view, cursor, prefs.weekStartsOn),
    [view, cursor, prefs.weekStartsOn, computeRange]
  )

  return {
    // state
    cursor, setCursor,
    view, setView: changeView,
    events, loading, error,
    filteredEvents,
    upcoming,
    filteredUpcoming,
    sources, categoryMeta,
    filters, setFilters,
    scopeFilter, setScopeFilter,
    prefs,
    range,
    // actions
    loadEvents,
    loadUpcoming,
    navigate, goToday,
    createEvent: createNewEvent,
    updateEvent: updateExistingEvent,
    deleteEvent: removeEvent,
    savePreferences: saveUserPrefs,
    addReminder: addReminderToEvent
  }
}
