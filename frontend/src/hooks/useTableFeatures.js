import { useState, useEffect, useMemo, useCallback, useRef } from 'react'

const STORAGE_PREFIX = 'dms:table:user:'

const getCurrentUserId = () => {
  try {
    const raw = localStorage.getItem('user')
    if (!raw) return null
    const user = JSON.parse(raw)
    return user?.id ?? null
  } catch (e) {
    return null
  }
}

const arraysEqual = (a, b) => {
  if (a === b) return true
  if (!Array.isArray(a) || !Array.isArray(b)) return false
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

const readStorage = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    if (parsed === null || parsed === undefined) return fallback
    return parsed
  } catch (e) {
    return fallback
  }
}

const writeStorage = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (e) {
  }
}

const naturalCompare = (a, b) => {
  if (a == null && b == null) return 0
  if (a == null) return -1
  if (b == null) return 1
  const aStr = String(a)
  const bStr = String(b)
  const aNum = Number(aStr.replace(/[^\d.\-]/g, ''))
  const bNum = Number(bStr.replace(/[^\d.\-]/g, ''))
  const bothNumeric = Number.isFinite(aNum) && Number.isFinite(bNum) && aStr !== '' && bStr !== ''
  if (bothNumeric && aNum !== bNum) return aNum - bNum
  return aStr.localeCompare(bStr, undefined, { numeric: true, sensitivity: 'base' })
}

const dateCompare = (a, b) => {
  const ta = a ? new Date(a).getTime() : NaN
  const tb = b ? new Date(b).getTime() : NaN
  if (Number.isNaN(ta) && Number.isNaN(tb)) return 0
  if (Number.isNaN(ta)) return -1
  if (Number.isNaN(tb)) return 1
  return ta - tb
}

export default function useTableFeatures({
  tableId,
  columns,
  data,
  defaultSortKey = null,
  defaultSortDirection = 'asc',
  persist = true
}) {
  const lastUserIdRef = useRef(getCurrentUserId())

  const getStorageKey = useCallback(() => {
    const userId = getCurrentUserId()
    return persist && tableId ? `${STORAGE_PREFIX}${userId ?? 'anonymous'}:${tableId}` : null
  }, [persist, tableId])

  const storageKey = getStorageKey()

  const stableColumnIds = useMemo(
    () => columns.map((c) => c.id || c.key || c.accessor),
    [columns]
  )

  const computeColumnOrder = useCallback((sk, sids) => {
    if (!sk) return sids
    const saved = readStorage(`${sk}:columnOrder`, null)
    if (!Array.isArray(saved) || saved.length === 0) return sids
    const merged = [...sids.filter((id) => !saved.includes(id))]
    return [...saved.filter((id) => sids.includes(id)), ...merged]
  }, [])

  const computeHiddenColumns = useCallback((sk, sids) => {
    if (!sk) return []
    const saved = readStorage(`${sk}:hiddenColumns`, [])
    return Array.isArray(saved) ? saved.filter((id) => sids.includes(id)) : []
  }, [])

  const computeSort = useCallback((sk, sids, cols, dsk, dsd) => {
    let sortKey = dsk
    let sortDirection = dsd
    if (sk) {
      const saved = readStorage(`${sk}:sort`, null)
      if (saved && typeof saved === 'object' && saved.sortKey) {
        const keyOk = sids.includes(saved.sortKey) || cols.some((c) => (c.key || c.accessor) === saved.sortKey)
        if (keyOk) {
          sortKey = saved.sortKey
          sortDirection = saved.sortDirection === 'desc' ? 'desc' : 'asc'
        }
      }
    }
    return { sortKey, sortDirection }
  }, [])

  const initialColumnOrder = useMemo(() => {
    return computeColumnOrder(storageKey, stableColumnIds)
  }, [storageKey, stableColumnIds, computeColumnOrder])

  const initialHiddenColumns = useMemo(() => {
    return computeHiddenColumns(storageKey, stableColumnIds)
  }, [storageKey, stableColumnIds, computeHiddenColumns])

  const initialSort = useMemo(() => {
    return computeSort(storageKey, stableColumnIds, columns, defaultSortKey, defaultSortDirection)
  }, [storageKey, stableColumnIds, columns, defaultSortKey, defaultSortDirection, computeSort])

  const [columnOrder, setColumnOrderState] = useState(initialColumnOrder)
  const [hiddenColumns, setHiddenColumnsState] = useState(initialHiddenColumns)
  const [sortKey, setSortKey] = useState(initialSort.sortKey)
  const [sortDirection, setSortDirection] = useState(initialSort.sortDirection)

  useEffect(() => {
    const currentUserId = getCurrentUserId()
    if (currentUserId !== lastUserIdRef.current) {
      lastUserIdRef.current = currentUserId
      const sk = getStorageKey()
      const newColumnOrder = computeColumnOrder(sk, stableColumnIds)
      const newHiddenColumns = computeHiddenColumns(sk, stableColumnIds)
      const newSort = computeSort(sk, stableColumnIds, columns, defaultSortKey, defaultSortDirection)
      setColumnOrderState((prev) => arraysEqual(prev, newColumnOrder) ? prev : newColumnOrder)
      setHiddenColumnsState((prev) => arraysEqual(prev, newHiddenColumns) ? prev : newHiddenColumns)
      setSortKey((prevKey) => (prevKey === newSort.sortKey ? prevKey : newSort.sortKey))
      setSortDirection((prevDir) => (prevDir === newSort.sortDirection ? prevDir : newSort.sortDirection))
    }
  }, [stableColumnIds, columns, defaultSortKey, defaultSortDirection, getStorageKey, computeColumnOrder, computeHiddenColumns, computeSort])

  useEffect(() => {
    setColumnOrderState((prev) => {
      const filteredPrev = prev.filter((id) => stableColumnIds.includes(id))
      const merged = [...stableColumnIds.filter((id) => !prev.includes(id))]
      const next = [...filteredPrev, ...merged]
      return arraysEqual(prev, next) ? prev : next
    })
    setHiddenColumnsState((prev) => {
      const next = prev.filter((id) => stableColumnIds.includes(id))
      return arraysEqual(prev, next) ? prev : next
    })
  }, [stableColumnIds])

  useEffect(() => {
    if (!storageKey) return
    writeStorage(`${storageKey}:columnOrder`, columnOrder)
  }, [storageKey, columnOrder])

  useEffect(() => {
    if (!storageKey) return
    writeStorage(`${storageKey}:hiddenColumns`, hiddenColumns)
  }, [storageKey, hiddenColumns])

  useEffect(() => {
    if (!storageKey) return
    writeStorage(`${storageKey}:sort`, { sortKey, sortDirection })
  }, [storageKey, sortKey, sortDirection])

  const columnMetaById = useMemo(() => {
    const map = new Map()
    columns.forEach((c) => {
      const id = c.id || c.key || c.accessor
      map.set(id, c)
    })
    return map
  }, [columns])

  const orderedColumns = useMemo(() => {
    return columnOrder
      .map((id) => columnMetaById.get(id))
      .filter(Boolean)
  }, [columnOrder, columnMetaById])

  const visibleColumns = useMemo(() => {
    return orderedColumns.filter((c) => {
      const id = c.id || c.key || c.accessor
      if (c.required) return true
      return !hiddenColumns.includes(id)
    })
  }, [orderedColumns, hiddenColumns])

  const setColumnOrder = useCallback((newOrder) => {
    setColumnOrderState((prev) => arraysEqual(prev, newOrder) ? prev : newOrder)
  }, [])

  const moveColumn = useCallback((fromIndex, toIndex) => {
    setColumnOrderState((prev) => {
      if (!Array.isArray(prev) || fromIndex === toIndex) return prev
      if (fromIndex < 0 || fromIndex >= prev.length) return prev
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      if (moved === undefined) return prev
      next.splice(toIndex, 0, moved)
      return arraysEqual(prev, next) ? prev : next
    })
  }, [])

  const toggleColumnVisibility = useCallback((columnId) => {
    setHiddenColumnsState((prev) => {
      const meta = columnMetaById.get(columnId)
      if (meta?.required) return prev
      if (prev.includes(columnId)) {
        const next = prev.filter((id) => id !== columnId)
        return arraysEqual(prev, next) ? prev : next
      }
      const next = [...prev, columnId]
      return next
    })
  }, [columnMetaById])

  const setColumnHidden = useCallback((columnId, hidden) => {
    setHiddenColumnsState((prev) => {
      const meta = columnMetaById.get(columnId)
      if (meta?.required) return prev
      if (hidden) {
        if (prev.includes(columnId)) return prev
        return [...prev, columnId]
      }
      const next = prev.filter((id) => id !== columnId)
      return arraysEqual(prev, next) ? prev : next
    })
  }, [columnMetaById])

  const toggleSort = useCallback((key) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDirection((prevDir) => {
          if (prevDir === 'asc') return 'desc'
          if (prevDir === 'desc') return null
          return 'asc'
        })
        return prevKey
      }
      setSortDirection('asc')
      return key
    })
  }, [])

  const setSort = useCallback((key, direction) => {
    setSortKey((prevKey) => (prevKey === key ? prevKey : key))
    setSortDirection((prevDir) => {
      const nextDir = direction || 'asc'
      return prevDir === nextDir ? prevDir : nextDir
    })
  }, [])

  const getSortDirectionFor = useCallback((key) => {
    if (sortKey !== key) return null
    return sortDirection || null
  }, [sortKey, sortDirection])

  const sortedData = useMemo(() => {
    if (!sortKey || !sortDirection || !Array.isArray(data)) return data
    const meta = columnMetaById.get(sortKey)
      || columns.find((c) => (c.key || c.accessor) === sortKey)
    const accessor = meta?.accessor || sortKey
    const customComparer = meta?.sortComparer
    const isDate = meta?.sortType === 'date'

    const getValue = (row) => {
      if (typeof accessor === 'function') return accessor(row, meta)
      return row?.[accessor]
    }

    return [...data].sort((a, b) => {
      const va = getValue(a)
      const vb = getValue(b)
      let cmp = 0
      if (typeof customComparer === 'function') {
        cmp = customComparer(va, vb, a, b)
      } else if (isDate) {
        cmp = dateCompare(va, vb)
      } else {
        cmp = naturalCompare(va, vb)
      }
      return sortDirection === 'desc' ? -cmp : cmp
    })
  }, [data, sortKey, sortDirection, columnMetaById, columns])

  const resetTableSettings = useCallback(() => {
    setColumnOrderState((prev) => arraysEqual(prev, stableColumnIds) ? prev : stableColumnIds)
    setHiddenColumnsState((prev) => (prev.length === 0 ? prev : []))
    setSortKey((prevKey) => {
      const desiredKey = defaultSortKey || null
      return prevKey === desiredKey ? prevKey : desiredKey
    })
    setSortDirection((prevDir) => {
      const desiredDir = defaultSortKey ? defaultSortDirection : 'asc'
      return prevDir === desiredDir ? prevDir : desiredDir
    })
    if (storageKey) {
      localStorage.removeItem(`${storageKey}:columnOrder`)
      localStorage.removeItem(`${storageKey}:hiddenColumns`)
      localStorage.removeItem(`${storageKey}:sort`)
    }
  }, [storageKey, stableColumnIds, defaultSortKey, defaultSortDirection])

  return {
    sortedData,
    orderedColumns,
    visibleColumns,
    columnOrder,
    hiddenColumns,
    sortKey,
    sortDirection,
    getSortDirectionFor,
    toggleSort,
    setSort,
    moveColumn,
    setColumnOrder,
    toggleColumnVisibility,
    setColumnHidden,
    resetTableSettings
  }
}
