import React, { useEffect, useMemo, useState } from 'react'
import api from '../api/axios'
import Pagination from './Pagination'
import StatusBadge from './StatusBadge'
import { hasPermission } from '../utils/permissions'

function TrackingStatusBadge({ status }) {
  const config = {
    REGISTER: { label: 'Register', style: 'bg-slate-100 text-slate-700 border-slate-300' },
    CHECK_IN: { label: 'Check-in', style: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
    CHECK_OUT: { label: 'Check-out', style: 'bg-amber-100 text-amber-800 border-amber-300' },
    ARCHIVE: { label: 'Archive', style: 'bg-gray-100 text-gray-600 border-gray-300' }
  }

  const resolved = config[status] || { label: status || '-', style: 'bg-slate-100 text-slate-700 border-slate-300' }

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
      alert('Export failed. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">EPC Registry</h1>
            <p className="text-sm text-gray-600 mt-1">
              Automatically generated fixed-length 96-bit EPC records derived from document file codes.
            </p>
          </div>
          {canExport && (
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting || loading || records.length === 0 || !enabled}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
          )}
        </div>
      </div>

      {!enabled && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4">
          EPC Registry is currently disabled by system configuration.
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date From</label>
            <input
              type="date"
              value={filters.from}
              onChange={(e) => setFilters((prev) => ({ ...prev, from: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date To</label>
            <input
              type="date"
              value={filters.to}
              onChange={(e) => setFilters((prev) => ({ ...prev, to: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">File Code</label>
            <input
              type="text"
              value={filters.fileCode}
              placeholder="Search file code"
              onChange={(e) => setFilters((prev) => ({ ...prev, fileCode: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={handleSearch}
              className="px-4 py-2 rounded-lg bg-slate-800 text-white font-medium hover:bg-slate-900"
            >
              Apply Filter
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Generated At</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">File Code</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">File Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Document Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Tracking Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">EPC Hex</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Title</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Version</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-gray-500">Loading EPC registry...</td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-gray-500">No EPC records found.</td>
                </tr>
              ) : (
                records.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {record.generatedAt ? new Date(record.generatedAt).toLocaleString('en-GB') : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{record.fileCode}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{record.fileName}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {record.documentStatus ? <StatusBadge status={record.documentStatus} /> : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <TrackingStatusBadge status={record.trackingStatus} />
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-blue-700 break-all">{record.epcHex}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{record.document?.title || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{record.document?.documentType?.name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{record.document?.version || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

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
      </div>
    </div>
  )
}
