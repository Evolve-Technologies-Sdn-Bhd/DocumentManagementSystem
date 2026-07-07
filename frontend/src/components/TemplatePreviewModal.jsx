import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import mammoth from 'mammoth'
import useDocxFitToWidth from '../hooks/useDocxFitToWidth'

export default function TemplatePreviewModal({ template, onClose }) {
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState(null)
  const [docxBuffer, setDocxBuffer] = useState(null)
  const [contentType, setContentType] = useState(null)
  const [error, setError] = useState(null)
  const docxContainerRef = useRef(null)
  const docxViewportRef = useRef(null)
  const [docxZoomMode, setDocxZoomMode] = useState('fit')
  const { scale: docxScale, refresh: refreshDocxScale } = useDocxFitToWidth({
    enabled: contentType === 'docx' && !!docxBuffer,
    mode: docxZoomMode,
    viewportRef: docxViewportRef,
    containerRef: docxContainerRef
  })

  useEffect(() => {
    const loadPreview = async () => {
      try {
        setLoading(true)
        setError(null)
        setContent(null)
        setDocxBuffer(null)
        setContentType(null)
        setDocxZoomMode('fit')
        const token = localStorage.getItem('token')
        const baseURL = import.meta.env.VITE_API_URL || '/api'
        
        // Fetch the file
        const response = await fetch(`${baseURL}/templates/${template.id}/preview`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
        
        if (!response.ok) {
          throw new Error('Failed to load template')
        }

        const fileExtension = template.fileName.toLowerCase().split('.').pop()
        
        if (fileExtension === 'docx' || fileExtension === 'dotx') {
          const arrayBuffer = await response.arrayBuffer()
          setDocxBuffer(arrayBuffer)
          setContentType('docx')
        } else if (fileExtension === 'xlsx' || fileExtension === 'xls' || fileExtension === 'csv') {
          setContentType('other')
        } else {
          throw new Error('Unsupported file format for preview')
        }
      } catch (err) {
        console.error('Failed to load template preview:', err)
        setError(err.message || 'Failed to load template preview')
      } finally {
        setLoading(false)
      }
    }

    if (template) {
      loadPreview()
    }
  }, [template])

  useEffect(() => {
    if (contentType !== 'docx' || !docxBuffer || !docxContainerRef.current) return

    let cancelled = false
    ;(async () => {
      try {
        const mod = await import('docx-preview')
        if (cancelled) return
        const renderAsync = mod?.renderAsync
        if (typeof renderAsync !== 'function') {
          throw new Error('DOCX renderer not available')
        }

        docxContainerRef.current.innerHTML = ''
        await renderAsync(docxBuffer, docxContainerRef.current, undefined, {
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          useBase64URL: true
        })
        refreshDocxScale()
      } catch (e) {
        try {
          const result = await mammoth.convertToHtml(
            { arrayBuffer: docxBuffer },
            {
              convertImage: mammoth.images.inline(async (image) => ({
                src: `data:${image.contentType};base64,${await image.read('base64')}`
              }))
            }
          )
          if (cancelled) return
          setContent(result.value)
          setContentType('html')
        } catch (err) {
          if (cancelled) return
          setError(err?.message || e?.message || 'Failed to load template preview')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [contentType, docxBuffer, refreshDocxScale])

  const handleDownload = async () => {
    try {
      const token = localStorage.getItem('token')
      const baseURL = import.meta.env.VITE_API_URL || '/api'
      
      const response = await fetch(`${baseURL}/templates/${template.id}/download`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to download template')
      }
      
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = window.document.createElement('a')
      a.href = url
      a.download = template.fileName || template.templateName
      window.document.body.appendChild(a)
      a.click()
      window.document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to download template:', err)
      alert('Failed to download template')
    }
  }

  const modal = (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-semibold text-gray-900 truncate">
              Template Preview: {template.templateName}
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              {template.documentType} • Version {template.version} • {template.fileName}
            </p>
          </div>
          <div className="flex items-center gap-2 ml-4">
            {contentType === 'docx' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDocxZoomMode('fit')}
                  className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    docxZoomMode === 'fit'
                      ? 'text-blue-700 bg-blue-100'
                      : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
                  }`}
                  title="Fit to width"
                >
                  Fit
                </button>
                <button
                  onClick={() => setDocxZoomMode('actual')}
                  className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    docxZoomMode === 'actual'
                      ? 'text-blue-700 bg-blue-100'
                      : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
                  }`}
                  title="Actual size"
                >
                  Actual
                </button>
                {docxZoomMode === 'fit' && docxScale < 0.999 && (
                  <span className="text-xs text-gray-500 tabular-nums">
                    {Math.round(docxScale * 100)}%
                  </span>
                )}
              </div>
            )}
            <button
              onClick={handleDownload}
              className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
              title="Download template"
            >
              <svg className="w-5 h-5 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors p-2"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Preview Content */}
        <div className="flex-1 overflow-hidden bg-gray-100">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
              <p className="text-gray-600">Loading template preview...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full">
              <svg className="w-16 h-16 text-red-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-red-600 mb-4">{error}</p>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Close
              </button>
            </div>
          ) : contentType === 'docx' && docxBuffer ? (
            <div ref={docxViewportRef} className="h-full overflow-auto bg-gray-100">
              <div className="min-h-full py-6 px-4">
                <div className="w-fit mx-auto bg-white rounded-lg shadow-sm border border-gray-200">
                  <div ref={docxContainerRef} className="p-6" />
                </div>
              </div>
            </div>
          ) : content && contentType === 'html' ? (
            <div className="h-full overflow-auto p-6 bg-white">
              <div 
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: content }}
                style={{
                  fontFamily: 'Calibri, Arial, sans-serif',
                  fontSize: '12pt',
                  lineHeight: '1.6'
                }}
              />
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">
              This is a read-only preview. Download the file to edit.
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : modal
}
