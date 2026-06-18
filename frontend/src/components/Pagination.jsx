import React from 'react'
import { usePreferences } from '../contexts/PreferencesContext'

export default function Pagination({ 
  currentPage = 1, 
  totalPages = 1, 
  totalRecords = 0,
  pageSize,
  onPageChange, 
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50]
}) {
  const { t, itemsPerPage } = usePreferences()
  const effectivePageSize = Number(pageSize) || Number(itemsPerPage) || 10
  const startRecord = totalRecords === 0 ? 0 : (currentPage - 1) * effectivePageSize + 1
  const endRecord = Math.min(currentPage * effectivePageSize, totalRecords)

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages && page !== currentPage) {
      onPageChange(page)
    }
  }

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages = []
    const maxPagesToShow = 7
    
    if (totalPages <= maxPagesToShow) {
      // Show all pages
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      // Show first page, last page, and pages around current page
      if (currentPage <= 3) {
        // Near start
        for (let i = 1; i <= 5; i++) pages.push(i)
        pages.push('...')
        pages.push(totalPages)
      } else if (currentPage >= totalPages - 2) {
        // Near end
        pages.push(1)
        pages.push('...')
        for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i)
      } else {
        // Middle
        pages.push(1)
        pages.push('...')
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i)
        pages.push('...')
        pages.push(totalPages)
      }
    }
    
    return pages
  }

  if (totalPages <= 1 && totalRecords === 0) {
    return null
  }

  return (
    <div className="flex items-center justify-between border-t border-border bg-surface px-4 py-3">
      {/* Left side - Records info and page size selector */}
      <div className="flex items-center gap-4">
        <span className="text-sm text-ink-secondary">
          {t('showing')} <span className="font-medium">{startRecord}</span> {t('to')}{' '}
          <span className="font-medium">{endRecord}</span> {t('of')}{' '}
          <span className="font-medium">{totalRecords}</span> {t('results')}
        </span>
        
        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <label htmlFor="pageSize" className="text-sm text-ink-secondary">
              {t('rows_per_page')}
            </label>
            <select
              id="pageSize"
              value={effectivePageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-9 rounded-2xl border border-border bg-surface px-2 text-sm text-ink outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-brand/30"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Right side - Page navigation */}
      <div className="flex items-center gap-2">
        {/* Previous button */}
        <button
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="h-9 rounded-2xl border border-border bg-surface px-3 text-sm font-semibold text-ink-secondary transition-colors hover:bg-surface-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t('previous')}
        </button>

        {/* Page numbers */}
        <div className="flex gap-1">
          {getPageNumbers().map((page, index) => (
            page === '...' ? (
              <span key={`ellipsis-${index}`} className="px-3 py-1 text-ink-soft">
                ...
              </span>
            ) : (
              <button
                key={page}
                onClick={() => handlePageChange(page)}
                className={`h-9 rounded-2xl border px-3 text-sm font-semibold transition-colors ${
                  currentPage === page
                    ? 'border-white/10 bg-brand text-ink-inverse'
                    : 'border-border bg-surface text-ink-secondary hover:bg-surface-muted hover:text-ink'
                }`}
              >
                {page}
              </button>
            )
          ))}
        </div>

        {/* Next button */}
        <button
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="h-9 rounded-2xl border border-border bg-surface px-3 text-sm font-semibold text-ink-secondary transition-colors hover:bg-surface-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t('next')}
        </button>
      </div>
    </div>
  )
}
