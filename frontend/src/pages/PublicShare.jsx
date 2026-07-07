import React, { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import api from '../api/axios'
import AppSurface from '../components/ui/AppSurface'
import Button from '../components/ui/Button'
import InlineSpinner from '../components/ui/InlineSpinner'
import useDocxFitToWidth from '../hooks/useDocxFitToWidth'
import mammoth from 'mammoth'

export default function PublicShare() {
  const { token } = useParams()
  const [loading, setLoading] = useState(true)
  const [meta, setMeta] = useState(null)
  const [blobUrl, setBlobUrl] = useState(null)
  const [contentType, setContentType] = useState(null)
  const [htmlContent, setHtmlContent] = useState(null)
  const [docxBuffer, setDocxBuffer] = useState(null)
  const [error, setError] = useState('')
  const docxContainerRef = useRef(null)
  const docxViewportRef = useRef(null)
  const [docxZoomMode, setDocxZoomMode] = useState('fit')
  const { scale: docxScale, refresh: refreshDocxScale } = useDocxFitToWidth({
    enabled: contentType === 'docx' && !!docxBuffer,
    mode: docxZoomMode,
    viewportRef: docxViewportRef,
    containerRef: docxContainerRef
  })

  const clearBlobUrl = () => {
    if (blobUrl) {
      try {
        window.URL.revokeObjectURL(blobUrl)
      } catch {}
    }
  }

  useEffect(() => {
    return () => {
      clearBlobUrl()
    }
  }, [])

  const load = async () => {
    const t = String(token || '').trim()
    if (!t) {
      setError('Invalid share link.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    setMeta(null)
    setContentType(null)
    setHtmlContent(null)
    setDocxBuffer(null)
    clearBlobUrl()
    setBlobUrl(null)
    setDocxZoomMode('fit')

    try {
      const metaRes = await api.get(`/public/share/${encodeURIComponent(t)}/meta`, {
        headers: { 'Cache-Control': 'no-cache' }
      })
      const m = metaRes?.data?.data || null
      setMeta(m)

      const previewRes = await api.get(`/public/share/${encodeURIComponent(t)}/preview`, {
        responseType: 'blob',
        headers: { 'Cache-Control': 'no-cache' }
      })

      const mimeType = previewRes?.headers?.['content-type'] || m?.version?.mimeType || ''
      const fileName = m?.version?.fileName || ''
      const fileExtension = fileName.toLowerCase().split('.').pop()

      const isDocxLike =
        fileExtension === 'docx' ||
        fileExtension === 'dotx' ||
        mimeType.includes('officedocument.wordprocessingml')

      if (isDocxLike) {
        const arrayBuffer = await previewRes.data.arrayBuffer()
        setDocxBuffer(arrayBuffer)
        setContentType('docx')
        return
      }

      if (mimeType.includes('pdf') || fileExtension === 'pdf') {
        const url = window.URL.createObjectURL(new Blob([previewRes.data], { type: 'application/pdf' }))
        setBlobUrl(url)
        setContentType('pdf')
        return
      }

      if (mimeType.includes('image') || ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(fileExtension)) {
        const url = window.URL.createObjectURL(new Blob([previewRes.data], { type: mimeType }))
        setBlobUrl(url)
        setContentType('image')
        return
      }

      const url = window.URL.createObjectURL(new Blob([previewRes.data], { type: mimeType || undefined }))
      setBlobUrl(url)
      setContentType('other')
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || 'This share link is invalid or has expired.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [token])

  useEffect(() => {
    if (contentType !== 'docx' || !docxBuffer || !docxContainerRef.current) return

    let cancelled = false
    ;(async () => {
      try {
        const mod = await import('docx-preview')
        if (cancelled) return
        const renderAsync = mod?.renderAsync
        if (typeof renderAsync !== 'function') throw new Error('DOCX renderer not available')

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
          setError(err?.message || e?.message || 'Failed to load preview.')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [contentType, docxBuffer, refreshDocxScale])

  const title = meta?.document?.title || 'Shared document'
  const code = meta?.document?.fileCode || ''

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <AppSurface padding="none" className="overflow-hidden">
          <div className="border-b border-border bg-surface-muted px-6 py-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm text-ink-muted">Public share</div>
              <div className="mt-1 text-lg font-semibold text-ink truncate">{title}</div>
              {code ? <div className="mt-1 text-sm text-ink-muted truncate">{code}</div> : null}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
                Refresh
              </Button>
            </div>
          </div>

          <div className="p-4 md:p-6">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-muted">
                <InlineSpinner />
                <span>Loading preview…</span>
              </div>
            ) : error ? (
              <div className="rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm text-ink-secondary">
                {error}
              </div>
            ) : contentType === 'docx' ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    onClick={() => setDocxZoomMode('fit')}
                    size="sm"
                    variant={docxZoomMode === 'fit' ? 'primary' : 'secondary'}
                  >
                    Fit to width
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setDocxZoomMode('actual')}
                    size="sm"
                    variant={docxZoomMode === 'actual' ? 'primary' : 'secondary'}
                  >
                    Actual size
                  </Button>
                  {docxZoomMode === 'fit' && docxScale < 0.999 ? (
                    <span className="text-xs text-ink-muted tabular-nums">{Math.round(docxScale * 100)}%</span>
                  ) : null}
                </div>

                <div ref={docxViewportRef} className="rounded-dms-lg border border-border bg-surface overflow-auto">
                  <div
                    ref={docxContainerRef}
                    style={docxZoomMode === 'fit' ? { transform: `scale(${docxScale})`, transformOrigin: 'top left' } : undefined}
                    className="p-4"
                  />
                </div>
              </div>
            ) : contentType === 'html' ? (
              <div className="rounded-dms-lg border border-border bg-surface p-4">
                <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: htmlContent || '' }} />
              </div>
            ) : contentType === 'pdf' && blobUrl ? (
              <div className="rounded-dms-lg border border-border overflow-hidden bg-surface">
                <iframe title="PDF preview" src={blobUrl} className="h-[78vh] w-full" />
              </div>
            ) : contentType === 'image' && blobUrl ? (
              <div className="rounded-dms-lg border border-border bg-surface p-4 flex justify-center">
                <img src={blobUrl} alt={title} className="max-h-[78vh] max-w-full object-contain" />
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm text-ink-secondary">
                Preview is not available for this file type yet.
              </div>
            )}
          </div>
        </AppSurface>

        <div className="text-xs text-ink-muted">
          This is a view-only link. If the link expires or is revoked, the preview will no longer be accessible.
        </div>
      </div>
    </div>
  )
}

