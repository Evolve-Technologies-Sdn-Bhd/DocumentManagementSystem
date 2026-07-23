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
import { TableContainer, Table, Th, Td, Tr } from './ui/Table'

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
        {loading ? (
          <div className="flex items-center justify-center gap-3 px-4 py-12 text-sm text-ink-muted">
            <InlineSpinner />
            Loading EPC registry...
          </div>
        ) : records.length === 0 ? (
          <div className="p-5">
            <EmptyPanelState
              title="No EPC records found"
              description="Try adjusting your filters or date range."
            />
          </div>
        ) : (
          <TableContainer className="rounded-none border-0">
            <Table className="min-w-[1480px] table-fixed">
              <colgroup>
                <col className="w-[140px]" />
                <col className="w-[170px]" />
                <col className="w-[300px]" />
                <col className="w-[140px]" />
                <col className="w-[140px]" />
                <col className="w-[200px]" />
                <col className="w-[220px]" />
                <col className="w-[130px]" />
                <col className="w-[90px]" />
              </colgroup>
              <thead>
                <Tr className="hover:bg-transparent">
                  <Th>Generated At</Th>
                  <Th>File Code</Th>
                  <Th>File Name</Th>
                  <Th>Document Status</Th>
                  <Th>Tracking Status</Th>
                  <Th>EPC Hex</Th>
                  <Th>Title</Th>
                  <Th>Type</Th>
                  <Th>Version</Th>
                </Tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <Tr key={record.id}>
                    <Td className="align-top">
                      {record.generatedAt ? new Date(record.generatedAt).toLocaleString('en-GB') : '-'}
                    </Td>
                    <Td className="align-top font-semibold text-ink break-words">{record.fileCode}</Td>
                    <Td className="align-top break-words">{record.fileName}</Td>
                    <Td className="align-top">
                      {record.documentStatus ? <StatusBadge status={record.documentStatus} /> : '-'}
                    </Td>
                    <Td className="align-top">
                      <TrackingStatusBadge status={record.trackingStatus} />
                    </Td>
                    <Td className="align-top font-mono text-xs text-brand whitespace-nowrap">{record.epcHex}</Td>
                    <Td className="align-top break-words">{record.document?.title || '-'}</Td>
                    <Td className="align-top break-words">{record.document?.documentType?.name || '-'}</Td>
                    <Td className="align-top whitespace-nowrap">{record.document?.version || '-'}</Td>
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
