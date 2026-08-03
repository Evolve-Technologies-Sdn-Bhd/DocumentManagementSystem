import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as ReactDOM from 'react-dom'
import TextInput from './TextInput'

export default function MultiSelectSearchDropdown({
  options = [],
  value = [],
  onChange,
  placeholder = 'Select...',
  disabled = false
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 320, placement: 'bottom' })
  const buttonRef = useRef(null)
  const selectedKeys = useMemo(() => new Set((value || []).map((v) => String(v))), [value])

  const safeOptions = useMemo(() => (Array.isArray(options) ? options : []), [options])
  const optionValueByKey = useMemo(() => {
    const map = new Map()
    safeOptions.forEach((opt) => {
      map.set(String(opt?.value), opt?.value)
    })
    return map
  }, [safeOptions])
  const selectedOptions = useMemo(
    () => safeOptions.filter((opt) => selectedKeys.has(String(opt?.value))),
    [safeOptions, selectedKeys]
  )

  const buttonText = useMemo(() => {
    if (selectedOptions.length === 0) return placeholder
    const first = selectedOptions[0]?.label || placeholder
    if (selectedOptions.length === 1) return first
    return `${first} +${selectedOptions.length - 1}`
  }, [selectedOptions, placeholder])

  const filteredOptions = useMemo(() => {
    const q = String(search || '').trim().toLowerCase()
    if (!q) return safeOptions
    return safeOptions.filter((opt) => {
      const label = String(opt?.label || '').toLowerCase()
      const sub = String(opt?.subLabel || '').toLowerCase()
      return label.includes(q) || sub.includes(q)
    })
  }, [safeOptions, search])

  useEffect(() => {
    if (!isOpen || !buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const maxHeight = Math.min(360, Math.max(220, viewportHeight * 0.5))
    const spaceBelow = viewportHeight - rect.bottom
    const placement = spaceBelow < maxHeight + 12 && rect.top > spaceBelow ? 'top' : 'bottom'
    const top = placement === 'top' ? rect.top - maxHeight - 10 : rect.bottom + 10
    const left = rect.left
    const width = rect.width
    setDropdownPosition({ top, left, width, placement })
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    setSearch('')
  }, [isOpen])

  const toggleOption = (optValue) => {
    const key = String(optValue)
    const next = new Set(selectedKeys)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    const nextValues = Array.from(next).map((k) => optionValueByKey.get(k)).filter((v) => v !== undefined)
    onChange?.(nextValues)
  }

  const dropdown = isOpen && (
    <>
      <div className="fixed inset-0 z-[70]" onClick={() => setIsOpen(false)} />
      <div
        className="fixed z-[71] rounded-lg border border-gray-200 bg-white shadow-lg"
        style={{
          top: `${dropdownPosition.top}px`,
          left: `${dropdownPosition.left}px`,
          width: `${dropdownPosition.width}px`
        }}
      >
        <div className="p-3 border-b border-gray-200">
          <TextInput
            value={search}
            placeholder="Search..."
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
        <div className="max-h-[360px] overflow-auto p-2">
          {filteredOptions.length === 0 ? (
            <div className="px-2 py-2 text-sm text-gray-600">No results.</div>
          ) : (
            <div className="space-y-1">
              {filteredOptions.map((opt) => {
                const checked = selectedKeys.has(String(opt?.value))
                return (
                  <button
                    key={String(opt?.value)}
                    type="button"
                    onClick={() => toggleOption(opt?.value)}
                    className="w-full text-left rounded-lg border border-gray-200 bg-white px-3 py-2 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        readOnly
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-gray-900">{opt?.label || '-'}</div>
                        {opt?.subLabel ? <div className="truncate text-xs text-gray-600">{opt.subLabel}</div> : null}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-gray-200 px-3 py-2">
          <div className="text-xs text-gray-600">{selectedOptions.length} selected</div>
          <button
            type="button"
            className="text-xs font-semibold text-blue-600 hover:text-blue-700"
            onClick={() => setIsOpen(false)}
          >
            Done
          </button>
        </div>
      </div>
    </>
  )

  const renderedDropdown =
    typeof document !== 'undefined' && isOpen && ReactDOM?.createPortal && document.body
      ? ReactDOM.createPortal(dropdown, document.body)
      : dropdown

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        className={[
          'h-10 w-full rounded-2xl border bg-surface px-3 text-left text-sm text-ink outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-brand/30',
          disabled ? 'border-border opacity-60' : 'border-border hover:bg-surface-muted'
        ].join(' ')}
        onClick={() => {
          if (disabled) return
          setIsOpen((v) => !v)
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="truncate">{buttonText}</div>
          <svg className="h-4 w-4 text-ink-soft" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </button>
      {renderedDropdown}
    </>
  )
}
