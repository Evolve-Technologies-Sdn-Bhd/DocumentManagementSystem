import React, { useEffect, useState } from 'react'
import Button from '../ui/Button'
import TextInput from '../ui/TextInput'
import InlineSpinner from '../ui/InlineSpinner'

let _id = 0
const uid = (prefix = 'itm') => `${prefix}-${Date.now().toString(36)}-${(_id++).toString(36)}`

function normalizeValue(raw) {
  if (Array.isArray(raw)) return raw
  if (raw && Array.isArray(raw.items)) return raw.items
  return []
}

export default function ChecklistEditor({
  label,
  value,
  onChange,
  onTextChange,
  placeholder = 'Add a checklist item…',
  className = '',
  required = false,
}) {
  const [items, setItems] = useState(() => normalizeValue(value || []))
  const [draftText, setDraftText] = useState('')

  useEffect(() => {
    if (!Array.isArray(value) && value && Array.isArray(value?.items)) {
      if (JSON.stringify(value.items) !== JSON.stringify(items)) setItems(value.items)
    } else if (Array.isArray(value) && JSON.stringify(value) !== JSON.stringify(items)) {
      setItems(value)
    }
  }, [value])

  const emitChange = (next = items) => {
    const checked = next.filter((i) => !!i.checked).length
    const data = {
      items: next,
      meta: {
        total: next.length,
        checked,
        percent: next.length ? Math.round((checked / next.length) * 100) : 0,
      },
    }
    const plain = next.map((i) => `${i.checked ? '[x]' : '[ ]'} ${i.text}`).join('\n')
    if (typeof onChange === 'function') onChange(data)
    if (typeof onTextChange === 'function') onTextChange(plain)
  }

  const addItem = (text = draftText.trim()) => {
    if (!text) return
    const next = [...items, { id: uid('cl'), text, checked: false, createdAt: Date.now() }]
    setItems(next)
    setDraftText('')
    emitChange(next)
  }

  const updateItem = (id, patch) => {
    const next = items.map((i) => (i.id === id ? { ...i, ...patch } : i))
    setItems(next)
    emitChange(next)
  }

  const removeItem = (id) => {
    const next = items.filter((i) => i.id !== id)
    setItems(next)
    emitChange(next)
  }

  const moveItem = (id, dir) => {
    const idx = items.findIndex((i) => i.id === id)
    if (idx < 0) return
    const j = idx + dir
    if (j < 0 || j >= items.length) return
    const next = items.slice()
    const [it] = next.splice(idx, 1)
    next.splice(j, 0, it)
    setItems(next)
    emitChange(next)
  }

  const total = items.length
  const checked = items.filter((i) => !!i.checked).length
  const percent = total ? Math.round((checked / total) * 100) : 0

  return (
    <div className={className}>
      {label ? (
        <label className="block text-sm font-medium text-ink-secondary mb-2">
          {label} {required ? <span className="text-red-500">*</span> : null}
        </label>
      ) : null}

      <div className="rounded-[18px] border border-border bg-surface shadow-sm focus-within:ring-2 focus-within:ring-brand/30 transition-shadow overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-surface-muted/50 flex items-center gap-3 text-xs text-ink-muted">
          <div className="flex-1 flex items-center gap-2">
            <span className="inline-flex items-center gap-1">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M8 11l2 2 4-4" />
              </svg>
              {checked}/{total} completed
            </span>
            <span className="inline-flex items-center gap-2 flex-1 max-w-[180px]">
              <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand transition-all"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <span className="font-medium text-ink-secondary">{percent}%</span>
            </span>
          </div>
        </div>

        <ul className="divide-y divide-border/80">
          {items.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-ink-muted">
              No checklist items yet. Add your first item below.
            </li>
          ) : (
            items.map((item, idx) => (
              <li key={item.id} className="group flex items-start gap-3 px-3 py-2 hover:bg-surface-muted/40 transition-colors">
                <div className="pt-0.5">
                  <label className="inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!item.checked}
                      onChange={(e) => updateItem(item.id, { checked: e.target.checked })}
                      className="h-5 w-5 rounded-md border-border text-brand focus:ring-brand/30"
                    />
                  </label>
                </div>
                <div className="flex-1 min-w-0">
                  <TextInput
                    type="text"
                    value={item.text}
                    onChange={(e) => updateItem(item.id, { text: e.target.value })}
                    className="!border-0 !shadow-none !bg-transparent !px-0 !py-1"
                  />
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    type="button"
                    onClick={() => moveItem(item.id, -1)}
                    disabled={idx === 0}
                    className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink disabled:opacity-30"
                    title="Move up"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => moveItem(item.id, 1)}
                    disabled={idx === items.length - 1}
                    className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink disabled:opacity-30"
                    title="Move down"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-rose-600/80 hover:bg-rose-50 hover:text-rose-700"
                    title="Remove item"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>

        <div className="px-3 py-3 border-t border-border bg-surface-muted/40 flex items-center gap-2">
          <div className="flex-1">
            <TextInput
              type="text"
              value={draftText}
              placeholder={placeholder}
              onChange={(e) => setDraftText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addItem()
                }
              }}
              className="!bg-surface"
            />
          </div>
          <Button type="button" size="sm" onClick={() => addItem()}>
            Add Item
          </Button>
        </div>
      </div>
    </div>
  )
}
