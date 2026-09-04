import React, { useEffect, useMemo, useState } from 'react'
import Button from '../ui/Button'
import TextInput from '../ui/TextInput'
import TextArea from '../ui/TextArea'
import AppSurface from '../ui/AppSurface'
import InlineSpinner from '../ui/InlineSpinner'
import FormFieldRenderer, { FIELD_LABELS, FIELD_ICONS, hasOptions } from './FormFieldRenderer'

let _fid = 0
const fuid = () => `fld-${Date.now().toString(36)}-${(_fid++).toString(36)}`
const oid = () => `opt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

const FIELD_TYPES = [
  { type: 'SHORT_TEXT', label: 'Short Answer', icon: '📝' },
  { type: 'PARAGRAPH', label: 'Paragraph', icon: '📄' },
  { type: 'NUMBER', label: 'Number', icon: '🔢' },
  { type: 'DATE', label: 'Date', icon: '📅' },
  { type: 'TIME', label: 'Time', icon: '⏱' },
  { type: 'DATETIME', label: 'Date & Time', icon: '📆' },
  { type: 'DROPDOWN', label: 'Dropdown', icon: '▾' },
  { type: 'MULTIPLE_CHOICE', label: 'Multiple Choice', icon: '◉' },
  { type: 'CHECKBOX', label: 'Checkboxes', icon: '☑' },
  { type: 'YES_NO', label: 'Yes / No', icon: '✓/✕' },
  { type: 'TABLE', label: 'Table', icon: '▦' },
  { type: 'FILE', label: 'File Upload', icon: '📎' },
]

function createField(type = 'SHORT_TEXT', overrides = {}) {
  const base = {
    id: fuid(),
    type,
    label: '',
    helpText: '',
    placeholder: '',
    required: false,
  }
  if (hasOptions(type)) base.options = [{ id: oid(), label: 'Option 1', value: 'option_1' }]
  if (type === 'PARAGRAPH') base.rows = 3
  if (type === 'TABLE') {
    base.columns = [
      { id: oid(), key: 'no', label: 'No.', type: 'text' },
      { id: oid(), key: 'perkara', label: 'Perkara', type: 'text' },
      { id: oid(), key: 'catatan', label: 'Catatan', type: 'text' },
    ]
    base.minRows = 2
  }
  return { ...base, ...overrides }
}

function normalizeSchema(raw) {
  if (!raw) return { fields: [], title: '', description: '' }
  if (Array.isArray(raw)) return { fields: raw, title: '', description: '' }
  const fields = Array.isArray(raw?.fields) ? raw.fields.map((f, i) => ({ ...createField(f.type, f), id: f.id || fuid() })) : []
  return {
    title: typeof raw.title === 'string' ? raw.title : '',
    description: typeof raw.description === 'string' ? raw.description : '',
    fields,
  }
}

function schemaToPlainText(schema) {
  const s = normalizeSchema(schema)
  const lines = []
  if (s.title) lines.push(s.title)
  if (s.description) lines.push(s.description)
  s.fields.forEach((f, i) => {
    lines.push(`${i + 1}. ${f.label || FIELD_LABELS[f.type] || f.type}${f.required ? ' *' : ''} (${FIELD_LABELS[f.type] || f.type})`)
    if (hasOptions(f.type)) {
      ;(f.options || []).forEach((o, j) => lines.push(`   ${j + 1}) ${o.label}`))
    }
  })
  return lines.join('\n')
}

export default function FormBuilder({
  label,
  value,
  onChange,
  onTextChange,
  className = '',
  required = false,
  initialMode = 'build', // 'build' | 'preview'
}) {
  const [schema, setSchema] = useState(() => normalizeSchema(value))
  const [mode, setMode] = useState(initialMode)
  const [selectedId, setSelectedId] = useState(null)
  const [pickTypeFor, setPickTypeFor] = useState(null)

  useEffect(() => {
    const n = normalizeSchema(value)
    const a = JSON.stringify({ title: schema.title, description: schema.description, fields: schema.fields })
    const b = JSON.stringify({ title: n.title, description: n.description, fields: n.fields })
    if (a !== b) setSchema(n)
  }, [value])

  const emit = (next = schema) => {
    const data = {
      schemaVersion: 1,
      title: next.title,
      description: next.description,
      fields: next.fields.map((f) => {
        const copy = { ...f }
        if (hasOptions(f.type)) copy.options = (f.options || []).map((o) => ({ ...o }))
        if (f.type === 'TABLE') {
          copy.columns = Array.isArray(f.columns) ? f.columns.map((c) => ({ ...c })) : []
          copy.minRows = typeof f.minRows === 'number' ? f.minRows : 2
        }
        return copy
      }),
      meta: {
        fieldCount: next.fields.length,
        requiredCount: next.fields.filter((f) => !!f.required).length,
      },
    }
    if (typeof onChange === 'function') onChange(data)
    if (typeof onTextChange === 'function') onTextChange(schemaToPlainText(data))
  }

  const setField = (id, patch) => {
    const fields = schema.fields.map((f) => (f.id === id ? { ...f, ...patch } : f))
    const next = { ...schema, fields }
    setSchema(next)
    emit(next)
  }

  const addField = (type = 'SHORT_TEXT') => {
    const f = createField(type)
    const next = { ...schema, fields: [...schema.fields, f] }
    setSchema(next)
    setSelectedId(f.id)
    setPickTypeFor(null)
    emit(next)
  }

  const duplicateField = (id) => {
    const idx = schema.fields.findIndex((f) => f.id === id)
    if (idx < 0) return
    const src = schema.fields[idx]
    const copy = {
      ...src,
      id: fuid(),
      label: `${src.label || 'Untitled'} (copy)`,
    }
    if (hasOptions(src.type)) copy.options = (src.options || []).map((o) => ({ ...o, id: oid() }))
    if (src.type === 'TABLE') copy.columns = (src.columns || []).map((c) => ({ ...c, id: oid() }))
    const fields = schema.fields.slice()
    fields.splice(idx + 1, 0, copy)
    const next = { ...schema, fields }
    setSchema(next)
    emit(next)
  }

  const removeField = (id) => {
    const next = { ...schema, fields: schema.fields.filter((f) => f.id !== id) }
    setSchema(next)
    if (selectedId === id) setSelectedId(null)
    emit(next)
  }

  const moveField = (id, dir) => {
    const idx = schema.fields.findIndex((f) => f.id === id)
    if (idx < 0) return
    const j = idx + dir
    if (j < 0 || j >= schema.fields.length) return
    const fields = schema.fields.slice()
    const [it] = fields.splice(idx, 1)
    fields.splice(j, 0, it)
    const next = { ...schema, fields }
    setSchema(next)
    emit(next)
  }

  const addOption = (fieldId) => {
    const f = schema.fields.find((x) => x.id === fieldId)
    if (!f || !hasOptions(f.type)) return
    const n = (f.options || []).length + 1
    const nextOptions = [...(f.options || []), { id: oid(), label: `Option ${n}`, value: `option_${n}` }]
    setField(fieldId, { options: nextOptions })
  }

  const updateOption = (fieldId, optId, patch) => {
    const f = schema.fields.find((x) => x.id === fieldId)
    if (!f || !hasOptions(f.type)) return
    const options = (f.options || []).map((o) => (o.id === optId ? { ...o, ...patch } : o))
    setField(fieldId, { options })
  }

  const removeOption = (fieldId, optId) => {
    const f = schema.fields.find((x) => x.id === fieldId)
    if (!f || !hasOptions(f.type)) return
    const options = (f.options || []).filter((o) => o.id !== optId)
    const safe = options.length === 0 ? [{ id: oid(), label: 'Option 1', value: 'option_1' }] : options
    setField(fieldId, { options: safe })
  }

  const addColumn = (fieldId) => {
    const f = schema.fields.find((x) => x.id === fieldId)
    if (!f || f.type !== 'TABLE') return
    const n = (f.columns || []).length + 1
    const nextColumns = [...(f.columns || []), { id: oid(), key: `col_${n}`, label: `Column ${n}`, type: 'text' }]
    setField(fieldId, { columns: nextColumns })
  }

  const updateColumn = (fieldId, colId, patch) => {
    const f = schema.fields.find((x) => x.id === fieldId)
    if (!f || f.type !== 'TABLE') return
    const columns = (f.columns || []).map((c) => (c.id === colId ? { ...c, ...patch } : c))
    setField(fieldId, { columns })
  }

  const removeColumn = (fieldId, colId) => {
    const f = schema.fields.find((x) => x.id === fieldId)
    if (!f || f.type !== 'TABLE') return
    let columns = (f.columns || []).filter((c) => c.id !== colId)
    if (columns.length === 0) columns = [{ id: oid(), key: 'col_1', label: 'Column 1', type: 'text' }]
    setField(fieldId, { columns })
  }

  const updateTop = (patch) => {
    const next = { ...schema, ...patch }
    setSchema(next)
    emit(next)
  }

  const selected = schema.fields.find((f) => f.id === selectedId) || null

  return (
    <div className={className}>
      {label ? (
        <label className="block text-sm font-medium text-ink-secondary mb-2">
          {label} {required ? <span className="text-red-500">*</span> : null}
        </label>
      ) : null}

      <div className="rounded-[18px] border border-border bg-surface shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-surface-muted/50 flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <svg className="w-4 h-4 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M7 9h10M7 13h10M7 17h6" />
            </svg>
            <span className="text-xs text-ink-secondary font-medium">
              {schema.fields.length} field{schema.fields.length === 1 ? '' : 's'}
              {schema.fields.filter((f) => f.required).length ? (
                <span className="ml-2 text-brand">· {schema.fields.filter((f) => f.required).length} required</span>
              ) : null}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMode('build')}
              className={`px-3 h-8 rounded-lg text-xs ${mode === 'build' ? 'bg-brand/10 text-brand' : 'text-ink-muted hover:text-ink'}`}
            >
              Design
            </button>
            <button
              type="button"
              onClick={() => setMode('preview')}
              className={`px-3 h-8 rounded-lg text-xs ${mode === 'preview' ? 'bg-brand/10 text-brand' : 'text-ink-muted hover:text-ink'}`}
            >
              Preview
            </button>
          </div>
        </div>

        {mode === 'build' ? (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-0">
            <div className="lg:col-span-3 p-4 space-y-4 border-b lg:border-b-0 lg:border-r border-border">
              <div className="rounded-[14px] border border-brand/20 bg-gradient-to-br from-brand/5 to-transparent p-4 space-y-2">
                <TextInput
                  label="Form Title"
                  value={schema.title}
                  onChange={(e) => updateTop({ title: e.target.value })}
                  placeholder="My Form"
                />
                <TextArea
                  label="Description"
                  value={schema.description}
                  onChange={(e) => updateTop({ description: e.target.value })}
                  placeholder="Short description or instructions for the responder…"
                  rows={2}
                  className="resize-none"
                />
              </div>

              {schema.fields.length === 0 ? (
                <div className="rounded-[14px] border border-dashed border-border p-8 text-center text-sm text-ink-muted">
                  No fields yet. Use the panel on the right, or click
                  <span className="mx-1 inline-block">
                    <button className="text-brand font-medium underline underline-offset-2" onClick={() => addField('SHORT_TEXT')}>
                      + Add Field
                    </button>
                  </span>
                  to get started.
                </div>
              ) : (
                <ul className="space-y-3">
                  {schema.fields.map((field, idx) => {
                    const isSelected = selectedId === field.id
                    return (
                      <li
                        key={field.id}
                        onClick={() => setSelectedId(field.id)}
                        className={`group rounded-[14px] border p-3 cursor-pointer transition ${
                          isSelected ? 'border-brand ring-2 ring-brand/10 bg-surface' : 'border-border hover:border-brand/40 bg-surface'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <div className="pt-0.5 text-ink-muted w-6 text-center text-xs select-none">{idx + 1}.</div>
                          <div className="flex-1 min-w-0 space-y-2">
                            <FormFieldRenderer
                              field={{
                                ...field,
                                label: field.label || `Untitled ${FIELD_LABELS[field.type] || field.type} field`,
                              }}
                              disabled
                            />
                            {hasOptions(field.type) ? null : (
                              <div className="text-[11px] text-ink-muted">
                                Type: <span className="font-medium text-ink-secondary">{FIELD_ICONS[field.type]} {FIELD_LABELS[field.type] || field.type}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); moveField(field.id, -1) }}
                              disabled={idx === 0}
                              className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink disabled:opacity-30"
                              title="Move up"
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); moveField(field.id, 1) }}
                              disabled={idx === schema.fields.length - 1}
                              className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink disabled:opacity-30"
                              title="Move down"
                            >
                              ▼
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); duplicateField(field.id) }}
                              className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink"
                              title="Duplicate"
                            >
                              ⎘
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); removeField(field.id) }}
                              className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-rose-600/80 hover:bg-rose-50 hover:text-rose-700"
                              title="Delete"
                            >
                              🗑
                            </button>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}

              <button
                type="button"
                onClick={() => setPickTypeFor('new')}
                className="w-full rounded-[14px] border border-dashed border-border px-4 py-3 text-sm font-medium text-ink-secondary hover:border-brand hover:text-brand hover:bg-brand/5 transition-colors flex items-center justify-center gap-2"
              >
                <span className="text-lg leading-none">＋</span> Add Field
              </button>
            </div>

            <div className="lg:col-span-2 p-4 space-y-4 bg-surface-muted/40">
              {selected ? (
                <>
                  <div className="flex items-center gap-2 text-xs text-ink-secondary">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-6 w-6 rounded-lg bg-surface inline-flex items-center justify-center text-sm">
                        {FIELD_ICONS[selected.type]}
                      </span>
                      <span className="font-medium text-ink">{FIELD_LABELS[selected.type] || selected.type}</span>
                    </span>
                    <span className="ml-auto">
                      <button
                        type="button"
                        onClick={() => setPickTypeFor(selected.id)}
                        className="px-2 h-7 rounded-md border border-border bg-surface text-[11px] hover:bg-surface-hover"
                      >
                        Change type
                      </button>
                    </span>
                  </div>

                  <TextInput
                    label="Question / Label"
                    value={selected.label}
                    onChange={(e) => setField(selected.id, { label: e.target.value })}
                    placeholder="e.g. What is your name?"
                  />
                  {['SHORT_TEXT', 'PARAGRAPH', 'NUMBER'].includes(selected.type) ? (
                    <TextInput
                      label="Placeholder"
                      value={selected.placeholder}
                      onChange={(e) => setField(selected.id, { placeholder: e.target.value })}
                      placeholder="Your answer…"
                    />
                  ) : null}

                  <TextArea
                    label="Help text (optional)"
                    value={selected.helpText}
                    onChange={(e) => setField(selected.id, { helpText: e.target.value })}
                    placeholder="Additional hint for the responder"
                    rows={2}
                    className="resize-none"
                  />

                  {selected.type === 'PARAGRAPH' ? (
                    <div className="grid grid-cols-2 gap-3">
                      <TextInput
                        label="Rows"
                        type="number"
                        min={1}
                        value={selected.rows || 3}
                        onChange={(e) => setField(selected.id, { rows: Math.max(1, parseInt(e.target.value || '3', 10)) })}
                      />
                    </div>
                  ) : null}

                  {selected.type === 'TABLE' ? (
                    <div className="space-y-3">
                      <TextInput
                        label="Minimum Rows"
                        type="number"
                        min={0}
                        value={typeof selected.minRows === 'number' ? selected.minRows : 2}
                        onChange={(e) => setField(selected.id, { minRows: Math.max(0, parseInt(e.target.value || '0', 10)) })}
                      />
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-medium text-ink-secondary">Columns</div>
                          <button
                            type="button"
                            onClick={() => addColumn(selected.id)}
                            className="text-xs text-brand hover:text-brand-hover font-medium underline underline-offset-2"
                          >
                            + Add Column
                          </button>
                        </div>
                        <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
                          {(selected.columns || []).map((col, ci) => (
                            <li key={col.id} className="rounded-xl border border-border p-2 space-y-2 bg-surface-muted/30">
                              <div className="grid grid-cols-12 gap-2 items-start">
                                <div className="col-span-1 text-[11px] text-ink-muted pt-2 text-center">{ci + 1}</div>
                                <div className="col-span-7">
                                  <TextInput
                                    value={col.label}
                                    onChange={(e) => {
                                      const label = e.target.value
                                      const derived = label.trim()
                                        .toLowerCase()
                                        .replace(/[^a-z0-9]+/g, '_')
                                        .replace(/^_+|_+$/g, '') || `col_${ci + 1}`
                                      updateColumn(selected.id, col.id, { label, key: derived })
                                    }}
                                    placeholder="Label (e.g. Perbincangan)"
                                    className="!py-1.5"
                                  />
                                </div>
                                <div className="col-span-3">
                                  <select
                                    value={col.type || 'text'}
                                    onChange={(e) => updateColumn(selected.id, col.id, { type: e.target.value })}
                                    className="block w-full rounded-xl border border-border bg-surface px-2 py-1.5 text-xs text-ink shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                                  >
                                    <option value="text">Text</option>
                                    <option value="number">Number</option>
                                    <option value="paragraph">Paragraph</option>
                                  </select>
                                </div>
                                <div className="col-span-1 flex justify-end">
                                  <button
                                    type="button"
                                    onClick={() => removeColumn(selected.id, col.id)}
                                    className="h-7 w-7 inline-flex items-center justify-center rounded-md text-rose-600/80 hover:bg-rose-50 hover:text-rose-700"
                                    title="Remove column"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                              <div className="pl-5 text-[10px] font-mono text-ink-muted truncate">
                                key: {col.key || '—'}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : null}

                  {hasOptions(selected.type) ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-medium text-ink-secondary">Options</div>
                        <button
                          type="button"
                          onClick={() => addOption(selected.id)}
                          className="text-xs text-brand hover:text-brand-hover font-medium underline underline-offset-2"
                        >
                          + Add option
                        </button>
                      </div>
                      <ul className="space-y-2">
                        {(selected.options || []).map((opt, oi) => (
                          <li key={opt.id} className="flex items-center gap-2">
                            <div className="text-xs text-ink-muted w-5 text-right shrink-0">{oi + 1}.</div>
                            <TextInput
                              value={opt.label}
                              onChange={(e) => {
                                const label = e.target.value
                                const derived = label.trim()
                                  .toLowerCase()
                                  .replace(/[^a-z0-9]+/g, '_')
                                  .replace(/^_+|_+$/g, '') || `option_${oi + 1}`
                                updateOption(selected.id, opt.id, { label, value: derived })
                              }}
                              placeholder={`Option ${oi + 1}`}
                              className="!py-1.5"
                            />
                            <button
                              type="button"
                              onClick={() => removeOption(selected.id, opt.id)}
                              className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-rose-600/80 hover:bg-rose-50 hover:text-rose-700"
                              title="Remove option"
                            >
                              ✕
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <div className="text-xs text-ink-secondary">Required</div>
                    <label className="inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!selected.required}
                        onChange={(e) => setField(selected.id, { required: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="relative w-11 h-6 bg-border rounded-full peer peer-checked:bg-brand transition-colors">
                        <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
                      </div>
                    </label>
                  </div>
                </>
              ) : (
                <div className="rounded-[14px] border border-dashed border-border p-6 text-center text-sm text-ink-muted">
                  Select a field on the left to edit it.
                </div>
              )}

              <div>
                <div className="text-xs font-medium text-ink-secondary mb-2">Quick add</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {FIELD_TYPES.map((t) => (
                    <button
                      key={t.type}
                      type="button"
                      onClick={() => addField(t.type)}
                      className="text-left px-2.5 py-2 rounded-lg text-xs border border-border bg-surface hover:border-brand hover:bg-brand/5 text-ink-secondary hover:text-ink transition-colors"
                    >
                      <span className="mr-1">{t.icon}</span>{t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 max-w-2xl mx-auto space-y-4">
            <div className="rounded-[14px] border border-brand/20 bg-gradient-to-br from-brand/5 to-transparent p-4 space-y-1">
              <div className="text-lg font-semibold text-ink">{schema.title || 'Untitled Form'}</div>
              {schema.description ? (
                <div className="text-sm text-ink-secondary">{schema.description}</div>
              ) : null}
            </div>
            {schema.fields.length === 0 ? (
              <div className="rounded-[14px] border border-dashed border-border p-8 text-center text-sm text-ink-muted">
                This form has no fields yet. Switch to <b>Design</b> mode to add questions.
              </div>
            ) : (
              schema.fields.map((f) => (
                <div key={f.id} className="rounded-[14px] border border-border p-3">
                  <FormFieldRenderer field={f} />
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {pickTypeFor ? (
        <div
          className="fixed inset-0 z-[110] bg-black/40 flex items-center justify-center p-4"
          onClick={() => setPickTypeFor(null)}
        >
          <div
            className="bg-surface rounded-[18px] border border-border shadow-dms-lg max-w-md w-full p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-ink">
                {pickTypeFor === 'new' ? 'Choose a field type' : 'Change field type'}
              </div>
              <button
                type="button"
                onClick={() => setPickTypeFor(null)}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {FIELD_TYPES.map((t) => (
                <button
                  key={t.type}
                  type="button"
                  onClick={() => {
                    if (pickTypeFor === 'new') {
                      addField(t.type)
                    } else {
                      const prev = schema.fields.find((f) => f.id === pickTypeFor)
                      const base = createField(t.type, {
                        id: pickTypeFor,
                        label: prev?.label || '',
                        helpText: prev?.helpText || '',
                        placeholder: prev?.placeholder || '',
                        required: !!prev?.required,
                      })
                      setField(pickTypeFor, base)
                      setPickTypeFor(null)
                    }
                  }}
                  className="text-left px-3 py-2.5 rounded-[14px] border border-border bg-surface hover:border-brand hover:bg-brand/5 text-sm text-ink-secondary hover:text-ink transition-colors"
                >
                  <div className="text-base mb-0.5">{t.icon}</div>
                  <div className="font-medium">{t.label}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export { FIELD_LABELS, FIELD_ICONS, createField, normalizeSchema, schemaToPlainText }
