import React, { useEffect, useRef, useState } from 'react'
import TextInput from '../ui/TextInput'

const TOOLBAR_BUTTONS = [
  { cmd: 'bold', label: 'B', title: 'Bold', style: 'font-bold' },
  { cmd: 'italic', label: 'I', title: 'Italic', style: 'italic' },
  { cmd: 'underline', label: 'U', title: 'Underline', style: 'underline' },
  { cmd: 'strikeThrough', label: 'S', title: 'Strikethrough', style: 'line-through' },
  { separator: true },
  { cmd: 'insertUnorderedList', label: '• List', title: 'Bullet List' },
  { cmd: 'insertOrderedList', label: '1. List', title: 'Numbered List' },
  { separator: true },
  { cmd: 'justifyLeft', label: '⯇', title: 'Align Left' },
  { cmd: 'justifyCenter', label: '≡', title: 'Align Center' },
  { cmd: 'justifyRight', label: '⯈', title: 'Align Right' },
  { separator: true },
  { cmd: 'undo', label: '↶', title: 'Undo' },
  { cmd: 'redo', label: '↷', title: 'Redo' },
  { separator: true },
  { cmd: 'removeFormat', label: 'Clear', title: 'Remove Formatting' },
]

function htmlToPlainText(html) {
  if (!html) return ''
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  return (tmp.textContent || tmp.innerText || '').trim()
}

export default function RichTextEditor({
  value,
  onChange,
  onTextChange,
  placeholder = 'Start typing your document content here…',
  label,
  className = '',
  minHeight = 260,
  required = false,
}) {
  const editorRef = useRef(null)
  const [mode, setMode] = useState('edit')
  const htmlValue = typeof value === 'string' ? value : value?.html || ''

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== htmlValue) {
      editorRef.current.innerHTML = htmlValue
    }
  }, [])

  const exec = (cmd, arg = null) => {
    document.execCommand(cmd, false, arg)
    emitChange()
    editorRef.current?.focus()
  }

  const emitChange = () => {
    if (!editorRef.current) return
    const html = editorRef.current.innerHTML
    const plain = htmlToPlainText(html)
    if (typeof onChange === 'function') onChange({ html, plain })
    if (typeof onTextChange === 'function') onTextChange(plain)
  }

  const isEmpty = !editorRef.current?.innerHTML || editorRef.current.innerHTML.replace(/<[^>]+>/g, '').trim() === ''

  return (
    <div className={className}>
      {label ? (
        <label className="block text-sm font-medium text-ink-secondary mb-2">
          {label} {required ? <span className="text-red-500">*</span> : null}
        </label>
      ) : null}

      <div className="flex items-center gap-1 mb-1 px-2 py-2 rounded-t-[18px] border border-border border-b-0 bg-surface-muted/60 flex-wrap">
        {TOOLBAR_BUTTONS.map((b, idx) => {
          if (b.separator) {
            return <span key={`sep-${idx}`} className="w-px h-6 bg-border mx-1" aria-hidden />
          }
          return (
            <button
              key={b.cmd}
              type="button"
              title={b.title}
              onClick={() => exec(b.cmd)}
              className={`min-w-[34px] h-8 px-2 rounded-lg text-sm text-ink-secondary hover:bg-surface hover:text-ink transition-colors ${b.style || ''}`}
            >
              {b.label}
            </button>
          )
        })}

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMode('edit')}
            className={`px-2 h-8 rounded-lg text-xs ${mode === 'edit' ? 'bg-brand/10 text-brand' : 'text-ink-muted hover:text-ink'}`}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => setMode('preview')}
            className={`px-2 h-8 rounded-lg text-xs ${mode === 'preview' ? 'bg-brand/10 text-brand' : 'text-ink-muted hover:text-ink'}`}
          >
            Preview
          </button>
        </div>
      </div>

      {mode === 'edit' ? (
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={emitChange}
          onBlur={emitChange}
          onKeyUp={emitChange}
          className="block w-full rounded-b-[18px] rounded-tr-[18px] bg-surface px-4 py-3 text-sm text-ink shadow-sm outline-none transition border border-border focus-visible:ring-2 focus-visible:ring-brand/30 prose max-w-none"
          style={{ minHeight }}
          data-empty={isEmpty}
        />
      ) : (
        <div
          className="block w-full rounded-b-[18px] rounded-tr-[18px] bg-surface-muted px-4 py-3 text-sm text-ink shadow-sm border border-border prose max-w-none"
          style={{ minHeight }}
        >
          {isEmpty ? (
            <div className="text-ink-soft italic">{placeholder}</div>
          ) : (
            <div dangerouslySetInnerHTML={{ __html: htmlValue }} />
          )}
        </div>
      )}

      <style>{`
        .prose ul { list-style: disc; padding-left: 1.5rem; margin: 0.5rem 0; }
        .prose ol { list-style: decimal; padding-left: 1.5rem; margin: 0.5rem 0; }
        .prose p { margin: 0.25rem 0; }
        .prose b, .prose strong { font-weight: 700; }
        .prose i, .prose em { font-style: italic; }
        .prose u { text-decoration: underline; }
        .prose s, .prose strike { text-decoration: line-through; }
        [contenteditable=true][data-empty=true]:empty:before {
          content: attr(placeholder);
          color: rgb(156 163 175);
          pointer-events: none;
        }
      `}</style>
    </div>
  )
}
