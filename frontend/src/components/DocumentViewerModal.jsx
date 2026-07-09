import React, { useState, useEffect, useRef } from 'react'
import * as ReactDOM from 'react-dom'
import api from '../api/axios'
import mammoth from 'mammoth'
import { usePreferences } from '../contexts/PreferencesContext'
import useDocxFitToWidth from '../hooks/useDocxFitToWidth'
import AppSurface from './ui/AppSurface'
import Button from './ui/Button'
import IconButton from './ui/IconButton'
import InlineSpinner from './ui/InlineSpinner'

export default function DocumentViewerModal({ document, onClose }) {
  const { t } = usePreferences()
  const [loading, setLoading] = useState(true)
  const [fileUrl, setFileUrl] = useState(null)
  const [htmlContent, setHtmlContent] = useState(null)
  const [docxBuffer, setDocxBuffer] = useState(null)
  const [contentType, setContentType] = useState(null)
  const [error, setError] = useState(null)
  const docxContainerRef = useRef(null)
  const docxViewportRef = useRef(null)
  const [docxZoomMode, setDocxZoomMode] = useState('fit')
  const effectiveDocumentId = document?.documentId ?? document?.id
  const effectiveVersionId = document?.versionId ?? null
  const { scale: docxScale, refresh: refreshDocxScale } = useDocxFitToWidth({
    enabled: contentType === 'docx' && !!docxBuffer,
    mode: docxZoomMode,
    viewportRef: docxViewportRef,
    containerRef: docxContainerRef
  })

  useEffect(() => {
    const loadDocument = async () => {
      try {
        if (!effectiveDocumentId) {
          setError('Missing document id')
          setLoading(false)
          return
        }

        setLoading(true)
        setError(null)
        setFileUrl(null)
        setHtmlContent(null)
        setDocxBuffer(null)
        setContentType(null)
        setDocxZoomMode('fit')
        
        const res = await api.get(`/documents/${effectiveDocumentId}/preview`, {
          params: effectiveVersionId ? { versionId: effectiveVersionId } : undefined,
          responseType: 'blob'
        })
        
        // Get file extension from response headers or document title
        const mimeType = res.headers['content-type'] || ''
        const fileName = document.fileName || document.title || ''
        const fileExtension = fileName.toLowerCase().split('.').pop()
        
        const isDocxLike =
          fileExtension === 'docx' ||
          fileExtension === 'dotx' ||
          mimeType.includes('officedocument.wordprocessingml')
        const isLegacyDoc = fileExtension === 'doc' || mimeType.includes('msword')

        if (isDocxLike) {
          const arrayBuffer = await res.data.arrayBuffer()
          setDocxBuffer(arrayBuffer)
          setContentType('docx')
        } else if (isLegacyDoc) {
          const url = window.URL.createObjectURL(new Blob([res.data], { type: mimeType }))
          setFileUrl(url)
          setContentType('other')
        }
        // No preview for Excel/CSV
        else if (mimeType.includes('spreadsheet') || fileExtension === 'xlsx' || fileExtension === 'xls' || fileExtension === 'csv') {
          const url = window.URL.createObjectURL(new Blob([res.data], { type: mimeType }))
          setFileUrl(url)
          setContentType('other')
        }
        // Handle PDF and other files
        else if (mimeType.includes('pdf') || fileExtension === 'pdf') {
          const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
          setFileUrl(url)
          setContentType('pdf')
        }
        // Handle images
        else if (mimeType.includes('image') || ['jpg', 'jpeg', 'png', 'gif', 'bmp'].includes(fileExtension)) {
          const url = window.URL.createObjectURL(new Blob([res.data], { type: mimeType }))
          setFileUrl(url)
          setContentType('image')
        }
        // Fallback for other file types
        else {
          const url = window.URL.createObjectURL(new Blob([res.data], { type: mimeType }))
          setFileUrl(url)
          setContentType('other')
        }
      } catch (err) {
        console.error('Failed to load document:', err)
        setError(err.response?.data?.message || err.message || 'Failed to load document')
      } finally {
        setLoading(false)
      }
    }

    if (document) {
      loadDocument()
    }

    // Cleanup
    return () => {
      if (fileUrl) {
        window.URL.revokeObjectURL(fileUrl)
      }
    }
  }, [document])

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
          setHtmlContent(result.value)
          setContentType('html')
        } catch (err) {
          if (cancelled) return
          setError(err?.message || e?.message || 'Failed to load document')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [contentType, docxBuffer, refreshDocxScale])

  const handleDownload = async () => {
    if (!effectiveDocumentId) {
      alert('Failed to download document')
      return
    }

    try {
      const res = await api.get(`/documents/${effectiveDocumentId}/download`, {
        params: effectiveVersionId ? { versionId: effectiveVersionId } : undefined,
        responseType: 'blob'
      })

      const contentDisposition = res.headers?.['content-disposition'] || ''
      const contentTypeHeader = res.headers?.['content-type'] || ''
      const getFileNameFromContentDisposition = (value) => {
        const v = String(value || '')
        const mStar = v.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)
        if (mStar && mStar[1]) {
          try {
            return decodeURIComponent(mStar[1].trim().replace(/^"|"$/g, ''))
          } catch {
            return mStar[1].trim().replace(/^"|"$/g, '')
          }
        }
        const m = v.match(/filename\s*=\s*("?)([^";]+)\1/i)
        if (m && m[2]) return m[2].trim()
        return null
      }

      const fallbackName = document.fileName || document.title || `document-${effectiveDocumentId}`
      const downloadName = getFileNameFromContentDisposition(contentDisposition) || fallbackName
      const url = window.URL.createObjectURL(new Blob([res.data], { type: contentTypeHeader || undefined }))
      const link = window.document.createElement('a')
      link.href = url
      link.setAttribute('download', downloadName)
      window.document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to download document:', err)
      alert('Failed to download document')
    }
  }

  const modal = (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <AppSurface padding="none" className="w-[95vw] max-w-[1400px] h-[95vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-muted">
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-semibold text-ink truncate">
              {t('document_preview')}
            </h3>
            <p className="text-sm text-ink-muted mt-1">
              {document.fileCode} • {document.title} • {t('version')} {document.version}
            </p>
          </div>
          <div className="flex items-center gap-2 ml-4">
            {contentType === 'docx' && (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  onClick={() => setDocxZoomMode('fit')}
                  size="sm"
                  variant={docxZoomMode === 'fit' ? 'primary' : 'secondary'}
                  title={t('fit_to_width')}
                >
                  {t('fit_to_width')}
                </Button>
                <Button
                  type="button"
                  onClick={() => setDocxZoomMode('actual')}
                  size="sm"
                  variant={docxZoomMode === 'actual' ? 'primary' : 'secondary'}
                  title={t('actual_size')}
                >
                  {t('actual_size')}
                </Button>
                {docxZoomMode === 'fit' && docxScale < 0.999 && (
                  <span className="text-xs text-ink-muted tabular-nums">
                    {Math.round(docxScale * 100)}%
                  </span>
                )}
              </div>
            )}
            {document.canDownload !== false && (
              <Button
                type="button"
                onClick={handleDownload}
                variant="secondary"
                size="sm"
                className="border-brand text-brand hover:text-brand-hover"
                title={t('download')}
              >
                <svg className="w-5 h-5 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {t('download')}
              </Button>
            )}
            <IconButton onClick={onClose} aria-label={t('close')}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </IconButton>
          </div>
        </div>

        {/* Document Viewer Content */}
        <div className="flex-1 overflow-hidden bg-surface-muted">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full">
              <InlineSpinner className="h-10 w-10 border-2 mb-4" />
              <p className="text-ink-muted">{t('loading_document')}</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full">
              <svg className="w-16 h-16 text-red-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-red-600 mb-4">{error === 'Failed to load document' ? t('failed_load_doc') : error}</p>
              {document.canDownload !== false && (
                <Button onClick={handleDownload} className="mb-2">
                  {t('download')}
                </Button>
              )}
              <Button variant="secondary" onClick={onClose}>
                {t('close')}
              </Button>
            </div>
          ) : contentType === 'docx' && docxBuffer ? (
            <div ref={docxViewportRef} className="h-full overflow-auto bg-surface-muted">
              <div className="min-h-full py-8 px-4">
                <div className="w-fit mx-auto bg-surface rounded-2xl shadow-dms-soft border border-border">
                  <div ref={docxContainerRef} className="p-6" />
                </div>
              </div>
            </div>
          ) : contentType === 'html' && htmlContent ? (
            <div className="h-full overflow-auto p-8 bg-surface">
              <div 
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: htmlContent }}
                style={{
                  fontFamily: 'Calibri, Arial, sans-serif',
                  fontSize: '11pt',
                  lineHeight: '1.6'
                }}
              />
            </div>
          ) : contentType === 'pdf' && fileUrl ? (
            <iframe
              src={fileUrl}
              className="w-full h-full border-0"
              title="Document Preview"
            />
          ) : contentType === 'image' && fileUrl ? (
            <div className="h-full overflow-auto p-8 bg-surface-muted flex items-center justify-center">
              <img src={fileUrl} alt="Document" className="max-w-full max-h-full object-contain" />
            </div>
          ) : fileUrl ? (
            <div className="flex flex-col items-center justify-center h-full">
              <svg className="w-16 h-16 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-ink-muted mb-4">{t('preview_not_available')}</p>
              {document.canDownload !== false && (
                <Button onClick={handleDownload}>
                  {t('download_to_view')}
                </Button>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-surface">
          <div className="flex justify-between items-center">
            <p className="text-sm text-ink-muted">
              {t('readonly_preview_notice')}
            </p>
            <Button variant="secondary" onClick={onClose}>
              {t('close')}
            </Button>
          </div>
        </div>
      </AppSurface>
    </div>
  )

  if (typeof document === 'undefined' || !ReactDOM?.createPortal || !document.body) return modal
  return ReactDOM.createPortal(modal, document.body)
}
