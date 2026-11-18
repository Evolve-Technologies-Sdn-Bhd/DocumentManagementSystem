import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react'
import * as ReactDOM from 'react-dom'

export default function SearchableSingleSelect({
  value,
  options = [],
  onChange,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  noResultsLabel = 'No results found',
  disabled = false,
  loading = false,
  clearLabel = 'Clear',
  loadingLabel = 'Loading...',
  invalid = false,
  zIndex = 160,
  ...rest
}) {
  const [open, setOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const containerRef = useRef(null)
  const inputRef = useRef(null)
  const buttonRef = useRef(null)
  const dropdownPanelRef = useRef(null)
  const [position, setPosition] = useState({
    top: 0, left: 0, width: 320, maxHeight: 320, placement: 'bottom'
  })

  const selectedOption = useMemo(
    () => options.find((option) => String(option.value) === String(value)) || null,
    [options, value]
  )

  const filteredOptions = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase()
    if (!normalizedSearch) return options

    return options.filter((option) =>
      `${option.label || ''} ${option.searchText || ''} ${(option.meta || []).join(' ')}`
        .toLowerCase()
        .includes(normalizedSearch)
    )
  }, [options, searchValue])

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return

    const rect = buttonRef.current.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const viewportWidth = window.innerWidth
    const availableBelow = Math.max(0, viewportHeight - rect.bottom - 16)
    const availableAbove = Math.max(0, rect.top - 16)
    const placement =
      availableBelow >= Math.min(320, viewportHeight * 0.45) || availableBelow >= availableAbove
        ? 'bottom'
        : 'top'

    const available = placement === 'bottom' ? availableBelow : availableAbove
    const maxHeight = Math.max(120, Math.min(320, available))
    const width = Math.min(rect.width, viewportWidth - 24)
    const left = Math.max(12, Math.min(viewportWidth - width - 12, rect.left))
    const top = placement === 'bottom'
      ? Math.min(viewportHeight - maxHeight - 12, rect.bottom + 8)
      : Math.max(12, rect.top - maxHeight - 8)

    setPosition({ top, left, width, maxHeight, placement })
  }, [])

  useEffect(() => {
    if (!open) return undefined

    const handlePointerDown = (event) => {
      if (
        !containerRef.current?.contains(event.target) &&
        !(event.target instanceof Element && event.target.closest('[data-dms-select-portal]'))
      ) {
        setOpen(false)
        setSearchValue('')
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
    }
  }, [open])

  useEffect(() => {
    if (!open) return undefined

    updatePosition()

    const handleLayoutChange = () => updatePosition()
    window.addEventListener('resize', handleLayoutChange)
    window.addEventListener('scroll', handleLayoutChange, true)

    const timer = window.setTimeout(() => inputRef.current?.focus(), 0)

    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('resize', handleLayoutChange)
      window.removeEventListener('scroll', handleLayoutChange, true)
    }
  }, [open, updatePosition])

  // Correct upward placement using the actual rendered dropdown height.
  useLayoutEffect(() => {
    if (
      !open ||
      position.placement !== 'top' ||
      !buttonRef.current ||
      !dropdownPanelRef.current
    ) {
      return
    }

    const triggerRect = buttonRef.current.getBoundingClientRect()
    const panelRect = dropdownPanelRef.current.getBoundingClientRect()
    const nextTop = Math.max(12, triggerRect.top - panelRect.height - 8)

    setPosition((previous) => (
      Math.abs(previous.top - nextTop) < 1
        ? previous
        : { ...previous, top: nextTop }
    ))
  }, [open, position.placement, position.top, position.maxHeight, filteredOptions.length, loading])

  useEffect(() => {
    if (disabled) {
      setOpen(false)
      setSearchValue('')
    }
  }, [disabled])

  const handleSelect = (option) => {
    onChange?.(option.value, option)
    setOpen(false)
    setSearchValue('')
  }

  const dropdown = (
    <div
      data-dms-select-portal
      style={{ zIndex: zIndex + 1 }}
      className="pointer-events-none fixed inset-0"
    >
      <div
        ref={dropdownPanelRef}
        className="pointer-events-auto fixed"
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
          width: `${position.width}px`
        }}
      >
        <div className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.18)] ring-1 ring-black/5">
          <div className="border-b border-gray-200 p-3">
            <input
              ref={inputRef}
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setOpen(false)
                  setSearchValue('')
                }
              }}
              placeholder={searchPlaceholder}
              className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] transition-shadow focus:ring-2 focus:ring-[var(--dms-color-brand-primary)]/30 focus:border-[var(--dms-color-brand-primary)]/60"
            />
            <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-gray-500">
              <span>{loading ? loadingLabel : `${filteredOptions.length} result${filteredOptions.length === 1 ? '' : 's'}`}</span>
              {searchValue ? (
                <button
                  type="button"
                  onClick={() => setSearchValue('')}
                  className="rounded-lg px-2 py-1 font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
                >
                  {clearLabel}
                </button>
              ) : (
                <span>Type to filter</span>
              )}
            </div>
          </div>

          <div className="overflow-y-auto p-2" style={{ maxHeight: `${position.maxHeight}px` }}>
            {loading ? (
              <div className="rounded-xl px-3 py-4 text-sm text-gray-500">{loadingLabel}</div>
            ) : filteredOptions.length > 0 ? (
              filteredOptions.map((option, index) => {
                const isSelected = String(option.value) === String(value)
                return (
                  <button
                    key={option.id ?? option.value ?? index}
                    type="button"
                    onClick={() => handleSelect(option)}
                    className={`flex w-full items-start justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                      isSelected
                        ? 'border-[var(--dms-color-info-default)]/30 bg-[color-mix(in_srgb,var(--dms-color-info-soft)_55%,white)] text-gray-900 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--dms-color-info-default)_25%,transparent)]'
                        : 'border-transparent text-gray-800 hover:bg-gray-50 hover:border-gray-200'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-gray-900">{option.label}</div>
                      {option.meta?.length ? (
                        <div className="mt-1 space-y-0.5">
                          {option.meta.map((line, lineIndex) => (
                            <div key={`${line}-${lineIndex}`} className="text-xs text-gray-500">{line}</div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    {isSelected ? <span className="text-xs font-bold text-[var(--dms-color-brand-primary)]">Selected</span> : null}
                  </button>
                )
              })
            ) : (
              <div className="rounded-xl px-3 py-4 text-sm text-gray-500">{noResultsLabel}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  const createPortal = ReactDOM.createPortal || ReactDOM.default?.createPortal
  const renderedDropdown = open && typeof document !== 'undefined' && document.body && createPortal
    ? createPortal(dropdown, document.body)
    : open ? dropdown : null

  return (
    <div ref={containerRef} className="min-w-0 flex-1" {...rest}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (!disabled) setOpen((previous) => !previous)
        }}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`flex min-h-[40px] w-full items-center justify-between rounded-2xl border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--dms-color-brand-primary)]/30 ${
          invalid ? 'border-red-300 focus-visible:ring-red-200/80' : ''
        } ${disabled ? 'cursor-not-allowed bg-gray-100 text-gray-400' : ''} ${
          open ? 'ring-2 ring-[var(--dms-color-brand-primary)]/20 border-[var(--dms-color-brand-primary)]/40' : ''
        }`}
      >
        <span className={selectedOption ? 'text-gray-900' : 'text-gray-500'}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <span className="ml-3 text-xs text-gray-400">{open ? '▲' : '▼'}</span>
      </button>
      {renderedDropdown}
    </div>
  )
}
