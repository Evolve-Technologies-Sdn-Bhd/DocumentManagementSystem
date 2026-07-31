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
import { TableContainer, Table, Th, Td, Tr } from './ui/Table'
import TenderEntryModal from './TenderEntryModal'
import CrmImportModal from './CrmImportModal'

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

  const [filters, setFilters] = useState({ search: '', status: 'all' })
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
  const [errorMessage, setErrorMessage] = useState('')

  const [entryModal, setEntryModal] = useState({ open: false, entry: null })
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null })

  const totalPages = useMemo(() => Math.max(Math.ceil(total / limit), 1), [total, limit])

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
      setErrorMessage('Unable to load tender entries right now. Please try again.')
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
    const next = { search: '', status: 'all' }
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
        params: filters,
        responseType: 'blob'
      })
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `tender_book_${new Date().toISOString().split('T')[0]}.csv`)
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
      const parts = parseCsvRow(line)
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
  }, [filters.search, filters.status])

  const renderSummaryCard = (label, value, subLabel = null) => (
    <AppSurface padding="md" className="border border-border">
      <div className="text-[11px] font-semibold text-ink-soft">{label}</div>
      <div className="mt-1 text-xl font-semibold text-ink">{value}</div>
      {subLabel && <div className="mt-1 text-xs text-ink-muted">{subLabel}</div>}
    </AppSurface>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tender Book Register"
        subtitle="Track tender submissions, status progress, and outcomes"
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {renderSummaryCard('Total Entries', summaryLoading ? '...' : summary.totalEntries)}
        {renderSummaryCard('In Progress', summaryLoading ? '...' : summary.inProgress)}
        {renderSummaryCard('Won', summaryLoading ? '...' : summary.won)}
        {renderSummaryCard('Total Tender Value', summaryLoading ? '...' : formatMoney(summary.totalTenderValueCents))}
        {renderSummaryCard('Est. Total Profit', summaryLoading ? '...' : formatMoney(summary.totalEstimatedProfitCents))}
      </div>

      {errorMessage && (
        <AppSurface padding="md" className="border border-[var(--dms-color-border-default)] bg-[var(--dms-color-danger-soft)] text-[var(--dms-color-danger-ink)]">
          <div className="text-sm font-semibold">{errorMessage}</div>
        </AppSurface>
      )}

      <AppSurface padding="lg" className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex-1">
            <TextInput
              value={filters.search}
              placeholder="Search..."
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
            />
          </div>
          <div className="w-full lg:w-60">
            <SelectField value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}>
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </SelectField>
          </div>
          <div className="flex gap-2 lg:ml-auto">
            {canImport && (
              <Button variant="secondary" onClick={handleImportClick}>
                Import Excel/CSV
              </Button>
            )}
            {canCreate && <Button onClick={openCreate}>Add New Tender</Button>}
          </div>
        </div>
      </AppSurface>

      <TableContainer>
        <Table>
          <thead>
            <tr>
              <Th>No.</Th>
              <Th>Ref</Th>
              <Th>Client</Th>
              <Th>Title</Th>
              <Th>Contact</Th>
              <Th>Deadline</Th>
              <Th>Status</Th>
              <Th align="right">Tender Value</Th>
              <Th align="right">Est. Profit</Th>
              <Th>Notes</Th>
              {(canUpdate || canDelete) && <Th align="right">Actions</Th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <Tr>
                <Td colSpan={(canUpdate || canDelete) ? 11 : 10} className="py-10 text-center">
                  <InlineSpinner className="mx-auto h-5 w-5 border-border border-t-brand" />
                </Td>
              </Tr>
            ) : records.length === 0 ? (
              <Tr>
                <Td colSpan={(canUpdate || canDelete) ? 11 : 10} className="py-8">
                  <EmptyPanelState
                    title="No entries yet"
                    description='Log the first one with "Add New Tender".'
                  />
                </Td>
              </Tr>
            ) : (
              records.map((row) => (
                <Tr key={row.id}>
                  <Td>{row.id}</Td>
                  <Td>{row.tenderRefNo || '-'}</Td>
                  <Td>{row.clientName || '-'}</Td>
                  <Td className="font-semibold text-ink">{row.title}</Td>
                  <Td>{row.contactPerson || '-'}</Td>
                  <Td>{row.submissionDeadline ? new Date(row.submissionDeadline).toLocaleDateString('en-GB') : '-'}</Td>
                  <Td><StatusBadge status={row.status} /></Td>
                  <Td align="right">{formatMoney(row.tenderValueCents)}</Td>
                  <Td align="right">{formatMoney(row.estimatedProfitCents)}</Td>
                  <Td>{row.followUpNotes || '-'}</Td>
                  {(canUpdate || canDelete) && (
                    <Td align="right">
                      <div className="flex justify-end gap-2">
                        {canUpdate && (
                          <Button size="sm" variant="secondary" onClick={() => openEdit(row)}>
                            Edit
                          </Button>
                        )}
                        {canDelete && (
                          <Button size="sm" variant="danger" onClick={() => handleDelete(row)}>
                            Delete
                          </Button>
                        )}
                      </div>
                    </Td>
                  )}
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      </TableContainer>

      <div className="flex items-center justify-between">
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-muted">Rows</span>
          <SelectField
            className="h-9 w-20 rounded-2xl"
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value))
              setPage(1)
            }}
          >
            {[5, 10, 15, 20, 50].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </SelectField>
        </div>
      </div>

      <TenderEntryModal
        open={entryModal.open}
        entry={entryModal.entry}
        onClose={() => setEntryModal({ open: false, entry: null })}
        onSaved={handleSaved}
      />

      <CrmImportModal
        open={importModalOpen}
        title="Import Tender Entries"
        subtitle="Upload a CSV file using the approved tender template."
        templateDownloadFileName="tender_book_template.csv"
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
