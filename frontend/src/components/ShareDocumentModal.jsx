import React, { useEffect, useMemo, useState } from 'react'
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

export default function ShareDocumentModal({ open, document, onClose }) {
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [revokingId, setRevokingId] = useState(null)
  const [links, setLinks] = useState([])
  const [expiryInput, setExpiryInput] = useState('')
  const [flash, setFlash] = useState(null)
  const [error, setError] = useState('')

  const docId = document?.id
  const isConfidential = Boolean(document?.isConfidential)
  const statusUpper = String(document?.status || '').toUpperCase()
  const stageUpper = String(document?.stage || '').toUpperCase()
  const canUsePublicShare = (statusUpper === 'PUBLISHED' || stageUpper === 'PUBLISHED') && !isConfidential

  const internalLink = useMemo(() => {
    if (!docId) return ''
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return origin ? `${origin}/documents/${docId}` : `/documents/${docId}`
  }, [docId])

  const docLabel = useMemo(() => {
    const code = String(document?.fileCode || '').trim()
    const title = String(document?.title || '').trim()
    return [code, title].filter(Boolean).join(' - ')
  }, [document?.fileCode, document?.title])

  const activePublicLink = useMemo(() => getActiveLink(links), [links])

  const publicPreviewUrl = useMemo(() => {
    if (!activePublicLink?.token) return activePublicLink?.publicPreviewUrl || ''
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return `${origin}/api/public/share/${encodeURIComponent(activePublicLink.token)}/preview`
  }, [activePublicLink?.publicPreviewUrl, activePublicLink?.token])

  const canRevealPublicUrl = Boolean(publicPreviewUrl)

  const shareText = useMemo(() => {
    return [docLabel, internalLink].filter(Boolean).join('\n')
  }, [docLabel, internalLink])

  const publicShareText = useMemo(() => {
    return [docLabel, publicPreviewUrl].filter(Boolean).join('\n')
  }, [docLabel, publicPreviewUrl])

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
      showFlash('Copy failed')
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

      if (link && token && url) {
        setLinks((prev) => [
          { ...link, token, publicPreviewUrl: url },
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

  return (
    <div className="fixed inset-0 bg-overlay flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-2xl rounded-dms-lg border border-border bg-surface shadow-dms-lg">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-ink">Share Document</h3>
            <div className="mt-1 truncate text-sm text-ink-muted">{docLabel || 'Document'}</div>
          </div>
          <IconButton size="sm" onClick={onClose} aria-label="Close">
            <span className="text-lg leading-none">×</span>
          </IconButton>
        </div>

        <div className="max-h-[85vh] overflow-y-auto p-6 space-y-6">
          {error ? (
            <div className="rounded-2xl border border-[var(--dms-color-danger-soft)] bg-[var(--dms-color-danger-soft)]/40 px-4 py-3 text-sm text-[var(--dms-color-danger-ink)]">
              {error}
            </div>
          ) : null}

          {flash ? (
            <div className="rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm text-ink-secondary">
              {flash}
            </div>
          ) : null}

          <div className="space-y-3">
            <SectionHeader title="Internal (Login Required)" subtitle="Penerima perlu login. Permission & confidential rules masih terpakai." />
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
            <SectionHeader title="Public (Expiring)" subtitle="Preview sahaja. Default expiry 7 hari. Dokumen mesti Published dan bukan Confidential." />

            {!canUsePublicShare ? (
              <div className="rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm text-ink-muted">
                Public share hanya tersedia untuk dokumen Published yang bukan Confidential.
              </div>
            ) : null}

            {loading ? (
              <div className="flex items-center gap-2 text-sm text-ink-muted">
                <InlineSpinner />
                <span>Loading links…</span>
              </div>
            ) : null}

            {canUsePublicShare && activePublicLink ? (
              <div className="space-y-3 rounded-dms-lg border border-border bg-surface-muted px-4 py-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-ink-secondary">
                    <span className="font-medium text-ink">Expires:</span> {formatDateTimeLabel(activePublicLink.expiresAt)}
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
                      <Button variant="secondary" size="sm" onClick={() => copyText(publicPreviewUrl)}>
                        Copy Link
                      </Button>
                    </div>
                    <TextInput value={publicPreviewUrl} readOnly />
                  </>
                ) : (
                  <div className="text-sm text-ink-muted">
                    Link value hanya dipaparkan semasa create. Jika anda perlukan semula, generate link baru.
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
                      onClick={() => openUrl(buildTelegramUrl({ url: publicPreviewUrl, text: docLabel }))}
                    >
                      Telegram
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : canUsePublicShare ? (
              <div className="space-y-3 rounded-dms-lg border border-border bg-surface-muted px-4 py-4">
                <div className="text-sm text-ink-secondary">
                  No active public link yet.
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-ink-muted">Custom expiry (optional)</div>
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
}
