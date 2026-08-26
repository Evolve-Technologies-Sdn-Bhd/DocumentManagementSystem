import React, { useEffect, useMemo, useState } from 'react'
import api from '../api/axios'
import { hasPermission } from '../utils/permissions'
import PageHeader from './ui/PageHeader'
import AppSurface from './ui/AppSurface'
import Button from './ui/Button'
import TextInput from './ui/TextInput'
import SelectField from './ui/SelectField'
import InlineSpinner from './ui/InlineSpinner'
import EmptyPanelState from './ui/EmptyPanelState'
import Pagination from './Pagination'
import StatusBadge from './StatusBadge'
import ConfirmModal from './ConfirmModal'
import ActionMenu from './ActionMenu'
import ColumnSettingsButton from './ui/ColumnSettingsButton'
import { TableContainer, Table, Th, Td, Tr } from './ui/Table'
import TenderEntryModal from './TenderEntryModal'
import TenderFollowUpModal from './TenderFollowUpModal'
import CrmImportModal from './CrmImportModal'
import useTableFeatures from '../hooks/useTableFeatures'

const statusOptions = [
  { value: 'all', label: 'All statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'KIV', label: 'KIV' },
  { value: 'WON', label: 'Won' },
  { value: 'LOST', label: 'Lost' }
]

export default function TenderBookRegister() {
  const canCreate = hasPermission('crm.tenderBook', 'create')
  const canUpdate = hasPermission('crm.tenderBook', 'update')
  const canDelete = hasPermission('crm.tenderBook', 'delete')
  const canImport = hasPermission('crm.tenderBook', 'import')
  const canExport = hasPermission('crm.tenderBook', 'export')

  const [filters, setFilters] = useState({
    status: 'all',
    tenderRefNo: '',
    title: '',
    clientName: '',
    contactPerson: '',
    source: '',
    submissionDeadlineFrom: '',
    submissionDeadlineTo: ''
  })
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(15)
  const [total, setTotal] = useState(0)
  const [records, setRecords] = useState([])
  const [summary, setSummary] = useState({
    totalEntries: 0,
    inProgress: 0,
    won: 0,
    lost: 0,
    totalTenderValueCents: 0,
    totalEstimatedProfitCents: 0
  })

  const [loading, setLoading] = useState(false)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportFormat, setExportFormat] = useState('xlsx')
  const [errorMessage, setErrorMessage] = useState('')

  const [entryModal, setEntryModal] = useState({ open: false, entry: null })
  const [followUpModal, setFollowUpModal] = useState({ open: false, entry: null })
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null })
  const [dragColIndex, setDragColIndex] = useState(null)
  const [dragOverColIndex, setDragOverColIndex] = useState(null)

  const formatMoney = (cents) => {
    const amount = Number(cents || 0) / 100
    return `RM ${amount.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const loadRecords = async (nextFilters = filters, nextPage = page, nextLimit = limit) => {
    setLoading(true)
    setErrorMessage('')
    try {
      const res = await api.get('/crm/tender-book', {
        params: {
          ...nextFilters,
          page: nextPage,
          limit: nextLimit
        }
      })
      const data = res.data?.data || {}
      setRecords(Array.isArray(data.records) ? data.records : [])
      setTotal(Number(data.total || 0))
    } catch (error) {
      console.error('Failed to load tender entries:', error)
      setRecords([])
      setTotal(0)
      const serverMessage = error?.response?.data?.message
      setErrorMessage(serverMessage || 'Unable to load tender entries right now. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const loadSummary = async (nextFilters = filters) => {
    setSummaryLoading(true)
    try {
      const res = await api.get('/crm/tender-book/summary', { params: nextFilters })
      const data = res.data?.data || {}
      const nextSummary = data.summary || null
      if (nextSummary && typeof nextSummary === 'object') {
        setSummary({
          totalEntries: Number(nextSummary.totalEntries || 0),
          inProgress: Number(nextSummary.inProgress || 0),
          won: Number(nextSummary.won || 0),
          lost: Number(nextSummary.lost || 0),
          totalTenderValueCents: Number(nextSummary.totalTenderValueCents || 0),
          totalEstimatedProfitCents: Number(nextSummary.totalEstimatedProfitCents || 0)
        })
      }
    } catch (error) {
      console.error('Failed to load tender summary:', error)
    } finally {
      setSummaryLoading(false)
    }
  }

  useEffect(() => {
    loadRecords()
  }, [page, limit])

  useEffect(() => {
    loadSummary()
  }, [])

  const applyFilters = () => {
    setPage(1)
    loadRecords(filters, 1, limit)
    loadSummary(filters)
  }

  const resetFilters = () => {
    const next = {
      status: 'all',
      tenderRefNo: '',
      title: '',
      clientName: '',
      contactPerson: '',
      source: '',
      submissionDeadlineFrom: '',
      submissionDeadlineTo: ''
    }
    setFilters(next)
    setPage(1)
    loadRecords(next, 1, limit)
    loadSummary(next)
  }

  const handleExport = async () => {
    setExporting(true)
    setErrorMessage('')
    try {
      const res = await api.get('/crm/tender-book/export', {
        params: {
          ...filters,
          format: exportFormat
        },
        responseType: 'blob'
      })
      const isXlsx = exportFormat === 'xlsx'
      const mime = isXlsx
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/csv'
      const url = window.URL.createObjectURL(new Blob([res.data], { type: mime }))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `tender_book_${new Date().toISOString().split('T')[0]}.${isXlsx ? 'xlsx' : 'csv'}`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to export tender book:', error)
      setErrorMessage('Export failed. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const parseCsv = (csvText) => {
    const parseCsvRow = (line) => {
      const input = String(line ?? '')
      const out = []
      let cur = ''
      let inQuotes = false
      for (let i = 0; i < input.length; i += 1) {
        const ch = input[i]
        if (ch === '"') {
          const next = input[i + 1]
          if (inQuotes && next === '"') {
            cur += '"'
            i += 1
          } else {
            inQuotes = !inQuotes
          }
          continue
        }
        if (ch === ',' && !inQuotes) {
          out.push(cur)
          cur = ''
          continue
        }
        cur += ch
      }
      out.push(cur)
      return out.map((v) => String(v ?? '').trim())
    }

    const lines = String(csvText || '')
      .replace(/^\uFEFF/, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .filter((l) => String(l || '').trim() !== '')
    if (lines.length <= 1) return []
    const header = parseCsvRow(lines[0]).map((h) => String(h || '').trim())

    const reconcileParts = (parts, headers) => {
      const tokens = Array.isArray(parts) ? parts.slice() : []
      const cols = Array.isArray(headers) ? headers : []
      if (tokens.length <= cols.length) {
        while (tokens.length < cols.length) tokens.push('')
        return tokens
      }

      const isNumericCandidate = (value) => {
        const raw = String(value ?? '').trim()
        if (!raw) return false
        const cleaned = raw.replace(/rm/ig, '').replace(/,/g, '').trim()
        return /^\d+(\.\d+)?$/.test(cleaned)
      }

      const numericCols = new Set(['tenderValueCents', 'estimatedProfitCents'])
      const out = []
      let remaining = tokens

      for (let colIndex = 0; colIndex < cols.length; colIndex += 1) {
        if (colIndex === cols.length - 1) {
          out.push(remaining.join(','))
          remaining = []
          break
        }

        const remainingCols = cols.length - colIndex
        const minLeftForRest = remainingCols - 1
        if (remaining.length <= minLeftForRest) {
          out.push(remaining.shift() || '')
          continue
        }

        const colName = cols[colIndex]
        if (numericCols.has(colName)) {
          const maxTake = Math.max(1, remaining.length - minLeftForRest)
          let bestTake = null
          for (let take = 1; take <= maxTake; take += 1) {
            const candidate = remaining.slice(0, take).join(',')
            if (isNumericCandidate(candidate)) bestTake = take
          }
          if (bestTake) {
            out.push(remaining.slice(0, bestTake).join(','))
            remaining = remaining.slice(bestTake)
            continue
          }
        }

        out.push(remaining.shift() || '')
      }

      while (out.length < cols.length) out.push('')
      return out.slice(0, cols.length)
    }

    const idx = (name) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase())
    const titleIdx = idx('title')
    if (titleIdx < 0) return []
    const clientIdx = idx('clientName')
    const contactIdx = idx('contactPerson')
    const deadlineIdx = idx('submissionDeadline')
    const statusIdx = idx('status')
    const tenderIdx = idx('tenderValueCents')
    const profitIdx = idx('estimatedProfitCents')
    const sourceIdx = idx('source')
    const documentIdx = idx('documentLink')
    const followUpIdx = idx('followUpNotes')

    return lines.slice(1).map((line) => {
      const rawParts = parseCsvRow(line)
      const parts = rawParts.length === header.length ? rawParts : reconcileParts(rawParts, header)
      return {
        title: parts[titleIdx] || '',
        clientName: clientIdx >= 0 ? (parts[clientIdx] || '') : '',
        contactPerson: contactIdx >= 0 ? (parts[contactIdx] || '') : '',
        submissionDeadline: deadlineIdx >= 0 ? (parts[deadlineIdx] || '') : '',
        status: statusIdx >= 0 ? (parts[statusIdx] || 'DRAFT') : 'DRAFT',
        tenderValueCents: tenderIdx >= 0 ? (parts[tenderIdx] || '') : '',
        estimatedProfitCents: profitIdx >= 0 ? (parts[profitIdx] || '') : '',
        source: sourceIdx >= 0 ? (parts[sourceIdx] || '') : '',
        documentLink: documentIdx >= 0 ? (parts[documentIdx] || '') : '',
        followUpNotes: followUpIdx >= 0 ? (parts[followUpIdx] || '') : ''
      }
    }).filter((row) => String(row.title || '').trim())
  }

  const handleImportClick = () => {
    setImportModalOpen(true)
  }

  const handleImportFile = async (file) => {
    if (!file) return
    const isXlsx = String(file.name || '').toLowerCase().endsWith('.xlsx')
    if (isXlsx) {
      setConfirmModal({
        show: true,
        title: 'Import Tender Entries',
        message: `Import entries from Excel file "${file.name}"?`,
        onConfirm: async () => {
          try {
            const formData = new FormData()
            formData.append('file', file)
            await api.post('/crm/tender-book/import-file', formData, {
              headers: { 'Content-Type': 'multipart/form-data' }
            })
            setImportModalOpen(false)
            setConfirmModal({ show: false })
            loadRecords(filters, page, limit)
            loadSummary(filters)
          } catch (error) {
            console.error('Failed to import tender entries:', error)
            const serverMessage = error?.response?.data?.message
            setConfirmModal({
              show: true,
              title: 'Import failed',
              message: serverMessage || 'Unable to import entries. Please try again.',
              onConfirm: null
            })
          }
        }
      })
      return
    }
    const text = await file.text()
    const parsed = parseCsv(text)
    if (parsed.length === 0) {
      setImportModalOpen(false)
      setConfirmModal({
        show: true,
        title: 'Import failed',
        message: 'CSV format not recognized. Required header: title. Optional: clientName,contactPerson,submissionDeadline,status,tenderValueCents,estimatedProfitCents,source,documentLink,followUpNotes.',
        onConfirm: null
      })
      return
    }

    setConfirmModal({
      show: true,
      title: 'Import Tender Entries',
      message: `Import ${parsed.length} entries from CSV?`,
      onConfirm: async () => {
        try {
          await api.post('/crm/tender-book/import', { entries: parsed })
          setImportModalOpen(false)
          setConfirmModal({ show: false })
          loadRecords(filters, page, limit)
          loadSummary(filters)
        } catch (error) {
          console.error('Failed to import tender entries:', error)
          const serverMessage = error?.response?.data?.message
          setConfirmModal({
            show: true,
            title: 'Import failed',
            message: serverMessage || 'Unable to import entries. Please try again.',
            onConfirm: null
          })
        }
      }
    })
  }

  const openCreate = () => setEntryModal({ open: true, entry: null })
  const openEdit = (entry) => setEntryModal({ open: true, entry })
  const openFollowUp = (entry) => setFollowUpModal({ open: true, entry })

  const handleDelete = (entry) => {
    setConfirmModal({
      show: true,
      title: 'Delete Entry',
      message: `Delete "${entry.title}"? This action cannot be undone.`,
      onConfirm: async () => {
        try {
          await api.delete(`/crm/tender-book/${entry.id}`)
          setConfirmModal({ show: false })
          loadRecords(filters, page, limit)
          loadSummary(filters)
        } catch (error) {
          console.error('Failed to delete tender entry:', error)
          setConfirmModal({
            show: true,
            title: 'Delete failed',
            message: 'Unable to delete entry. Please try again.',
            onConfirm: null
          })
        }
      }
    })
  }

  const handleSaved = () => {
    setEntryModal({ open: false, entry: null })
    setFollowUpModal({ open: false, entry: null })
    loadRecords(filters, page, limit)
    loadSummary(filters)
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setPage(1)
      loadRecords(filters, 1, limit)
      loadSummary(filters)
    }, 300)
    return () => window.clearTimeout(timeoutId)
  }, [
    filters.status,
    filters.tenderRefNo,
    filters.title,
    filters.clientName,
    filters.contactPerson,
    filters.source,
    filters.submissionDeadlineFrom,
    filters.submissionDeadlineTo
  ])

  const renderSummaryCard = (label, value, colorIndex = 0) => {
    const blueVariants = [
      { bg: '!bg-blue-50', border: '!border-blue-200' },
      { bg: '!bg-sky-50', border: '!border-sky-200' },
      { bg: '!bg-indigo-50', border: '!border-indigo-200' },
      { bg: '!bg-cyan-50', border: '!border-cyan-200' },
      { bg: '!bg-blue-100', border: '!border-blue-300' }
    ]
    const c = blueVariants[colorIndex % blueVariants.length]
    return (
      <AppSurface padding="lg" className={`border ${c.border} ${c.bg} transition-all duration-200 hover:shadow-md rounded-dms`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</p>
        <p className="mt-2 text-3xl font-semibold text-ink">{value}</p>
      </AppSurface>
    )
  }

  const tenderTableColumns = useMemo(() => {
    const cols = [
      {
        id: 'no',
        key: 'no',
        accessor: '__no',
        label: 'No.',
        className: 'w-16 whitespace-nowrap',
        sortable: false,
        required: true,
        render: (_v, _row, index) => (page - 1) * limit + index + 1
      },
      {
        id: 'tenderRefNo',
        key: 'tenderRefNo',
        accessor: 'tenderRefNo',
        label: 'Ref',
        className: 'w-28 whitespace-nowrap',
        sortable: true,
        render: (value) => <span>{value || '-'}</span>
      },
      {
        id: 'clientName',
        key: 'clientName',
        accessor: 'clientName',
        label: 'Client',
        className: 'w-40 whitespace-nowrap',
        sortable: true,
        render: (value) => <span>{value || '-'}</span>
      },
      {
        id: 'title',
        key: 'title',
        accessor: 'title',
        label: 'Title',
        className: 'min-w-[260px]',
        sortable: true,
        required: true,
        render: (value) => <span className="font-semibold text-ink whitespace-normal">{value}</span>
      },
      {
        id: 'contactPerson',
        key: 'contactPerson',
        accessor: 'contactPerson',
        label: 'Contact',
        className: 'w-40 whitespace-nowrap',
        sortable: true,
        render: (value) => <span>{value || '-'}</span>
      },
      {
        id: 'submissionDeadline',
        key: 'submissionDeadline',
        accessor: 'submissionDeadline',
        label: 'Deadline',
        className: 'w-32 whitespace-nowrap',
        sortable: true,
        sortType: 'date',
        sortComparer: (a, b) => new Date(a || 0) - new Date(b || 0),
        render: (value) => <span>{value ? new Date(value).toLocaleDateString('en-GB') : '-'}</span>
      },
      {
        id: 'status',
        key: 'status',
        accessor: 'status',
        label: 'Status',
        className: 'w-40 whitespace-nowrap',
        sortable: true,
        render: (_v, row) => <StatusBadge status={row.status} />
      },
      {
        id: 'tenderValueCents',
        key: 'tenderValueCents',
        accessor: 'tenderValueCents',
        label: 'Tender Value',
        className: 'w-40 whitespace-nowrap',
        sortable: true,
        align: 'right',
        render: (value) => <span>{formatMoney(value)}</span>
      },
      {
        id: 'estimatedProfitCents',
        key: 'estimatedProfitCents',
        accessor: 'estimatedProfitCents',
        label: 'Est. Profit',
        className: 'w-40 whitespace-nowrap',
        sortable: true,
        align: 'right',
        render: (value) => <span>{formatMoney(value)}</span>
      },
      {
        id: 'followUpNotes',
        key: 'followUpNotes',
        accessor: 'followUpNotes',
        label: 'Notes',
        className: 'min-w-[260px]',
        sortable: true,
        render: (value) => <span className="whitespace-normal">{value || '-'}</span>
      }
    ]
    if (canUpdate || canDelete) {
      cols.push({
        id: 'actions',
        key: 'actions',
        accessor: '__actions',
        label: '',
        className: 'w-16',
        required: true,
        align: 'right',
        stickyRight: true,
        render: (_v, row) => (
          <ActionMenu
            actions={[
              ...(canUpdate ? [{ label: 'Edit', onClick: () => openEdit(row) }] : []),
              ...(canUpdate ? [{ label: 'Update', onClick: () => openFollowUp(row), dividerAfter: true }] : []),
              ...(canDelete ? [{ label: 'Delete', onClick: () => handleDelete(row), variant: 'destructive' }] : [])
            ]}
          />
        )
      })
    }
    return cols
  }, [canUpdate, canDelete, formatMoney, page, limit])

  const tableFeatures = useTableFeatures({
    tableId: 'tender-book-register',
    columns: tenderTableColumns,
    data: records,
    defaultSortKey: 'id',
    defaultSortDirection: 'desc'
  })

  const {
    sortedData,
    visibleColumns,
    orderedColumns,
    getSortDirectionFor,
    toggleSort,
    moveColumn,
    hiddenColumns,
    toggleColumnVisibility,
    resetTableSettings
  } = tableFeatures

  const totalRows = sortedData.length
  const totalPages = useMemo(() => Math.max(Math.ceil(total / limit), 1), [total, limit])
  const startIndex = total > 0 ? (page - 1) * limit + 1 : 0
  const endIndex = total > 0 ? Math.min(page * limit, total) : 0
  const currentRecords = sortedData

  const handleColDragStart = (idx, e) => {
    const col = visibleColumns[idx]
    if (!col || col.stickyRight) { e.preventDefault(); return }
    setDragColIndex(idx)
    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(idx)) } catch {}
  }
  const handleColDragOver = (idx, e) => {
    e.preventDefault()
    const col = visibleColumns[idx]
    if (!col || col.stickyRight) return
    setDragOverColIndex(idx)
  }
  const handleColDragLeave = () => setDragOverColIndex(null)
  const handleColDrop = (toIdx, e) => {
    e.preventDefault()
    const fromIdx = dragColIndex
    setDragColIndex(null)
    setDragOverColIndex(null)
    if (fromIdx === null || toIdx === null || fromIdx === toIdx) return
    const fromId = visibleColumns[fromIdx]?.id
    const toId = visibleColumns[toIdx]?.id
    if (!fromId || !toId) return
    const globalFrom = orderedColumns.findIndex((c) => c.id === fromId)
    const globalTo = orderedColumns.findIndex((c) => c.id === toId)
    if (globalFrom >= 0 && globalTo >= 0) moveColumn(globalFrom, globalTo)
  }
  const handleColDragEnd = () => { setDragColIndex(null); setDragOverColIndex(null) }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tender Book Register"
        subtitle="Track tender submissions, status progress, and outcomes"
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        {renderSummaryCard('Total Entries', summaryLoading ? '...' : summary.totalEntries, 0)}
        {renderSummaryCard('In Progress', summaryLoading ? '...' : summary.inProgress, 1)}
        {renderSummaryCard('Won', summaryLoading ? '...' : summary.won, 2)}
        {renderSummaryCard('Total Tender Value', summaryLoading ? '...' : formatMoney(summary.totalTenderValueCents), 3)}
        {renderSummaryCard('Est. Total Profit', summaryLoading ? '...' : formatMoney(summary.totalEstimatedProfitCents), 4)}
      </div>

      {errorMessage && (
        <AppSurface padding="md" className="border border-[var(--dms-color-border-default)] bg-[var(--dms-color-danger-soft)] text-[var(--dms-color-danger-ink)]">
          <div className="text-sm font-semibold">{errorMessage}</div>
        </AppSurface>
      )}

      <AppSurface padding="lg" className="space-y-4">
        {/* Row 1: 4 equal columns — Tender Ref | Client | Title | Contact */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="min-w-0">
            <TextInput
              value={filters.tenderRefNo}
              placeholder="Tender Ref"
              onChange={(e) => setFilters((prev) => ({ ...prev, tenderRefNo: e.target.value }))}
            />
          </div>
          <div className="min-w-0">
            <TextInput
              value={filters.clientName}
              placeholder="Client"
              onChange={(e) => setFilters((prev) => ({ ...prev, clientName: e.target.value }))}
            />
          </div>
          <div className="min-w-0">
            <TextInput
              value={filters.title}
              placeholder="Title"
              onChange={(e) => setFilters((prev) => ({ ...prev, title: e.target.value }))}
            />
          </div>
          <div className="min-w-0">
            <TextInput
              value={filters.contactPerson}
              placeholder="Contact"
              onChange={(e) => setFilters((prev) => ({ ...prev, contactPerson: e.target.value }))}
            />
          </div>
        </div>

        {/* Row 2: 4 equal columns — Source | Deadline From | Deadline To | Status */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="min-w-0">
            <TextInput
              value={filters.source}
              placeholder="Source"
              onChange={(e) => setFilters((prev) => ({ ...prev, source: e.target.value }))}
            />
          </div>
          <div className="min-w-0">
            <TextInput
              type="date"
              value={filters.submissionDeadlineFrom}
              placeholder="Deadline From"
              onChange={(e) => setFilters((prev) => ({ ...prev, submissionDeadlineFrom: e.target.value }))}
            />
          </div>
          <div className="min-w-0">
            <TextInput
              type="date"
              value={filters.submissionDeadlineTo}
              placeholder="Deadline To"
              onChange={(e) => setFilters((prev) => ({ ...prev, submissionDeadlineTo: e.target.value }))}
            />
          </div>
          <div className="min-w-0">
            <SelectField value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}>
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </SelectField>
          </div>
        </div>

        {/* Row 3: Action buttons aligned cleanly right, with Reset left-most */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 pt-1">
          <div className="flex flex-wrap gap-2 lg:ml-auto">
            <Button variant="secondary" onClick={resetFilters}>
              Reset
            </Button>
            {canImport && (
              <Button variant="secondary" onClick={handleImportClick}>
                Import Excel/CSV
              </Button>
            )}
            {canExport && (
              <div className="flex items-center gap-2">
                <div className="w-28 shrink-0">
                  <SelectField
                    className="h-9 rounded-2xl"
                    value={exportFormat}
                    onChange={(e) => setExportFormat(e.target.value)}
                  >
                    <option value="xlsx">Excel</option>
                    <option value="csv">CSV</option>
                  </SelectField>
                </div>
                <Button variant="secondary" onClick={handleExport} loading={exporting} loadingText="Exporting...">
                  Export
                </Button>
              </div>
            )}
            {canCreate && <Button onClick={openCreate}>Add New Tender</Button>}
          </div>
        </div>
      </AppSurface>

      <AppSurface padding="none" className="overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-muted">
          <div className="text-sm text-ink-muted">
            {!loading && total > 0 && (
              <span>Showing {startIndex}-{endIndex} of {total}</span>
            )}
          </div>
          <ColumnSettingsButton
            orderedColumns={orderedColumns}
            hiddenColumns={hiddenColumns}
            onToggleColumn={toggleColumnVisibility}
            onReset={resetTableSettings}
          />
        </div>
        <TableContainer>
          <Table className="divide-y divide-border">
            <thead className="bg-surface-muted">
              <Tr className="!hover:bg-surface-muted">
                {visibleColumns.map((col, idx) => {
                  const id = col.id || col.key
                  const canDrag = !col.stickyRight
                  const isDragOver = canDrag && dragOverColIndex === idx
                  return (
                    <Th
                      key={id}
                      className={col.className || ''}
                      align={col.align || 'left'}
                      stickyRight={col.stickyRight || false}
                      sortable={Boolean(col.sortable)}
                      sortDirection={getSortDirectionFor(id)}
                      sortKey={id}
                      onSort={col.sortable ? toggleSort : undefined}
                      draggable={canDrag}
                      dragOver={isDragOver}
                      onDragStart={(e) => handleColDragStart(idx, e)}
                      onDragOver={(e) => handleColDragOver(idx, e)}
                      onDragLeave={handleColDragLeave}
                      onDrop={(e) => handleColDrop(idx, e)}
                      onDragEnd={handleColDragEnd}
                      title={canDrag ? 'Click to sort • Drag to reorder' : col.sortable ? 'Click to sort' : undefined}
                    >
                      {col.label || col.header || id}
                    </Th>
                  )
                })}
              </Tr>
            </thead>
            <tbody className="bg-surface divide-y divide-border">
              {loading ? (
                <Tr className="!hover:bg-surface">
                  <td colSpan={Math.max(visibleColumns.length, 1)} className="px-4 py-10 text-center">
                    <InlineSpinner className="mx-auto h-5 w-5 border-border border-t-brand" />
                  </td>
                </Tr>
              ) : sortedData.length === 0 ? (
                <Tr className="!hover:bg-surface">
                  <td colSpan={Math.max(visibleColumns.length, 1)} className="px-4 py-8">
                    <EmptyPanelState title="No entries yet" description='Log the first one with "Add New Tender".' />
                  </td>
                </Tr>
              ) : (
                currentRecords.map((row, index) => (
                  <Tr key={row.id}>
                    {visibleColumns.map((col) => {
                      const id = col.id || col.key || col.accessor
                      const accessor = col.accessor || id
                      let value
                      if (typeof accessor === 'function') {
                        value = accessor(row, col)
                      } else if (accessor === '__actions' || accessor === '__no') {
                        value = null
                      } else {
                        value = row?.[accessor]
                      }
                      const content = typeof col.render === 'function' ? col.render(value, row, index) : (value != null ? value : '')
                      return (
                        <Td
                          key={id}
                          className={col.className || ''}
                          align={col.align || 'left'}
                          stickyRight={col.stickyRight || false}
                        >
                          {content}
                        </Td>
                      )
                    })}
                  </Tr>
                ))
              )}
            </tbody>
          </Table>
        </TableContainer>

        {!loading && total > 0 && (
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalRecords={total}
            pageSize={limit}
            pageSizeOptions={[5, 10, 15, 20, 50]}
            onPageChange={setPage}
            onPageSizeChange={(next) => {
              setLimit(next)
              setPage(1)
            }}
          />
        )}
      </AppSurface>

      <TenderEntryModal
        open={entryModal.open}
        entry={entryModal.entry}
        onClose={() => setEntryModal({ open: false, entry: null })}
        onSaved={handleSaved}
      />

      <TenderFollowUpModal
        open={followUpModal.open}
        entry={followUpModal.entry}
        onClose={() => setFollowUpModal({ open: false, entry: null })}
        onSaved={handleSaved}
      />

      <CrmImportModal
        open={importModalOpen}
        title="Import Tender Entries"
        subtitle="Upload an Excel file using the approved tender template."
        templateDownloadUrl="/crm/tender-book/template"
        templateDownloadFileName="tender_book_template.xlsx"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.csv,text/csv"
        templateHeaders={[
          'title',
          'clientName',
          'contactPerson',
          'submissionDeadline',
          'status',
          'tenderValueCents',
          'estimatedProfitCents',
          'source',
          'documentLink',
          'followUpNotes'
        ]}
        templateSampleRow={[
          'Office Fit-out Package 3',
          'ABC Sdn Bhd',
          'John Tan',
          '2026-08-15',
          'DRAFT',
          '5000000',
          '750000',
          '',
          '',
          ''
        ]}
        requiredFields={['title']}
        optionalFields={['clientName', 'contactPerson', 'submissionDeadline', 'status', 'tenderValueCents', 'estimatedProfitCents', 'source', 'documentLink', 'followUpNotes']}
        onClose={() => setImportModalOpen(false)}
        onImportFile={handleImportFile}
      />

      <ConfirmModal
        show={confirmModal.show}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={() => {
          const fn = confirmModal.onConfirm
          if (!fn) {
            setConfirmModal({ show: false })
            return
          }
          fn()
        }}
        onCancel={() => setConfirmModal({ show: false })}
        confirmText={confirmModal.onConfirm ? 'Confirm' : 'OK'}
        cancelText={confirmModal.onConfirm ? 'Cancel' : 'Close'}
        type={confirmModal.onConfirm ? 'warning' : 'info'}
      />
    </div>
  )
}
