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
import FbEnquiryEntryModal from './FbEnquiryEntryModal'
import CrmImportModal from './CrmImportModal'

const statusOptions = [
  { value: 'all', label: 'All statuses' },
  { value: 'NEW', label: 'New' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'QUALIFIED', label: 'Qualified' },
  { value: 'QUOTATION_PROVIDED', label: 'Quotation Provided' },
  { value: 'CONVERTED', label: 'Converted' }
]

export default function FbEnquiryRegister() {
  const canCreate = hasPermission('crm.fbEnquiry', 'create')
  const canUpdate = hasPermission('crm.fbEnquiry', 'update')
  const canDelete = hasPermission('crm.fbEnquiry', 'delete')
  const canImport = hasPermission('crm.fbEnquiry', 'import')
  const canExport = hasPermission('crm.fbEnquiry', 'export')

  const [filters, setFilters] = useState({ search: '', status: 'all' })
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(15)
  const [total, setTotal] = useState(0)
  const [records, setRecords] = useState([])
  const [summary, setSummary] = useState({
    totalEntries: 0,
    newEntries: 0,
    inPipeline: 0,
    converted: 0,
    totalPotentialValueCents: 0
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
      setErrorMessage('Unable to load enquiries right now. Please try again.')
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
          converted: Number(nextSummary.converted || 0),
          totalPotentialValueCents: Number(nextSummary.totalPotentialValueCents || 0)
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
      const res = await api.get('/crm/fb-enquiries/export', {
        params: filters,
        responseType: 'blob'
      })
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `fb_enquiries_${new Date().toISOString().split('T')[0]}.csv`)
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
    const nameIdx = idx('name')
    const enquiryDateIdx = idx('enquiryDate')
    if (nameIdx < 0 || enquiryDateIdx < 0) return []
    const emailIdx = idx('email')
    const companyIdx = idx('company')
    const contactIdx = idx('contact')
    const locationIdx = idx('location')
    const channelIdx = idx('channel')
    const industryTypeIdx = idx('industryType')
    const interestedProductIdx = idx('interestedProduct')
    const painPointIdx = idx('painPoint')
    const statusIdx = idx('status')
    const valueIdx = idx('potentialValueCents')
    const documentLinkIdx = idx('documentLink')
    const followUpNotesIdx = idx('followUpNotes')

    return lines.slice(1).map((line) => {
      const parts = line.split(',').map((p) => p.trim().replace(/^"|"$/g, ''))
      return {
        name: parts[nameIdx] || '',
        enquiryDate: parts[enquiryDateIdx] || '',
        email: emailIdx >= 0 ? (parts[emailIdx] || '') : '',
        company: companyIdx >= 0 ? (parts[companyIdx] || '') : '',
        contact: contactIdx >= 0 ? (parts[contactIdx] || '') : '',
        location: locationIdx >= 0 ? (parts[locationIdx] || '') : '',
        channel: channelIdx >= 0 ? (parts[channelIdx] || '') : '',
        industryType: industryTypeIdx >= 0 ? (parts[industryTypeIdx] || '') : '',
        interestedProduct: interestedProductIdx >= 0 ? (parts[interestedProductIdx] || '') : '',
        painPoint: painPointIdx >= 0 ? (parts[painPointIdx] || '') : '',
        status: statusIdx >= 0 ? (parts[statusIdx] || 'NEW') : 'NEW',
        potentialValueCents: valueIdx >= 0 ? Number(parts[valueIdx] || 0) : 0,
        documentLink: documentLinkIdx >= 0 ? (parts[documentLinkIdx] || '') : '',
        followUpNotes: followUpNotesIdx >= 0 ? (parts[followUpNotesIdx] || '') : ''
      }
    }).filter((row) => String(row.name || '').trim() && String(row.enquiryDate || '').trim())
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
        message: 'CSV format not recognized. Required headers: name,enquiryDate. Optional: email,company,contact,location,channel,industryType,interestedProduct,painPoint,status,potentialValueCents,documentLink,followUpNotes.',
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

  const handleDelete = (entry) => {
    setConfirmModal({
      show: true,
      title: 'Delete Entry',
      message: `Delete "${entry.name}"? This action cannot be undone.`,
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

  const renderSummaryCard = (label, value) => (
    <AppSurface padding="md" className="border border-border">
      <div className="text-[11px] font-semibold text-ink-soft">{label}</div>
      <div className="mt-1 text-xl font-semibold text-ink">{value}</div>
    </AppSurface>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="FB Enquiry Register"
        subtitle="Track enquiries, pipeline progress, and conversion outcomes"
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {renderSummaryCard('Total Entries', summaryLoading ? '...' : summary.totalEntries)}
        {renderSummaryCard('In Pipeline', summaryLoading ? '...' : summary.inPipeline)}
        {renderSummaryCard('Converted', summaryLoading ? '...' : summary.converted)}
        {renderSummaryCard('Total Potential Value', summaryLoading ? '...' : formatMoney(summary.totalPotentialValueCents))}
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
            {canCreate && <Button onClick={openCreate}>Add New Enquiry</Button>}
          </div>
        </div>
      </AppSurface>

      <TableContainer>
        <Table>
          <thead>
            <tr>
              <Th>No.</Th>
              <Th>Name</Th>
              <Th>Company</Th>
              <Th>Location</Th>
              <Th>Channel</Th>
              <Th>Industry</Th>
              <Th>Interest</Th>
              <Th>Pain Point</Th>
              <Th align="right">Value</Th>
              <Th>Status</Th>
              <Th>Notes</Th>
              {(canUpdate || canDelete) && <Th align="right">Actions</Th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <Tr>
                <Td colSpan={(canUpdate || canDelete) ? 12 : 11} className="py-10 text-center">
                  <InlineSpinner className="mx-auto h-5 w-5 border-border border-t-brand" />
                </Td>
              </Tr>
            ) : records.length === 0 ? (
              <Tr>
                <Td colSpan={(canUpdate || canDelete) ? 12 : 11} className="py-8">
                  <EmptyPanelState
                    title="No entries yet"
                    description='Log the first one with "Add New Enquiry".'
                  />
                </Td>
              </Tr>
            ) : (
              records.map((row) => (
                <Tr key={row.id}>
                  <Td>{String(row.id || '').padStart(3, '0')}</Td>
                  <Td className="font-semibold text-ink">{row.name}</Td>
                  <Td>{row.company || '-'}</Td>
                  <Td>{row.location || '-'}</Td>
                  <Td>{row.channel || '-'}</Td>
                  <Td>{row.industryType || '-'}</Td>
                  <Td>{row.interestedProduct || '-'}</Td>
                  <Td>{row.painPoint || '-'}</Td>
                  <Td align="right">{formatMoney(row.potentialValueCents)}</Td>
                  <Td><StatusBadge status={row.status} /></Td>
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

      <FbEnquiryEntryModal
        open={entryModal.open}
        entry={entryModal.entry}
        onClose={() => setEntryModal({ open: false, entry: null })}
        onSaved={handleSaved}
      />

      <CrmImportModal
        open={importModalOpen}
        title="Import FB Enquiries"
        subtitle="Upload a CSV file using the same template structure every time."
        templateDownloadFileName="fb_enquiries_template.csv"
        templateHeaders={[
          'name',
          'enquiryDate',
          'status',
          'email',
          'company',
          'contact',
          'location',
          'channel',
          'industryType',
          'interestedProduct',
          'painPoint',
          'potentialValueCents',
          'documentLink',
          'followUpNotes'
        ]}
        templateSampleRow={[
          'John Tan',
          '2026-07-28',
          'NEW',
          'john@example.com',
          'ABC Sdn Bhd',
          '0123456789',
          'Shah Alam',
          'Facebook Post/Ad',
          'Construction',
          'Document control service',
          'Need better document tracking',
          '1000000',
          'https://example.com/reference',
          'Requested follow-up next week'
        ]}
        requiredFields={['name', 'enquiryDate']}
        optionalFields={['status', 'email', 'company', 'contact', 'location', 'channel', 'industryType', 'interestedProduct', 'painPoint', 'potentialValueCents', 'documentLink', 'followUpNotes']}
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
