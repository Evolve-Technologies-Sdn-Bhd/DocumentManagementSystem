import React, { useEffect, useMemo, useState } from 'react'
import api from '../api/axios'
import Pagination from './Pagination'
import StatusBadge from './StatusBadge'
import { hasPermission } from '../utils/permissions'
import PageHeader from './ui/PageHeader'
import AppSurface from './ui/AppSurface'
import Button from './ui/Button'
import TextInput from './ui/TextInput'
import InlineSpinner from './ui/InlineSpinner'
import EmptyPanelState from './ui/EmptyPanelState'
import ColumnSettingsButton from './ui/ColumnSettingsButton'
import { TableContainer, Table, Th, Td, Tr } from './ui/Table'
import useTableFeatures from '../hooks/useTableFeatures'

function TrackingStatusBadge({ status }) {
  const config = {
    REGISTER: { label: 'Register', style: 'bg-surface-muted text-ink-secondary border-border' },
    CHECK_IN: { label: 'Check-in', style: 'bg-[var(--dms-color-success-soft)] text-[var(--dms-color-success-ink)] border-[var(--dms-color-border-default)]' },
    CHECK_OUT: { label: 'Check-out', style: 'bg-[var(--dms-color-warning-soft)] text-[var(--dms-color-warning-ink)] border-[var(--dms-color-border-default)]' },
    ARCHIVE: { label: 'Archive', style: 'bg-surface-muted text-ink-muted border-border' }
  }

  const resolved = config[status] || { label: status || '-', style: 'bg-surface-muted text-ink-secondary border-border' }

  return (
    <span className={`inline-flex items-center px-3 py-1 text-xs font-medium rounded-full border whitespace-nowrap ${resolved.style}`}>
      {resolved.label}
    </span>
  )
}

export default function RfidEpcRegistry() {
  const canExport = hasPermission('documents.rfidRegistry', 'export')
  const [records, setRecords] = useState([])
  const [enabled, setEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [filters, setFilters] = useState({
    from: '',
    to: '',
    fileCode: ''
  })
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(15)
  const [total, setTotal] = useState(0)
  const [dragColIndex, setDragColIndex] = useState(null)
  const [dragOverColIndex, setDragOverColIndex] = useState(null)

  const totalPages = useMemo(() => {
    return Math.max(Math.ceil(total / limit), 1)
  }, [total, limit])

  const loadRecords = async (nextFilters = filters, nextPage = page, nextLimit = limit) => {
    setLoading(true)
    setErrorMessage('')
    try {
      const res = await api.get('/epc-registry', {
        params: {
          ...nextFilters,
          page: nextPage,
          limit: nextLimit
        }
      })
      const data = res.data?.data || {}
      setEnabled(data.enabled !== false)
      setRecords(Array.isArray(data.records) ? data.records : [])
      setTotal(Number(data.total || 0))
    } catch (error) {
      console.error('Failed to load EPC registry:', error)
      setRecords([])
      setTotal(0)
      setEnabled(true)
      setErrorMessage('Unable to load EPC registry right now. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRecords()
  }, [page, limit])

  const handleSearch = () => {
    setPage(1)
    loadRecords(filters, 1, limit)
  }

  const handleReset = () => {
    const nextFilters = { from: '', to: '', fileCode: '' }
    setFilters(nextFilters)
    setPage(1)
    loadRecords(nextFilters, 1, limit)
  }

  const handleExport = async () => {
    setExporting(true)
    setErrorMessage('')
    try {
      const res = await api.get('/epc-registry/export', {
        params: filters,
        responseType: 'blob'
      })
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `epc_registry_${new Date().toISOString().split('T')[0]}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to export EPC registry:', error)
      setErrorMessage('Export failed. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const epcColumns = [
    {
      id: 'generatedAt',
      key: 'generatedAt',
      accessor: 'generatedAt',
      label: 'Generated At',
      sortable: true,
      sortType: 'date',
      sortComparer: (a, b) => new Date(a || 0) - new Date(b || 0),
      render: (value) => value ? new Date(value).toLocaleString('en-GB') : '-'
    },
    {
      id: 'fileCode',
      key: 'fileCode',
      accessor: 'fileCode',
      label: 'File Code',
      sortable: true,
      required: true,
      render: (value) => <span className="font-semibold text-ink break-words">{value}</span>
    },
    {
      id: 'fileName',
      key: 'fileName',
      accessor: 'fileName',
      label: 'File Name',
      sortable: true,
      render: (value) => <span className="break-words">{value}</span>
    },
    {
      id: 'documentStatus',
      key: 'documentStatus',
      accessor: 'documentStatus',
      label: 'Document Status',
      sortable: true,
      render: (value) => value ? <StatusBadge status={value} /> : '-'
    },
    {
      id: 'trackingStatus',
      key: 'trackingStatus',
      accessor: 'trackingStatus',
      label: 'Tracking Status',
      sortable: true,
      render: (value) => <TrackingStatusBadge status={value} />
    },
    {
      id: 'epcHex',
      key: 'epcHex',
      accessor: 'epcHex',
      label: 'EPC Hex',
      sortable: true,
      render: (value) => <span className="font-mono text-xs text-brand whitespace-nowrap">{value}</span>
    },
    {
      id: 'title',
      key: 'title',
      accessor: (row) => row?.document?.title,
      label: 'Title',
      sortable: true,
      render: (value) => <span className="break-words">{value || '-'}</span>
    },
    {
      id: 'type',
      key: 'type',
      accessor: (row) => row?.document?.documentType?.name,
      label: 'Type',
      sortable: true,
      render: (value) => <span className="break-words">{value || '-'}</span>
    },
    {
      id: 'version',
      key: 'version',
      accessor: (row) => row?.document?.version,
      label: 'Version',
      sortable: true,
      render: (value) => <span className="whitespace-nowrap">{value || '-'}</span>
    }
  ]

  const tableFeatures = useTableFeatures({
    tableId: 'rfid-epc-registry',
    columns: epcColumns,
    data: records,
    defaultSortKey: 'generatedAt',
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
    <div className="space-y-6" data-tour-id="epc-page">
      <PageHeader
        title="EPC Registry"
        subtitle="Automatically generated fixed-length 96-bit EPC records derived from document file codes."
        actions={canExport ? (
          <Button
            onClick={handleExport}
            disabled={exporting || loading || records.length === 0 || !enabled}
          >
            {exporting && <InlineSpinner className="h-4 w-4 border-white/30 border-t-white" />}
            {exporting ? 'Exporting...' : 'Export CSV'}
          </Button>
        ) : null}
      />

      {!enabled && (
        <AppSurface
          padding="md"
          className="border border-[var(--dms-color-border-default)] bg-[var(--dms-color-warning-soft)] text-[var(--dms-color-warning-ink)]"
        >
          <div className="text-sm font-semibold">EPC Registry is currently disabled by system configuration.</div>
        </AppSurface>
      )}

      {errorMessage && (
        <AppSurface
          padding="md"
          className="border border-[var(--dms-color-border-default)] bg-[var(--dms-color-danger-soft)] text-[var(--dms-color-danger-ink)]"
        >
          <div className="text-sm font-semibold">{errorMessage}</div>
        </AppSurface>
      )}

      <AppSurface padding="lg" className="space-y-4" data-tour-id="epc-filters-card">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-soft">Date From</label>
            <TextInput
              type="date"
              value={filters.from}
              onChange={(e) => setFilters((prev) => ({ ...prev, from: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-soft">Date To</label>
            <TextInput
              type="date"
              value={filters.to}
              onChange={(e) => setFilters((prev) => ({ ...prev, to: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-soft">File Code</label>
            <TextInput
              type="text"
              value={filters.fileCode}
              placeholder="Search file code"
              onChange={(e) => setFilters((prev) => ({ ...prev, fileCode: e.target.value }))}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button type="button" onClick={handleSearch}>
              Apply Filter
            </Button>
            <Button type="button" variant="secondary" onClick={handleReset}>
              Reset
            </Button>
          </div>
        </div>
      </AppSurface>

      <AppSurface padding="none" className="overflow-hidden" data-tour-id="epc-table-card">
        <div className="px-5 py-3 flex items-center justify-between border-b border-border bg-surface-muted/50">
          <div className="text-sm font-semibold text-ink">EPC Records ({total})</div>
          <ColumnSettingsButton
            orderedColumns={orderedColumns}
            hiddenColumns={hiddenColumns}
            onToggleColumn={toggleColumnVisibility}
            onReset={resetTableSettings}
          />
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-3 px-4 py-12 text-sm text-ink-muted">
            <InlineSpinner />
            Loading EPC registry...
          </div>
        ) : sortedData.length === 0 ? (
          <div className="p-5">
            <EmptyPanelState
              title="No EPC records found"
              description="Try adjusting your filters or date range."
            />
          </div>
        ) : (
          <TableContainer className="rounded-none border-0">
            <Table className="min-w-[1480px] table-fixed">
              <thead>
                <Tr className="hover:bg-transparent">
                  {visibleColumns.map((col, idx) => {
                    const id = col.id || col.key
                    const canDrag = !col.stickyRight
                    const isDragOver = canDrag && dragOverColIndex === idx
                    return (
                      <Th
                        key={id}
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
              <tbody>
                {sortedData.map((record) => (
                  <Tr key={record.id}>
                    {visibleColumns.map((col) => {
                      const id = col.id || col.key || col.accessor
                      const accessor = col.accessor || id
                      let value
                      if (typeof accessor === 'function') {
                        value = accessor(record, col)
                      } else {
                        value = record?.[accessor]
                      }
                      const content = typeof col.render === 'function' ? col.render(value, record) : (value != null ? value : '')
                      return (
                        <Td
                          key={id}
                          align={col.align || 'left'}
                          stickyRight={col.stickyRight || false}
                          className={col.stickyRight ? 'py-3' : 'align-top'}
                        >
                          {content}
                        </Td>
                      )
                    })}
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableContainer>
        )}

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalRecords={total}
          pageSize={limit}
          onPageChange={setPage}
          onPageSizeChange={(next) => {
            setLimit(next)
            setPage(1)
          }}
        />
      </AppSurface>
    </div>
  )
}
