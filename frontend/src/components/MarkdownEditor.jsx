import React, { useMemo, useState } from 'react'
import MarkdownRenderer from './MarkdownRenderer'

export default function MarkdownEditor({ label, value, onChange, rows = 3, placeholder }) {
  const [mode, setMode] = useState('edit')
  const v = typeof value === 'string' ? value : ''

  const isEmpty = useMemo(() => v.trim().length === 0, [v])

  return (
    <div>
      {label ? <label className="block text-sm font-medium text-ink mb-2">{label}</label> : null}
      <div className="flex items-center gap-2 mb-2">
        <button
          type="button"
          onClick={() => setMode('edit')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-xl border-2 transition-all duration-150 ${
            mode === 'edit'
              ? 'bg-[var(--dms-color-bg-surface)] border-[var(--dms-color-brand-primary)] text-[var(--dms-color-brand-primary)] ring-2 ring-[var(--dms-color-brand-primary)]/15 shadow-[0_2px_6px_rgba(15,23,42,0.06)]'
              : 'bg-transparent border-[var(--dms-color-border-default)] text-ink-muted hover:text-ink-secondary hover:border-[var(--dms-color-border-strong)]'
          }`}
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Edit
        </button>
        <button
          type="button"
          onClick={() => setMode('preview')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-xl border-2 transition-all duration-150 ${
            mode === 'preview'
              ? 'bg-gradient-to-br from-[var(--dms-color-brand-primary)] via-[var(--dms-color-brand-primary)]/92 to-[#0b2a4e] border-[var(--dms-color-brand-primary)] text-white shadow-[0_6px_18px_rgba(8,36,84,0.42)] ring-2 ring-[var(--dms-color-brand-primary)]/25'
              : 'bg-transparent border-[var(--dms-color-border-default)] text-ink-muted hover:text-ink-secondary hover:border-[var(--dms-color-border-strong)]'
          }`}
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          Preview
        </button>
      </div>

      {mode === 'edit' ? (
        <textarea
          value={v}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          className="w-full px-4 py-3 rounded-xl border-2 border-[var(--dms-color-border-default)] bg-[var(--dms-color-bg-surface)] text-ink placeholder:text-ink-muted outline-none focus:border-[var(--dms-color-brand-primary)] focus:ring-2 focus:ring-[var(--dms-color-brand-primary)]/20 transition-all duration-150 resize-y"
        />
      ) : (
        <div
          className="w-full px-5 py-4 rounded-xl border-2 border-[var(--dms-color-brand-primary)]/35 bg-gradient-to-br from-[#041029] via-[#0a1d45] to-[#0f2a5f] text-[#f1f6ff] min-h-[3rem] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_10px_28px_rgba(4,14,38,0.25)] ring-1 ring-[var(--dms-color-brand-primary)]/15"
        >
          {isEmpty ? (
            <div className="flex items-center gap-2 text-sm text-[color-mix(in_srgb,#f1f6ff_55%,transparent)] italic">
              <svg className="h-4 w-4 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              No content — start typing in Edit tab
            </div>
          ) : (
            <MarkdownRenderer value={v} className="text-sm text-[#f1f6ff] space-y-2 leading-relaxed prose prose-invert max-w-none prose-a:text-[color-mix(in_srgb,white_90%,#7dd3fc)]" />
          )}
        </div>
      )}
    </div>
  )
}
