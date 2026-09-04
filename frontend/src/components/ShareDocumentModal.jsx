import React, { useEffect, useMemo, useState } from 'react'
import * as ReactDOM from 'react-dom'
import api from '../api/axios'
import Button from './ui/Button'
import IconButton from './ui/IconButton'
import InlineSpinner from './ui/InlineSpinner'
import SectionHeader from './ui/SectionHeader'
import TextInput from './ui/TextInput'

const formatDateTimeLabel = (value) => {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return parsed.toLocaleString()
}

const buildEmailUrl = ({ subject, body }) => {
  const params = new URLSearchParams()
  if (subject) params.set('subject', subject)
  if (body) params.set('body', body)
  return `mailto:?${params.toString()}`
}

const buildWhatsappUrl = (text) => {
  return `https://wa.me/?text=${encodeURIComponent(text || '')}`
}

const buildTelegramUrl = ({ url, text }) => {
  const params = new URLSearchParams()
  if (url) params.set('url', url)
  if (text) params.set('text', text)
  return `https://t.me/share/url?${params.toString()}`
}

const getActiveLink = (links) => {
  const now = Date.now()
  return (Array.isArray(links) ? links : []).find((l) => {
    if (l?.revokedAt) return false
    const exp = l?.expiresAt ? new Date(l.expiresAt).getTime() : 0
    if (!exp) return false
    return exp > now
  })
}

export default function ShareDocumentModal({ open, document: selectedDocument, onClose }) {
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [revokingId, setRevokingId] = useState(null)
  const [links, setLinks] = useState([])
  const [expiryInput, setExpiryInput] = useState('')
  const [flash, setFlash] = useState(null)
  const [error, setError] = useState('')

  const docId = selectedDocument?.id
  const isConfidential = Boolean(selectedDocument?.isConfidential)
  const statusUpper = String(selectedDocument?.status || '').toUpperCase()
  const stageUpper = String(selectedDocument?.stage || '').toUpperCase()
  const canUsePublicShare = (statusUpper === 'PUBLISHED' || stageUpper === 'PUBLISHED') && !isConfidential

  const internalLink = useMemo(() => {
    if (!docId) return ''
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return origin ? `${origin}/documents/${docId}` : `/documents/${docId}`
  }, [docId])

  const docLabel = useMemo(() => {
    const code = String(selectedDocument?.fileCode || '').trim()
    const title = String(selectedDocument?.title || '').trim()
    return [code, title].filter(Boolean).join(' - ')
  }, [selectedDocument?.fileCode, selectedDocument?.title])

  const activePublicLink = useMemo(() => getActiveLink(links), [links])

  const publicPreviewUrl = useMemo(() => {
    if (!activePublicLink?.token) return activePublicLink?.publicPreviewUrl || ''
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return `${origin}/api/public/share/${encodeURIComponent(activePublicLink.token)}/preview`
  }, [activePublicLink?.publicPreviewUrl, activePublicLink?.token])

  const publicViewUrl = useMemo(() => {
    if (!activePublicLink?.token) return activePublicLink?.publicViewUrl || ''
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return `${origin}/share/${encodeURIComponent(activePublicLink.token)}`
  }, [activePublicLink?.publicViewUrl, activePublicLink?.token])

  const canRevealPublicUrl = Boolean(publicViewUrl)

  const shareText = useMemo(() => {
    return [docLabel, internalLink].filter(Boolean).join('\n')
  }, [docLabel, internalLink])

  const publicShareText = useMemo(() => {
    return [docLabel, publicViewUrl].filter(Boolean).join('\n')
  }, [docLabel, publicViewUrl])

  const loadLinks = async () => {
    if (!docId) return
    setError('')
    setLoading(true)
    try {
      const res = await api.get(`/documents/${docId}/share-links`)
      const data = res?.data?.data || res?.data || {}
      const nextLinks = Array.isArray(data?.links) ? data.links : []
      setLinks(nextLinks)
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to load share links')
      setLinks([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    if (!docId) return
    if (!canUsePublicShare) return
    loadLinks()
  }, [open, docId, canUsePublicShare])

  useEffect(() => {
    if (!open) {
      setFlash(null)
      setError('')
      setGenerating(false)
      setRevokingId(null)
      setExpiryInput('')
    }
  }, [open])

  const showFlash = (msg) => {
    setFlash(msg)
    setTimeout(() => setFlash(null), 1600)
  }

  const copyText = async (value) => {
    const text = String(value || '')
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      showFlash('Copied')
    } catch {
      showFlash('Failed to copy')
    }
  }

  const openUrl = (url) => {
    const safe = String(url || '').trim()
    if (!safe) return
    window.open(safe, '_blank', 'noopener,noreferrer')
  }

  const handleGenerate = async () => {
    if (!docId) return
    if (!canUsePublicShare) return
    setError('')
    setGenerating(true)
    try {
      if (activePublicLink?.id && !activePublicLink?.revokedAt) {
        try {
          await api.post(`/documents/${docId}/share-links/${activePublicLink.id}/revoke`)
        } catch {}
      }

      let payload = undefined
      const raw = String(expiryInput || '').trim()
      if (raw) {
        const parsed = new Date(raw)
        if (!Number.isNaN(parsed.getTime())) {
          payload = { expiresAt: parsed.toISOString() }
        }
      }
      const res = await api.post(`/documents/${docId}/share-links`, payload)
      const data = res?.data?.data || res?.data || {}
      const link = data?.link || null
      const token = data?.token || null
      const url = data?.publicPreviewUrl || null
      const viewUrl = data?.publicViewUrl || null

      if (link && token && url) {
        setLinks((prev) => [
          { ...link, token, publicPreviewUrl: url, publicViewUrl: viewUrl },
          ...(Array.isArray(prev) ? prev : [])
        ])
        showFlash('Public link created')
      } else {
        await loadLinks()
        showFlash('Public link created')
      }
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to create share link')
    } finally {
      setGenerating(false)
    }
  }

  const handleRevoke = async (linkId) => {
    if (!docId) return
    if (!canUsePublicShare) return
    if (!linkId) return
    setError('')
    setRevokingId(linkId)
    try {
      await api.post(`/documents/${docId}/share-links/${linkId}/revoke`)
      setLinks((prev) =>
        (Array.isArray(prev) ? prev : []).map((l) => (l?.id === linkId ? { ...l, revokedAt: new Date().toISOString() } : l))
      )
      showFlash('Public link revoked')
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to revoke share link')
    } finally {
      setRevokingId(null)
    }
  }

  if (!open) return null

  const modal = (
    <div className="fixed inset-0 bg-overlay flex items-center justify-center z-[90] p-4 modal-uniform">
      <div className="w-full max-w-2xl rounded-lg shadow-xl border border-gray-200 bg-white max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 sticky top-0 bg-white">
          <div className="min-w-0">
            <h3 className="text-xl font-bold text-gray-900">Share Document</h3>
            <div className="mt-2 truncate text-sm text-gray-600">{docLabel || 'Document'}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors" aria-label="Close">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-[85vh] overflow-y-auto px-6 py-4 space-y-6">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          ) : null}

          {flash ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800">
              {flash}
            </div>
          ) : null}

          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-semibold text-gray-900">Internal (Login Required)</h4>
              <p className="text-xs text-gray-500 mt-1">Recipients must sign in. Permissions and confidential access rules still apply.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex-1 min-w-0">
                <TextInput value={internalLink} readOnly />
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => copyText(internalLink)}>
                  Copy
                </Button>
                <Button variant="secondary" size="sm" onClick={() => openUrl(buildEmailUrl({ subject: docLabel, body: shareText }))}>
                  Email
                </Button>
                <Button variant="secondary" size="sm" onClick={() => openUrl(buildWhatsappUrl(shareText))}>
                  WhatsApp
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => openUrl(buildTelegramUrl({ url: internalLink, text: docLabel }))}
                >
                  Telegram
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-semibold text-gray-900">Public (Expiring)</h4>
              <p className="text-xs text-gray-500 mt-1">Preview only. Default expiry is 7 days. Document must be Published and non-confidential.</p>
            </div>

            {!canUsePublicShare ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                Public sharing is only available for Published documents that are not Confidential.
              </div>
            ) : null}

            {loading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <InlineSpinner />
                <span>Loading links…</span>
              </div>
            ) : null}

            {canUsePublicShare && activePublicLink ? (
              <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-gray-700">
                    <span className="font-medium text-gray-900">Expires:</span> {formatDateTimeLabel(activePublicLink.expiresAt)}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={handleGenerate} disabled={generating}>
                      {generating ? 'Generating…' : 'Generate New'}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleRevoke(activePublicLink.id)}
                      disabled={revokingId === activePublicLink.id}
                    >
                      {revokingId === activePublicLink.id ? 'Revoking…' : 'Revoke'}
                    </Button>
                  </div>
                </div>

                {canRevealPublicUrl ? (
                  <>
                    <div className="flex items-center justify-end">
                      <Button variant="secondary" size="sm" onClick={() => copyText(publicViewUrl)}>
                        Copy Link
                      </Button>
                    </div>
                    <TextInput value={publicViewUrl} readOnly />
                  </>
                ) : (
                  <div className="text-sm text-gray-500">
                    The public link is only shown at creation time. If you need it again, generate a new link.
                  </div>
                )}

                {canRevealPublicUrl ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => openUrl(buildEmailUrl({ subject: docLabel, body: publicShareText }))}>
                      Email
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => openUrl(buildWhatsappUrl(publicShareText))}>
                      WhatsApp
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => openUrl(buildTelegramUrl({ url: publicViewUrl, text: docLabel }))}
                    >
                      Telegram
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : canUsePublicShare ? (
              <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-4">
                <div className="text-sm text-gray-700">
                  No active public link yet.
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-gray-500">Custom expiry (optional)</div>
                    <TextInput
                      type="datetime-local"
                      value={expiryInput}
                      onChange={(e) => setExpiryInput(e.target.value)}
                    />
                  </div>
                  <Button onClick={handleGenerate} disabled={generating}>
                    {generating ? 'Generating…' : 'Generate Link'}
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-end">
              <Button variant="ghost" size="sm" onClick={loadLinks} disabled={!canUsePublicShare}>
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  if (typeof window === 'undefined' || !ReactDOM?.createPortal || !window.document?.body) return modal
  return ReactDOM.createPortal(modal, window.document.body)
}
