import React, { useMemo } from 'react'
import TextInput from '../ui/TextInput'
import TextArea from '../ui/TextArea'
import SelectField from '../ui/SelectField'

const FIELD_LABELS = {
  SHORT_TEXT: 'Short Answer',
  PARAGRAPH: 'Paragraph',
  NUMBER: 'Number',
  DATE: 'Date',
  TIME: 'Time',
  DATETIME: 'Date & Time',
  DROPDOWN: 'Dropdown',
  MULTIPLE_CHOICE: 'Multiple Choice',
  CHECKBOX: 'Checkboxes',
  YES_NO: 'Yes / No',
  FILE: 'File Upload',
  TABLE: 'Table',
}

const FIELD_ICONS = {
  SHORT_TEXT: '📝',
  PARAGRAPH: '📄',
  NUMBER: '🔢',
  DATE: '📅',
  TIME: '⏱',
  DATETIME: '📆',
  DROPDOWN: '▾',
  MULTIPLE_CHOICE: '◉',
  CHECKBOX: '☑',
  YES_NO: '✓ / ✕',
  FILE: '📎',
  TABLE: '▦',
}

function hasOptions(type) {
  return type === 'DROPDOWN' || type === 'MULTIPLE_CHOICE' || type === 'CHECKBOX'
}

export default function FormFieldRenderer({
  field,
  value,
  onChange,
  disabled = false,
  showLabel = true,
  className = '',
}) {
  const id = useMemo(() => `field-${field?.id || Math.random()}`, [field?.id])
  const type = field?.type || 'SHORT_TEXT'
  const required = !!field?.required
  const options = field?.options || []

  if (!field) return null

  const commonPlaceholder = field?.placeholder || ''

  const inputBase =
    'block w-full rounded-[14px] border border-border bg-surface px-3 py-2.5 text-sm text-ink shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-brand/30'

  const render = () => {
    switch (type) {
      case 'SHORT_TEXT':
        return (
          <input
            id={id}
            type="text"
            disabled={disabled}
            placeholder={commonPlaceholder}
            value={value ?? ''}
            onChange={(e) => onChange?.(e.target.value)}
            className={inputBase}
          />
        )
      case 'PARAGRAPH':
        return (
          <textarea
            id={id}
            rows={field?.rows || 3}
            disabled={disabled}
            placeholder={commonPlaceholder}
            value={value ?? ''}
            onChange={(e) => onChange?.(e.target.value)}
            className={`${inputBase} resize-none`}
          />
        )
      case 'NUMBER':
        return (
          <input
            id={id}
            type="number"
            disabled={disabled}
            placeholder={commonPlaceholder}
            value={value ?? ''}
            onChange={(e) => onChange?.(e.target.value)}
            className={inputBase}
          />
        )
      case 'DATE':
        return (
          <input
            id={id}
            type="date"
            disabled={disabled}
            value={value ?? ''}
            onChange={(e) => onChange?.(e.target.value)}
            className={inputBase}
          />
        )
      case 'TIME':
        return (
          <input
            id={id}
            type="time"
            disabled={disabled}
            value={value ?? ''}
            onChange={(e) => onChange?.(e.target.value)}
            className={inputBase}
          />
        )
      case 'DATETIME':
        return (
          <input
            id={id}
            type="datetime-local"
            disabled={disabled}
            value={value ?? ''}
            onChange={(e) => onChange?.(e.target.value)}
            className={inputBase}
          />
        )
      case 'YES_NO': {
        const v = value === true ? 'YES' : value === false ? 'NO' : ''
        return (
          <div className="flex items-center gap-2">
            {[
              { k: 'YES', label: 'Yes' },
              { k: 'NO', label: 'No' },
            ].map((o) => (
              <label key={o.k} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name={id}
                  value={o.k}
                  disabled={disabled}
                  checked={v === o.k}
                  onChange={() => onChange?.(o.k === 'YES')}
                  className="text-brand focus:ring-brand/30"
                />
                <span className="text-sm text-ink">{o.label}</span>
              </label>
            ))}
          </div>
        )
      }
      case 'MULTIPLE_CHOICE':
        return (
          <div className="space-y-2">
            {options.map((opt, idx) => (
              <label key={idx} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name={id}
                  value={opt.value || opt.label}
                  disabled={disabled}
                  checked={String(value ?? '') === String(opt.value || opt.label)}
                  onChange={() => onChange?.(opt.value || opt.label)}
                  className="text-brand focus:ring-brand/30"
                />
                <span className="text-sm text-ink">{opt.label}</span>
              </label>
            ))}
          </div>
        )
      case 'CHECKBOX': {
        const arr = Array.isArray(value) ? value : []
        const toggle = (v) => {
          const set = new Set(arr.map((x) => String(x)))
          if (set.has(String(v))) set.delete(String(v))
          else set.add(String(v))
          onChange?.(Array.from(set))
        }
        return (
          <div className="space-y-2">
            {options.map((opt, idx) => (
              <label key={idx} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={arr.map((x) => String(x)).includes(String(opt.value || opt.label))}
                  onChange={() => toggle(opt.value || opt.label)}
                  className="rounded-md border-border text-brand focus:ring-brand/30"
                />
                <span className="text-sm text-ink">{opt.label}</span>
              </label>
            ))}
          </div>
        )
      }
      case 'DROPDOWN': {
        return (
          <select
            id={id}
            disabled={disabled}
            value={value ?? ''}
            onChange={(e) => onChange?.(e.target.value)}
            className={inputBase}
          >
            <option value="">{commonPlaceholder || 'Choose an option'}</option>
            {options.map((opt, idx) => (
              <option key={idx} value={opt.value || opt.label}>
                {opt.label}
              </option>
            ))}
          </select>
        )
      }
      case 'FILE':
        return (
          <div className={`${inputBase} bg-surface-muted/50 text-ink-muted flex items-center justify-center`}>
            📎 File upload field
          </div>
        )
      case 'TABLE': {
        const columns = Array.isArray(field.columns) && field.columns.length > 0
          ? field.columns
          : [
              { id: 'col_1', key: 'no', label: 'No.', type: 'text' },
              { id: 'col_2', key: 'item', label: 'Item', type: 'text' },
              { id: 'col_3', key: 'notes', label: 'Notes', type: 'text' },
            ]
        const minRows = typeof field.minRows === 'number' ? field.minRows : 2
        const parsedVal = typeof value === 'string'
          ? (() => { try { return JSON.parse(value) } catch { return null } })()
          : value
        const existingRows = Array.isArray(parsedVal?.rows) ? parsedVal.rows : []
        const paddedRows = (() => {
          const rows = existingRows.map(r => ({ ...r }))
          while (rows.length < minRows) {
            const emptyRow = {}
            columns.forEach(c => { emptyRow[c.key] = '' })
            rows.push(emptyRow)
          }
          return rows
        })()

        if (disabled) {
          return (
            <div className="overflow-hidden rounded-2xl border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-muted">
                  <tr>
                    {columns.map((c) => (
                      <th key={c.id} className="px-3 py-2 font-medium text-ink-secondary">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface">
                  {paddedRows.map((row, ri) => (
                    <tr key={ri}>
                      {columns.map((c) => (
                        <td key={c.id} className="px-3 py-2 text-ink-muted">
                          <span className="inline-block min-h-[1.5rem]">
                            {row[c.key]?.toString() || '—'}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }

        const updateCell = (rowIdx, colKey, val) => {
          const next = paddedRows.map(r => ({ ...r }))
          next[rowIdx] = { ...next[rowIdx], [colKey]: val }
          onChange?.({ rows: next })
        }
        const addRow = () => {
          const emptyRow = {}
          columns.forEach(c => { emptyRow[c.key] = '' })
          onChange?.({ rows: [...paddedRows, emptyRow] })
        }
        const removeRow = (idx) => {
          if (paddedRows.length <= Math.max(1, minRows)) return
          const next = paddedRows.filter((_, i) => i !== idx)
          onChange?.({ rows: next })
        }

        return (
          <div className="space-y-2">
            <div className="overflow-hidden rounded-2xl border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-muted">
                  <tr>
                    {columns.map((c, ci) => (
                      <th key={c.id} className={`px-3 py-2 font-medium text-ink-secondary ${ci === 0 ? '' : 'border-l border-border'}`}>
                        {c.label}
                      </th>
                    ))}
                    <th className="w-10 px-2 py-2 border-l border-border" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface">
                  {paddedRows.map((row, ri) => (
                    <tr key={ri}>
                      {columns.map((c, ci) => {
                        const cellBase = 'w-full bg-transparent px-2 py-1.5 text-sm text-ink outline-none focus:bg-brand-50/40 rounded-lg'
                        return (
                          <td key={c.id} className={`px-1 py-1 ${ci === 0 ? '' : 'border-l border-border'}`}>
                            {c.type === 'paragraph' ? (
                              <textarea
                                rows={2}
                                value={row[c.key] ?? ''}
                                onChange={(e) => updateCell(ri, c.key, e.target.value)}
                                className={`${cellBase} resize-none align-top`}
                              />
                            ) : c.type === 'number' ? (
                              <input
                                type="number"
                                value={row[c.key] ?? ''}
                                onChange={(e) => updateCell(ri, c.key, e.target.value)}
                                className={cellBase}
                              />
                            ) : (
                              <input
                                type="text"
                                value={row[c.key] ?? ''}
                                onChange={(e) => updateCell(ri, c.key, e.target.value)}
                                className={cellBase}
                              />
                            )}
                          </td>
                        )
                      })}
                      <td className="w-10 px-1 py-1 border-l border-border text-center align-top">
                        <button
                          type="button"
                          onClick={() => removeRow(ri)}
                          disabled={paddedRows.length <= Math.max(1, minRows)}
                          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-rose-500 hover:bg-rose-50 disabled:opacity-30 disabled:hover:bg-transparent"
                          title="Remove row"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-[11px] text-ink-muted">
                {minRows > 0 ? `Minimum ${minRows} row${minRows === 1 ? '' : 's'} · ` : ''}
                {paddedRows.length} row{paddedRows.length === 1 ? '' : 's'} total
              </div>
              <button
                type="button"
                onClick={addRow}
                className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-2.5 py-1 text-xs text-ink-secondary hover:border-brand hover:text-brand hover:bg-brand/5 transition-colors"
              >
                <span className="text-sm leading-none">＋</span> Add Row
              </button>
            </div>
          </div>
        )
      }
      default:
        return <div className={`${inputBase} bg-surface-muted/50 text-ink-muted`}>Unknown field type</div>
    }
  }

  return (
    <div className={className}>
      {showLabel ? (
        <div className="flex items-center gap-1 mb-2">
          <span className="text-sm text-ink-secondary">
            <span className="font-medium">{FIELD_ICONS[type] || '•'}</span>{' '}
            <span className="font-medium">{field.label || `Untitled (${FIELD_LABELS[type] || type})`}</span>
            {required ? <span className="text-red-500 ml-0.5">*</span> : null}
          </span>
        </div>
      ) : null}
      {render()}
      {field.helpText ? (
        <div className="mt-1.5 text-xs text-ink-muted">{field.helpText}</div>
      ) : null}
    </div>
  )
}

export { FIELD_LABELS, FIELD_ICONS, hasOptions }
