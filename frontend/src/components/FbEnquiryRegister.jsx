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
import FbEnquiryEntryModal from './FbEnquiryEntryModal'
import FbEnquiryFollowUpModal from './FbEnquiryFollowUpModal'
import CrmImportModal from './CrmImportModal'
import ColumnSettingsButton from './ui/ColumnSettingsButton'
import { TableContainer, Table, Th, Td, Tr } from './ui/Table'
import useTableFeatures from '../hooks/useTableFeatures'

const statusOptions = [
  { value: 'all', label: 'All statuses' },
  { value: 'NEW', label: 'New' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'FOLLOW_UP', label: 'Follow Up' },
  { value: 'NO_RESPONSE', label: 'No Response' },
  { value: 'QUOTATION_ISSUED', label: 'Quotation Issued' }
]

export default function FbEnquiryRegister() {
  const canCreate = hasPermission('crm.fbEnquiry', 'create')
  const canUpdate = hasPermission('crm.fbEnquiry', 'update')
  const canDelete = hasPermission('crm.fbEnquiry', 'delete')
  const canImport = hasPermission('crm.fbEnquiry', 'import')
  const canExport = hasPermission('crm.fbEnquiry', 'export')

  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    name: '',
    email: '',
    company: '',
    contact: '',
    address: '',
    state: '',
    interestedProduct: ''
  })
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(15)
  const [total, setTotal] = useState(0)
  const [records, setRecords] = useState([])
  const [summary, setSummary] = useState({
    totalEntries: 0,
    newEntries: 0,
    inPipeline: 0,
    quotationIssued: 0,
    noResponse: 0
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

  const loadRecords = async (nextFilters = filters, nextPage = page, nextLimit = limit) => {
    setLoading(true)
    setErrorMessage('')
    try {
      const res = await api.get('/crm/fb-enquiries', {
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
      console.error('Failed to load FB enquiries:', error)
      setRecords([])
      setTotal(0)
      const serverMessage = error?.response?.data?.message
      setErrorMessage(serverMessage || 'Unable to load enquiries right now. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const loadSummary = async (nextFilters = filters) => {
    setSummaryLoading(true)
    try {
      const res = await api.get('/crm/fb-enquiries/summary', { params: nextFilters })
      const data = res.data?.data || {}
      const nextSummary = data.summary || null
      if (nextSummary && typeof nextSummary === 'object') {
        setSummary({
          totalEntries: Number(nextSummary.totalEntries || 0),
          newEntries: Number(nextSummary.newEntries || 0),
          inPipeline: Number(nextSummary.inPipeline || 0),
          quotationIssued: Number(nextSummary.quotationIssued || 0),
          noResponse: Number(nextSummary.noResponse || 0)
        })
      }
    } catch (error) {
      console.error('Failed to load enquiry summary:', error)
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
      search: '',
      status: 'all',
      name: '',
      email: '',
      company: '',
      contact: '',
      address: '',
      state: '',
      interestedProduct: ''
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
      const res = await api.get('/crm/fb-enquiries/export', {
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
      link.setAttribute('download', `fb_enquiries_${new Date().toISOString().split('T')[0]}.${isXlsx ? 'xlsx' : 'csv'}`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to export enquiries:', error)
      setErrorMessage('Export failed. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const parseCsv = (csvText) => {
    const lines = String(csvText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(Boolean)
    if (lines.length <= 1) return []
    const header = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
    const idx = (name) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase())
    const contactIdx = idx('contact')
    const enquiryDateIdx = idx('enquiryDate')
    if (contactIdx < 0 || enquiryDateIdx < 0) return []
    const nameIdx = idx('name')
    const emailIdx = idx('email')
    const companyIdx = idx('company')
    const addressIdx = idx('address')
    const stateIdx = idx('state')
    const channelIdx = idx('channel')
    const industryTypeIdx = idx('industryType')
    const interestedProductIdx = idx('interestedProduct')
    const painPointIdx = idx('painPoint')
    const statusIdx = idx('status')
    const documentLinkIdx = idx('documentLink')

    return lines.slice(1).map((line) => {
      const parts = line.split(',').map((p) => p.trim().replace(/^"|"$/g, ''))
      return {
        contact: parts[contactIdx] || '',
        enquiryDate: parts[enquiryDateIdx] || '',
        name: nameIdx >= 0 ? (parts[nameIdx] || '') : '',
        email: emailIdx >= 0 ? (parts[emailIdx] || '') : '',
        company: companyIdx >= 0 ? (parts[companyIdx] || '') : '',
        address: addressIdx >= 0 ? (parts[addressIdx] || '') : '',
        state: stateIdx >= 0 ? (parts[stateIdx] || '') : '',
        channel: channelIdx >= 0 ? (parts[channelIdx] || '') : '',
        industryType: industryTypeIdx >= 0 ? (parts[industryTypeIdx] || '') : '',
        interestedProduct: interestedProductIdx >= 0 ? (parts[interestedProductIdx] || '') : '',
        painPoint: painPointIdx >= 0 ? (parts[painPointIdx] || '') : '',
        status: statusIdx >= 0 ? (parts[statusIdx] || 'NEW') : 'NEW',
        documentLink: documentLinkIdx >= 0 ? (parts[documentLinkIdx] || '') : '',
      }
    }).filter((row) => String(row.contact || '').trim() && String(row.enquiryDate || '').trim())
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
        title: 'Import Enquiry Entries',
        message: `Import entries from Excel file "${file.name}"?`,
        onConfirm: async () => {
          try {
            const formData = new FormData()
            formData.append('file', file)
            await api.post('/crm/fb-enquiries/import-file', formData, {
              headers: { 'Content-Type': 'multipart/form-data' }
            })
            setImportModalOpen(false)
            setConfirmModal({ show: false })
            loadRecords(filters, page, limit)
            loadSummary(filters)
          } catch (error) {
            console.error('Failed to import enquiries:', error)
            setConfirmModal({
              show: true,
              title: 'Import failed',
              message: 'Unable to import entries. Please try again.',
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
        message: 'CSV format not recognized. Required headers: contact,enquiryDate. Optional: status,name,email,company,address,state,channel,industryType,interestedProduct,painPoint,documentLink.',
        onConfirm: null
      })
      return
    }

    setConfirmModal({
      show: true,
      title: 'Import Enquiry Entries',
      message: `Import ${parsed.length} entries from CSV?`,
      onConfirm: async () => {
        try {
          await api.post('/crm/fb-enquiries/import', { entries: parsed })
          setImportModalOpen(false)
          setConfirmModal({ show: false })
          loadRecords(filters, page, limit)
          loadSummary(filters)
        } catch (error) {
          console.error('Failed to import enquiries:', error)
          setConfirmModal({
            show: true,
            title: 'Import failed',
            message: 'Unable to import entries. Please try again.',
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
      message: `Delete "${entry.contact}"? This action cannot be undone.`,
      onConfirm: async () => {
        try {
          await api.delete(`/crm/fb-enquiries/${entry.id}`)
          setConfirmModal({ show: false })
          loadRecords(filters, page, limit)
          loadSummary(filters)
        } catch (error) {
          console.error('Failed to delete enquiry entry:', error)
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
    filters.search,
    filters.status,
    filters.name,
    filters.email,
    filters.company,
    filters.contact,
    filters.address,
    filters.state,
    filters.interestedProduct
  ])

  const fbColumns = [
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
      id: 'month',
      key: 'enquiryDate',
      accessor: 'enquiryDate',
      label: 'Month',
      className: 'w-24 whitespace-nowrap',
      sortable: true,
      sortType: 'date',
      render: (value) => value ? new Date(value).toLocaleString('en-MY', { month: 'short', year: 'numeric' }) : '-'
    },
    {
      id: 'contact',
      key: 'contact',
      accessor: 'contact',
      label: 'Contact No.',
      className: 'w-40 whitespace-nowrap',
      sortable: true,
      required: true,
      render: (value) => <span className="font-semibold text-ink">{value}</span>
    },
    {
      id: 'name',
      key: 'name',
      accessor: 'name',
      label: 'Name',
      className: 'w-44 whitespace-nowrap',
      sortable: true,
      required: true,
      render: (value) => <span className="font-semibold text-ink">{value || '-'}</span>
    },
    {
      id: 'company',
      key: 'company',
      accessor: 'company',
      label: 'Company',
      className: 'w-44 whitespace-nowrap',
      sortable: true,
      render: (value) => value || '-'
    },
    {
      id: 'address',
      key: 'address',
      accessor: 'address',
      label: 'Address',
      className: 'min-w-[320px]',
      sortable: true,
      render: (value) => <span className="whitespace-normal">{value || '-'}</span>
    },
    {
      id: 'state',
      key: 'state',
      accessor: 'state',
      label: 'State',
      className: 'w-36 whitespace-nowrap',
      sortable: true,
      render: (value) => value || '-'
    },
    {
      id: 'channel',
      key: 'channel',
      accessor: 'channel',
      label: 'Channel',
      className: 'w-44 whitespace-nowrap',
      sortable: true,
      render: (value) => value || '-'
    },
    {
      id: 'industryType',
      key: 'industryType',
      accessor: 'industryType',
      label: 'Industry',
      className: 'w-44 whitespace-nowrap',
      sortable: true,
      render: (value) => value || '-'
    },
    {
      id: 'interestedProduct',
      key: 'interestedProduct',
      accessor: 'interestedProduct',
      label: 'Interest',
      className: 'min-w-[220px] whitespace-nowrap',
      sortable: true,
      render: (value) => value || '-'
    },
    {
      id: 'painPoint',
      key: 'painPoint',
      accessor: 'painPoint',
      label: 'Pain Point',
      className: 'min-w-[260px]',
      sortable: true,
      render: (value) => <span className="whitespace-normal">{value || '-'}</span>
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
      id: 'tender',
      key: 'tender',
      accessor: 'tenderEntry',
      label: 'Tender',
      className: 'w-40 whitespace-nowrap',
      sortable: false,
      render: (value) => value?.tenderRefNo || '-'
    },
    ...((canUpdate || canDelete) ? [{
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
    }] : [])
  ]

  const tableFeatures = useTableFeatures({
    tableId: 'fb-enquiry-register',
    columns: fbColumns,
    data: records,
    defaultSortKey: 'enquiryDate',
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
  const totalPages = useMemo(() => Math.max(Math.ceil(totalRows / limit), 1), [totalRows, limit])
  const startIndex = (page - 1) * limit
  const endIndex = startIndex + limit
  const currentRecords = sortedData.slice(startIndex, endIndex)

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

  const renderSummaryCard = (label, value, colorIndex = 0) => {
    const blueVariants = [
      { bg: '!bg-blue-50', border: '!border-blue-200' },
      { bg: '!bg-sky-50', border: '!border-sky-200' },
      { bg: '!bg-indigo-50', border: '!border-indigo-200' },
      { bg: '!bg-cyan-50', border: '!border-cyan-200' }
    ]
    const c = blueVariants[colorIndex % blueVariants.length]
    return (
      <AppSurface padding="lg" className={`border ${c.border} ${c.bg} transition-all duration-200 hover:shadow-md rounded-dms`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</p>
        <p className="mt-2 text-3xl font-semibold text-ink">{value}</p>
      </AppSurface>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="FB Enquiry Register"
        subtitle="Track enquiries, pipeline progress, and conversion outcomes"
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {renderSummaryCard('Total Entries', summaryLoading ? '...' : summary.totalEntries, 0)}
        {renderSummaryCard('In Pipeline', summaryLoading ? '...' : summary.inPipeline, 1)}
        {renderSummaryCard('Quotation Issued', summaryLoading ? '...' : summary.quotationIssued, 2)}
        {renderSummaryCard('No Response', summaryLoading ? '...' : summary.noResponse, 3)}
      </div>

      {errorMessage && (
        <AppSurface padding="md" className="border border-[var(--dms-color-border-default)] bg-[var(--dms-color-danger-soft)] text-[var(--dms-color-danger-ink)]">
          <div className="text-sm font-semibold">{errorMessage}</div>
        </AppSurface>
      )}

      <AppSurface padding="lg" className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <TextInput
            value={filters.search}
            placeholder="Keyword..."
            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
          />
          <TextInput
            value={filters.contact}
            placeholder="Contact No."
            onChange={(e) => setFilters((prev) => ({ ...prev, contact: e.target.value }))}
          />
          <TextInput
            value={filters.name}
            placeholder="Name"
            onChange={(e) => setFilters((prev) => ({ ...prev, name: e.target.value }))}
          />
          <TextInput
            value={filters.email}
            placeholder="Email"
            onChange={(e) => setFilters((prev) => ({ ...prev, email: e.target.value }))}
          />
          <TextInput
            value={filters.company}
            placeholder="Company"
            onChange={(e) => setFilters((prev) => ({ ...prev, company: e.target.value }))}
          />
          <TextInput
            value={filters.address}
            placeholder="Address"
            onChange={(e) => setFilters((prev) => ({ ...prev, address: e.target.value }))}
          />
          <TextInput
            value={filters.state}
            placeholder="State"
            onChange={(e) => setFilters((prev) => ({ ...prev, state: e.target.value }))}
          />
          <TextInput
            value={filters.interestedProduct}
            placeholder="Interested Product"
            onChange={(e) => setFilters((prev) => ({ ...prev, interestedProduct: e.target.value }))}
          />
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="w-full lg:w-60">
            <SelectField value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}>
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </SelectField>
          </div>

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
                <SelectField
                  className="h-9 w-28 rounded-2xl"
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value)}
                >
                  <option value="xlsx">Excel</option>
                  <option value="csv">CSV</option>
                </SelectField>
                <Button variant="secondary" onClick={handleExport} loading={exporting} loadingText="Exporting...">
                  Export
                </Button>
              </div>
            )}
            {canCreate && <Button onClick={openCreate}>Add New Enquiry</Button>}
          </div>
        </div>
      </AppSurface>

      <AppSurface padding="none" className="overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-muted">
          <div className="text-sm text-ink-muted">
            {!loading && sortedData.length > 0 && (
              <span>Showing {startIndex + 1}-{Math.min(endIndex, sortedData.length)} of {sortedData.length}</span>
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
                    <EmptyPanelState title="No entries yet" description='Log the first one with "Add New Enquiry".' />
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

        {!loading && sortedData.length > 0 && (
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalRecords={sortedData.length}
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

      <FbEnquiryEntryModal
        open={entryModal.open}
        entry={entryModal.entry}
        onClose={() => setEntryModal({ open: false, entry: null })}
        onSaved={handleSaved}
      />

      <FbEnquiryFollowUpModal
        open={followUpModal.open}
        entry={followUpModal.entry}
        onClose={() => setFollowUpModal({ open: false, entry: null })}
        onSaved={handleSaved}
      />

      <CrmImportModal
        open={importModalOpen}
        title="Import FB Enquiries"
        subtitle="Upload an Excel or CSV file using the same template structure every time."
        accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
        chooseButtonLabel="Choose Excel/CSV"
        dropLabel="Drag & drop Excel/CSV file here"
        templateDownloadUrl="/crm/fb-enquiries/template"
        templateDownloadFileName="fb_enquiry_template.xlsx"
        templateHeaders={[
          'contact',
          'enquiryDate',
          'status',
          'name',
          'email',
          'company',
          'address',
          'state',
          'channel',
          'industryType',
          'interestedProduct',
          'painPoint',
          'documentLink'
        ]}
        templateSampleRow={[
          '0123456789',
          '2026-07-28',
          'NEW',
          'John Tan',
          'john@example.com',
          'ABC Sdn Bhd',
          'No 1, Jalan Example, Shah Alam',
          'Selangor',
          'Facebook Post/Ad',
          'Construction',
          'Document control service',
          'Need better document tracking',
          'https://example.com/reference'
        ]}
        requiredFields={['contact', 'enquiryDate']}
        optionalFields={['status', 'name', 'email', 'company', 'address', 'state', 'channel', 'industryType', 'interestedProduct', 'painPoint', 'documentLink']}
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
