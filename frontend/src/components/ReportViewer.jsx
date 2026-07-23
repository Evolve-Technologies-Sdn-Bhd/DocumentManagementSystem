import React, { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import api from '../api/axios'
import StatusBadge from './StatusBadge'

const ReportViewer = () => {
  const { reportType } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  
  const [reportData, setReportData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [exporting, setExporting] = useState(false)
  
  // Filter states
  const [filters, setFilters] = useState({
    dateFrom: searchParams.get('dateFrom') || '',
    dateTo: searchParams.get('dateTo') || '',
    status: searchParams.get('status') || '',
    department: searchParams.get('department') || '',
    documentTypeId: searchParams.get('documentTypeId') || '',
    searchText: ''
  })
  
  // Dropdown options
  const [documentTypes, setDocumentTypes] = useState([])
  const [departments, setDepartments] = useState([])
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(25)

  const reportTypeLabels = {
    'document-stats': 'Document Statistics',
    'user-activity': 'User Activity',
    'document-request': 'Document Request',
    'security-audit': 'Security & Audit',
    'template-usage': 'Template Usage',
    'storage-usage': 'Storage Usage'
  }

  useEffect(() => {
    loadDropdownOptions()
  }, [])

  useEffect(() => {
    fetchReportData()
  }, [reportType])

  const loadDropdownOptions = async () => {
    try {
      const [typesRes, usersRes] = await Promise.all([
        api.get('/document-types'),
        api.get('/users')
      ])
      
      setDocumentTypes(typesRes.data.data || [])
      
      const users = usersRes.data.data || []
      const depts = [...new Set(users.map(u => u.department).filter(Boolean))]
      setDepartments(depts)
    } catch (err) {
      console.error('Error loading dropdown options:', err)
    }
  }

  const fetchReportData = async (activeFilters = filters) => {
    setLoading(true)
    setError(null)
    
    try {
      const params = new URLSearchParams()
      
      if (activeFilters.dateFrom) params.append('dateFrom', activeFilters.dateFrom)
      if (activeFilters.dateTo) params.append('dateTo', activeFilters.dateTo)
      if (activeFilters.status) params.append('status', activeFilters.status)
      if (activeFilters.department) params.append('department', activeFilters.department)
      if (activeFilters.documentTypeId) params.append('documentTypeId', activeFilters.documentTypeId)
      
      const query = params.toString()
      const requestUrl = query ? `/reports/system/data/${reportType}?${query}` : `/reports/system/data/${reportType}`
      const response = await api.get(requestUrl)
      // #region debug-point A:report-viewer-response
      fetch('http://127.0.0.1:7777/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'document-request-report',
          runId: 'pre-fix',
          hypothesisId: 'A',
          location: 'frontend/src/components/ReportViewer.jsx:84',
          msg: '[DEBUG] Report viewer received API response',
          data: {
            reportType,
            requestUrl,
            title: response?.data?.data?.title || null,
            summaryKeys: Object.keys(response?.data?.data?.summary || {}),
            total: response?.data?.data?.summary?.total ?? null,
            rowCount: Array.isArray(response?.data?.data?.rows) ? response.data.data.rows.length : null,
            rowTypes: Array.isArray(response?.data?.data?.rows)
              ? Array.from(new Set(response.data.data.rows.map((row) => row?.requestType).filter(Boolean)))
              : []
          },
          ts: Date.now()
        })
      }).catch(() => {})
      // #endregion
      setReportData(response.data.data)
      setCurrentPage(1)
    } catch (err) {
      console.error('Error fetching report data:', err)
      setError(err.response?.data?.message || 'Failed to load report data')
    } finally {
      setLoading(false)
    }
  }

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const applyFilters = () => {
    fetchReportData(filters)
  }

  const resetFilters = () => {
    const resetState = {
      dateFrom: '',
      dateTo: '',
      status: '',
      department: '',
      documentTypeId: '',
      searchText: ''
    }
    setFilters(resetState)
    fetchReportData(resetState)
  }

  const filteredRows = useMemo(() => {
    if (!reportData?.rows) return []
    if (!filters.searchText) return reportData.rows
    
    const searchLower = filters.searchText.toLowerCase()
    return reportData.rows.filter(row => 
      Object.values(row).some(val => 
        String(val).toLowerCase().includes(searchLower)
      )
    )
  }, [reportData?.rows, filters.searchText])

  const paginatedRows = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage
    return filteredRows.slice(startIndex, startIndex + rowsPerPage)
  }, [filteredRows, currentPage, rowsPerPage])

  const totalPages = Math.ceil(filteredRows.length / rowsPerPage)

  const exportToCSV = () => {
    if (!reportData) return
    
    setExporting(true)
    try {
      const columns = reportData.columns
      const rows = filteredRows
      
      const headers = columns.map(c => c.label).join(',')
      const csvRows = rows.map(row => 
        columns.map(col => {
          const val = row[col.key] || ''
          const escaped = String(val).replace(/"/g, '""')
          return escaped.includes(',') || escaped.includes('"') ? `"${escaped}"` : escaped
        }).join(',')
      )
      
      const csvContent = [headers, ...csvRows].join('\n')
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `${reportType}-${new Date().toISOString().split('T')[0]}.csv`
      link.click()
    } catch (err) {
      console.error('CSV export error:', err)
      alert('Failed to export CSV')
    } finally {
      setExporting(false)
    }
  }

  const exportToPDF = () => {
    if (!reportData) return
    
    setExporting(true)
    try {
      const doc = new jsPDF('landscape')
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 14
      const columns = reportData.columns
      const rows = filteredRows
      
      // Company info from localStorage
      const companyName = localStorage.getItem('dms_company_name') || 'FileNix DMS'
      
      // Print-friendly header (white background with border)
      doc.setDrawColor(60, 60, 60)
      doc.setLineWidth(0.5)
      doc.line(margin, 24, pageWidth - margin, 24)
      
      // Report title
      doc.setTextColor(30, 30, 30)
      doc.setFontSize(18)
      doc.setFont('helvetica', 'bold')
      doc.text(reportData.title || reportTypeLabels[reportType], margin, 16)
      
      // Company name and date on right
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(80, 80, 80)
      doc.text(companyName, pageWidth - margin, 10, { align: 'right' })
      doc.setFontSize(8)
      doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - margin, 16, { align: 'right' })
      
      // Report metadata
      doc.setTextColor(60, 60, 60)
      doc.setFontSize(9)
      let metaY = 32
      
      if (reportData.dateRange) {
        doc.setFont('helvetica', 'bold')
        doc.text('Period:', margin, metaY)
        doc.setFont('helvetica', 'normal')
        doc.text(`${reportData.dateRange.from} to ${reportData.dateRange.to}`, margin + 20, metaY)
      }
      
      doc.setFont('helvetica', 'bold')
      doc.text('Total Records:', 100, metaY)
      doc.setFont('helvetica', 'normal')
      doc.text(`${filteredRows.length}`, 132, metaY)
      
      let startY = 40
      
      // Summary section with boxes
      if (reportData.summary) {
        startY = renderPDFSummary(doc, reportData.summary, startY, pageWidth, margin)
      }
      
      // Table with print-friendly colors
      const tableColumns = columns.map(c => ({ header: c.label, dataKey: c.key }))
      const tableData = rows.map(row => {
        const rowData = {}
        columns.forEach(col => {
          rowData[col.key] = row[col.key] || ''
        })
        return rowData
      })
      
      autoTable(doc, {
        startY: startY,
        columns: tableColumns,
        body: tableData,
        styles: { 
          fontSize: 8, 
          cellPadding: 2.5,
          lineColor: [180, 180, 180],
          lineWidth: 0.1,
          textColor: [30, 30, 30]
        },
        headStyles: { 
          fillColor: [240, 240, 240],
          textColor: [30, 30, 30], 
          fontStyle: 'bold',
          halign: 'left',
          lineWidth: 0.2,
          lineColor: [150, 150, 150]
        },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        margin: { top: 26, bottom: 20, left: margin, right: margin },
        tableLineColor: [180, 180, 180],
        tableLineWidth: 0.1,
        showHead: 'everyPage',
        didDrawPage: (data) => {
          // Add header only on subsequent pages (page 1 header is drawn before table)
          if (data.pageNumber > 1) {
            doc.setDrawColor(60, 60, 60)
            doc.setLineWidth(0.5)
            doc.line(margin, 18, pageWidth - margin, 18)
            
            doc.setTextColor(30, 30, 30)
            doc.setFontSize(12)
            doc.setFont('helvetica', 'bold')
            doc.text(reportData.title || reportTypeLabels[reportType], margin, 12)
            
            doc.setFontSize(8)
            doc.setFont('helvetica', 'normal')
            doc.setTextColor(80, 80, 80)
            doc.text(companyName, pageWidth - margin, 12, { align: 'right' })
          }
        }
      })
      
      // Footer on all pages
      const pageCount = doc.internal.getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        
        // Footer line
        doc.setDrawColor(150, 150, 150)
        doc.setLineWidth(0.3)
        doc.line(margin, pageHeight - 14, pageWidth - margin, pageHeight - 14)
        
        // Footer text
        doc.setFontSize(8)
        doc.setTextColor(100, 100, 100)
        doc.text(companyName, margin, pageHeight - 8)
        doc.text(
          `Page ${i} of ${pageCount}`,
          pageWidth / 2,
          pageHeight - 8,
          { align: 'center' }
        )
        doc.text(
          new Date().toLocaleDateString(),
          pageWidth - margin,
          pageHeight - 8,
          { align: 'right' }
        )
      }
      
      doc.save(`${reportType}-${new Date().toISOString().split('T')[0]}.pdf`)
    } catch (err) {
      console.error('PDF export error:', err)
      alert('Failed to export PDF')
    } finally {
      setExporting(false)
    }
  }
  
  const hexToRGB = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 15, g: 111, b: 207 }
  }
  
  const renderPDFSummary = (doc, summary, startY, pageWidth, margin) => {
    const boxPadding = 4
    let currentY = startY
    
    // Summary title bar
    doc.setFillColor(245, 245, 245)
    doc.setDrawColor(200, 200, 200)
    doc.roundedRect(margin, currentY, pageWidth - margin * 2, 8, 1, 1, 'FD')
    doc.setTextColor(50, 50, 50)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('Summary', margin + 4, currentY + 5.5)
    currentY += 12
    
    const simpleMetrics = []
    const complexMetrics = []
    
    Object.entries(summary).forEach(([key, value]) => {
      if (typeof value === 'object' && !Array.isArray(value)) {
        complexMetrics.push({ key, value, type: 'object' })
      } else if (Array.isArray(value)) {
        complexMetrics.push({ key, value, type: 'array' })
      } else {
        simpleMetrics.push({ key, value })
      }
    })
    
    // Draw simple metrics in a row
    if (simpleMetrics.length > 0) {
      const metricsPerRow = Math.min(simpleMetrics.length, 6)
      const boxWidth = (pageWidth - margin * 2 - (metricsPerRow - 1) * 4) / metricsPerRow
      let currentX = margin
      
      simpleMetrics.forEach((metric, idx) => {
        if (idx > 0 && idx % metricsPerRow === 0) {
          currentY += 20
          currentX = margin
        }
        
        // Box with light border
        doc.setFillColor(255, 255, 255)
        doc.setDrawColor(200, 200, 200)
        doc.roundedRect(currentX, currentY, boxWidth, 16, 1, 1, 'FD')
        
        // Label
        doc.setTextColor(100, 100, 100)
        doc.setFontSize(7)
        doc.setFont('helvetica', 'normal')
        doc.text(formatKey(metric.key), currentX + boxPadding, currentY + 5)
        
        // Value
        doc.setTextColor(30, 30, 30)
        doc.setFontSize(11)
        doc.setFont('helvetica', 'bold')
        doc.text(String(metric.value), currentX + boxPadding, currentY + 12)
        
        currentX += boxWidth + 4
      })
      
      currentY += 22
    }
    
    // Draw complex metrics side by side in columns
    if (complexMetrics.length > 0) {
      const colWidth = (pageWidth - margin * 2 - 8) / 2
      let leftY = currentY
      let rightY = currentY
      let useLeft = true
      
      complexMetrics.forEach((metric, idx) => {
        const entries = metric.type === 'object' 
          ? Object.entries(metric.value)
          : metric.value.slice(0, 10).map((item, i) => {
              if (typeof item === 'object') {
                return [Object.values(item)[0], Object.values(item)[1] || '']
              }
              return [item, '']
            })
        
        // Calculate columns for items (2 columns if more than 5 items)
        const useColumns = entries.length > 5
        const colEntries = useColumns ? Math.ceil(entries.length / 2) : entries.length
        const boxHeight = 10 + colEntries * 6
        
        // Determine position
        const posX = useLeft ? margin : margin + colWidth + 8
        const posY = useLeft ? leftY : rightY
        
        // Box with light border
        doc.setFillColor(255, 255, 255)
        doc.setDrawColor(200, 200, 200)
        doc.roundedRect(posX, posY, colWidth, boxHeight, 1, 1, 'FD')
        
        // Title
        doc.setTextColor(50, 50, 50)
        doc.setFontSize(8)
        doc.setFont('helvetica', 'bold')
        doc.text(formatKey(metric.key), posX + boxPadding, posY + 6)
        
        // Items in columns
        const itemStartY = posY + 12
        const halfCol = colWidth / 2 - 4
        
        entries.forEach(([k, v], i) => {
          const inRightCol = useColumns && i >= colEntries
          const itemX = inRightCol ? posX + halfCol + 4 : posX + boxPadding
          const itemY = itemStartY + (inRightCol ? (i - colEntries) : i) * 6
          
          doc.setTextColor(60, 60, 60)
          doc.setFontSize(7)
          doc.setFont('helvetica', 'normal')
          
          const displayText = v ? `${k}: ${v}` : k
          // Truncate if too long
          const maxLen = useColumns ? 25 : 50
          const truncated = displayText.length > maxLen ? displayText.substring(0, maxLen) + '...' : displayText
          doc.text(truncated, itemX, itemY)
        })
        
        // Update Y positions
        if (useLeft) {
          leftY += boxHeight + 4
        } else {
          rightY += boxHeight + 4
        }
        useLeft = !useLeft
      })
      
      currentY = Math.max(leftY, rightY)
    }
    
    return currentY + 4
  }

  const formatKey = (key) => {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())
  }

  const renderSummary = () => {
    if (!reportData?.summary) return null
    
    const { summary } = reportData
    const totalActivities = summary.totalActivities
    const uniqueUsers = summary.uniqueUsers
    const topUsers = summary.topUsers
    const actionBreakdown = summary.actionBreakdown
    const hasUserActivitySummary = typeof totalActivities !== 'undefined'
      && typeof uniqueUsers !== 'undefined'
      && topUsers
      && actionBreakdown
    
    return (
      <div className="card p-4 mb-6">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--dms-text-primary)' }}>Summary</h3>
        {hasUserActivitySummary ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 items-stretch">
              <div className="relative rounded-lg p-4 min-h-[132px] flex items-center justify-center" style={{ background: 'var(--dms-panel-bg)' }}>
                <p className="absolute left-4 top-4 text-xs font-medium muted">Total Activities</p>
                <p className="text-4xl font-bold leading-none md:text-5xl" style={{ color: 'var(--dms-primary)' }}>{totalActivities}</p>
              </div>

              <div className="relative rounded-lg p-4 min-h-[132px] flex items-center justify-center" style={{ background: 'var(--dms-panel-bg)' }}>
                <p className="absolute left-4 top-4 text-xs font-medium muted">Unique Users</p>
                <p className="text-4xl font-bold leading-none md:text-5xl" style={{ color: 'var(--dms-primary)' }}>{uniqueUsers}</p>
              </div>

              <div className="rounded-lg p-3 min-h-[132px] flex flex-col" style={{ background: 'var(--dms-panel-bg)' }}>
                <p className="text-xs font-medium muted mb-2">Top Users</p>
                <div className="space-y-1 text-xs" style={{ color: 'var(--dms-text-primary)' }}>
                  {Object.entries(topUsers || {}).map(([k, v]) => (
                    <div key={k}>{`${formatKey(k)}: ${v}`}</div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-lg p-3" style={{ background: 'var(--dms-panel-bg)' }}>
              <p className="text-xs font-medium muted mb-2">Action Breakdown</p>
              <div className="grid max-h-48 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(actionBreakdown || {}).map(([k, v]) => (
                  <span
                    key={k}
                    className="inline-flex items-center justify-between gap-2 rounded border px-2 py-1 text-xs"
                    style={{ background: 'var(--dms-card-bg)' }}
                  >
                    <span className="muted">{formatKey(k)}</span>
                    <span className="font-semibold" style={{ color: 'var(--dms-text-primary)' }}>{v}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 items-start">
            {Object.entries(summary).map(([key, value]) => {
              const isComplex = typeof value === 'object' && value !== null
              const isArray = Array.isArray(value)

              if (!isComplex) {
                return (
                  <div key={key} className="rounded-lg p-3 self-start" style={{ background: 'var(--dms-panel-bg)' }}>
                    <p className="text-xs font-medium muted mb-1">{formatKey(key)}</p>
                    <p className="text-xl font-bold" style={{ color: 'var(--dms-primary)' }}>{value}</p>
                  </div>
                )
              }

              if (!isArray) {
                return (
                  <div key={key} className="rounded-lg p-3 self-start" style={{ background: 'var(--dms-panel-bg)' }}>
                    <p className="text-xs font-medium muted mb-2">{formatKey(key)}</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(value || {}).map(([k, v]) => (
                        <span
                          key={k}
                          className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs"
                          style={{ background: 'var(--dms-card-bg)' }}
                        >
                          <span className="muted">{formatKey(k)}:</span>
                          <span className="font-semibold" style={{ color: 'var(--dms-text-primary)' }}>{v}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )
              }

              return (
                <div key={key} className="rounded-lg p-3 self-start md:col-span-2" style={{ background: 'var(--dms-panel-bg)' }}>
                  <p className="text-xs font-medium muted mb-2">{formatKey(key)}</p>
                  <div className="space-y-1">
                    {value.slice(0, 5).map((item, idx) => (
                      <div key={idx} className="text-xs" style={{ color: 'var(--dms-text-primary)' }}>
                        {typeof item === 'object'
                          ? Object.entries(item).map(([k, v]) => `${formatKey(k)}: ${v}`).join(' | ')
                          : Array.isArray(item) ? `${item[0]}: ${item[1]}` : item
                        }
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  const statusOptions = ['DRAFT', 'PENDING_REVIEW', 'PENDING_APPROVAL', 'PUBLISHED', 'REJECTED', 'OBSOLETE', 'SUPERSEDED']

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/reports')}
            className="flex items-center gap-2 text-sm muted hover:opacity-80 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Reports
          </button>
          <div className="h-6 w-px bg-gray-300" />
          <h1 className="text-2xl font-bold" style={{ color: 'var(--dms-text-primary)' }}>{reportTypeLabels[reportType] || reportType}</h1>
          {(reportData?.dateRange?.from || reportData?.dateRange?.to) && (
            <span className="text-sm px-3 py-1 rounded-full" style={{ background: 'var(--dms-panel-bg)', color: 'var(--dms-muted)' }}>
              {reportData.dateRange.from || 'Start'} to {reportData.dateRange.to || 'Now'}
            </span>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--dms-text-primary)' }}>From Date</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:border-blue-500"
              style={{ background: 'var(--dms-card-bg)', color: 'var(--dms-text-primary)' }}
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--dms-text-primary)' }}>To Date</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => handleFilterChange('dateTo', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:border-blue-500"
              style={{ background: 'var(--dms-card-bg)', color: 'var(--dms-text-primary)' }}
            />
          </div>
          {['document-stats', 'workflow-status'].includes(reportType) && (
            <>
              <div className="flex-1 min-w-[150px]">
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--dms-text-primary)' }}>Status</label>
                <select
                  value={filters.status}
                  onChange={(e) => handleFilterChange('status', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:border-blue-500"
                  style={{ background: 'var(--dms-card-bg)', color: 'var(--dms-text-primary)' }}
                >
                  <option value="">All Statuses</option>
                  {statusOptions.map(s => (
                    <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[150px]">
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--dms-text-primary)' }}>Document Type</label>
                <select
                  value={filters.documentTypeId}
                  onChange={(e) => handleFilterChange('documentTypeId', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:border-blue-500"
                  style={{ background: 'var(--dms-card-bg)', color: 'var(--dms-text-primary)' }}
                >
                  <option value="">All Types</option>
                  {documentTypes.map(dt => (
                    <option key={dt.id} value={dt.id}>{dt.name}</option>
                  ))}
                </select>
              </div>
            </>
          )}
          {['user-activity', 'storage-usage'].includes(reportType) && (
            <div className="flex-1 min-w-[150px]">
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--dms-text-primary)' }}>Department</label>
              <select
                value={filters.department}
                onChange={(e) => handleFilterChange('department', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:border-blue-500"
                style={{ background: 'var(--dms-card-bg)', color: 'var(--dms-text-primary)' }}
              >
                <option value="">All Departments</option>
                {departments.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex gap-2">
            <button 
              onClick={applyFilters}
              className="px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors"
              style={{ background: 'var(--dms-primary)' }}
            >
              Apply Filters
            </button>
            <button 
              onClick={resetFilters}
              className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              style={{ background: 'var(--dms-card-bg)', color: 'var(--dms-text-primary)' }}
            >
              Reset
            </button>
          </div>
        </div>
        
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
          <div className="flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search in results..."
              value={filters.searchText}
              onChange={(e) => handleFilterChange('searchText', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:border-blue-500"
              style={{ background: 'var(--dms-card-bg)', color: 'var(--dms-text-primary)' }}
            />
          </div>
          <div className="flex gap-2">
            <button 
              onClick={exportToCSV}
              disabled={exporting || !reportData}
              className="flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              style={{ background: 'var(--dms-secondary)' }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export CSV
            </button>
            <button 
              onClick={exportToPDF}
              disabled={exporting || !reportData}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              Export PDF
            </button>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="card p-12 flex flex-col items-center justify-center">
          <div className="w-10 h-10 border-4 rounded-full animate-spin mb-4" style={{ borderColor: 'var(--dms-panel-bg)', borderTopColor: 'var(--dms-primary)' }} />
          <p className="muted">Loading report data...</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card p-8 flex flex-col items-center justify-center text-center">
          <svg className="w-12 h-12 text-red-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-red-600 mb-4">{error}</p>
          <button 
            onClick={fetchReportData}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Report Content */}
      {!loading && !error && reportData && (
        <>
          {renderSummary()}
          
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200" style={{ background: 'var(--dms-panel-bg)' }}>
              <span className="text-sm muted">
                Showing {paginatedRows.length} of {filteredRows.length} records
              </span>
              <div className="flex items-center gap-2">
                <label className="text-sm muted">Rows per page:</label>
                <select 
                  value={rowsPerPage} 
                  onChange={(e) => {
                    setRowsPerPage(Number(e.target.value))
                    setCurrentPage(1)
                  }}
                  className="px-2 py-1 border border-gray-300 rounded text-sm"
                  style={{ background: 'var(--dms-card-bg)', color: 'var(--dms-text-primary)' }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead style={{ background: 'var(--dms-primary)' }}>
                  <tr>
                    {reportData.columns?.map(col => (
                      <th 
                        key={col.key} 
                        className="px-4 py-3 text-left text-xs font-semibold text-white tracking-wider whitespace-nowrap"
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200" style={{ background: 'var(--dms-card-bg)' }}>
                  {paginatedRows.length === 0 ? (
                    <tr>
                      <td colSpan={reportData.columns?.length || 1} className="px-4 py-12 text-center muted">
                        No data found
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map((row, idx) => (
                      <tr key={row.id || idx} className="hover:bg-gray-50 transition-colors">
                        {reportData.columns?.map(col => (
                          <td key={col.key} className="px-4 py-3 text-sm whitespace-nowrap" style={{ color: 'var(--dms-text-primary)' }}>
                            {col.key === 'status' ? (
                              <StatusBadge status={row[col.key]} />
                            ) : (
                              row[col.key]
                            )}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 px-4 py-3 border-t border-gray-200" style={{ background: 'var(--dms-panel-bg)' }}>
                <button 
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: 'var(--dms-card-bg)', color: 'var(--dms-text-primary)' }}
                >
                  First
                </button>
                <button 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: 'var(--dms-card-bg)', color: 'var(--dms-text-primary)' }}
                >
                  Previous
                </button>
                <span className="px-4 py-1 text-sm muted">
                  Page {currentPage} of {totalPages}
                </span>
                <button 
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: 'var(--dms-card-bg)', color: 'var(--dms-text-primary)' }}
                >
                  Next
                </button>
                <button 
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: 'var(--dms-card-bg)', color: 'var(--dms-text-primary)' }}
                >
                  Last
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default ReportViewer
