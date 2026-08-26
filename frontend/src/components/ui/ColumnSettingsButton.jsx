import React, { useEffect, useRef, useState } from 'react'

export default function ColumnSettingsButton({
  orderedColumns = [],
  hiddenColumns = [],
  onToggleColumn,
  onReset,
  buttonLabel = 'Columns',
  buttonClassName = '',
  disabled = false
}) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    const handleEsc = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [open])

  const visibleCount = orderedColumns.length
    ? orderedColumns.filter((c) => {
        const id = c.id || c.key || c.accessor
        if (c.required) return true
        return !hiddenColumns.includes(id)
      }).length
    : 0

  const totalOptional = orderedColumns.filter((c) => !c.required).length

  return (
    <div className="relative inline-block" ref={wrapperRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={[
          'inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md border',
          'border-gray-300 bg-white hover:bg-gray-50',
          'text-gray-700 hover:border-gray-400',
          'focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500',
          'disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
          buttonClassName
        ].filter(Boolean).join(' ')}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M2.5 5A1.5 1.5 0 0 1 4 3.5h12A1.5 1.5 0 0 1 17.5 5v0A1.5 1.5 0 0 1 16 6.5H4A1.5 1.5 0 0 1 2.5 5v0Zm3 6A1.5 1.5 0 0 1 7 9.5h10A1.5 1.5 0 0 1 18.5 11v0A1.5 1.5 0 0 1 17 12.5H7A1.5 1.5 0 0 1 5.5 11v0Zm2 6A1.5 1.5 0 0 1 9 15.5h8a1.5 1.5 0 0 1 1.5 1.5v0A1.5 1.5 0 0 1 17 18.5H9A1.5 1.5 0 0 1 7.5 17v0Z" />
        </svg>
        <span className="pl-0.5">{buttonLabel}</span>
        {totalOptional > 0 && (
          <span className={[
            'inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-[10px] font-semibold rounded-full border',
            visibleCount === orderedColumns.length
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-red-50 text-red-700 border-red-200'
          ].join(' ')}>
            {visibleCount}/{orderedColumns.length}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 min-w-[260px] origin-top-right rounded-lg bg-white shadow-xl shadow-gray-900/5 ring-1 ring-black ring-opacity-5 focus:outline-none border border-gray-200 animate-in fade-in slide-in-from-top-1.25 duration-100"
        >
          <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-800">Show / Hide Columns</p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {visibleCount} of {orderedColumns.length} visible
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
              aria-label="Close"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto p-1.5">
            {orderedColumns.length === 0 && (
              <p className="px-2 py-3 text-xs text-gray-500 text-center">No columns configured</p>
            )}
            {orderedColumns.map((col) => {
              const id = col.id || col.key || col.accessor
              const isRequired = col.required === true
              const isHidden = !isRequired && hiddenColumns.includes(id)
              const label = col.label || col.header || col.title || id
              return (
                <label
                  key={id}
                  className={[
                    'flex items-center gap-2 px-2 py-2 rounded-md text-xs cursor-pointer',
                    'hover:bg-gray-50 transition-colors',
                    isRequired ? 'text-gray-800' : 'text-gray-700'
                  ].join(' ')}
                >
                  <input
                    type="checkbox"
                    checked={!isHidden}
                    disabled={isRequired}
                    onChange={() => !isRequired && onToggleColumn && onToggleColumn(id)}
                    className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50"
                  />
                  <span className="flex-1 truncate">{label}</span>
                  {isRequired && (
                    <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-50 text-blue-700 border border-blue-200">
                      Required
                    </span>
                  )}
                </label>
              )
            })}
          </div>

          <div className="px-3 py-2 border-t border-gray-200 flex items-center justify-between gap-2">
            <div className="text-[11px] text-gray-500 flex items-center gap-1">
              <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                <path d="M6.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm7 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm-3.5 7a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
              </svg>
              Drag headers to reorder
            </div>
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-red-600 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 transition-colors"
            >
              <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V2.929a.75.75 0 0 0-1.5 0V5.36l-.31-.31A7 7 0 0 0 3.239 8.188a.75.75 0 1 0 1.448.389A5.5 5.5 0 0 1 13.89 6.11l.311.31h-2.432a.75.75 0 0 0 0 1.5h4.243a.75.75 0 0 0 .53-.219Z" clipRule="evenodd" />
              </svg>
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
