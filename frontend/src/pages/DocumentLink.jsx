import React, { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../api/axios'

export default function DocumentLink() {
  const navigate = useNavigate()
  const { id } = useParams()

  useEffect(() => {
    const raw = parseInt(id, 10)
    const isValidId = Number.isFinite(raw) && String(raw) === String(id)
    const docId = isValidId ? raw : null

    if (docId === null) {
      navigate('/dashboard', { replace: true })
      return
    }

    const token = localStorage.getItem('token')
    if (!token) {
      try {
        localStorage.setItem('postLoginRedirect', `/documents/${docId}`)
      } catch {}
      navigate('/login', { replace: true })
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const res = await api.get(`/documents/${docId}`)
        if (cancelled) return

        const doc =
          res.data?.data?.document ||
          res.data?.document ||
          res.data?.data ||
          res.data

        const stage = String(doc?.stage || '').toUpperCase()

        if (stage === 'DRAFT') {
          const params = new URLSearchParams({ docId: String(docId) })
          navigate(`/documents/drafts?${params.toString()}`, { replace: true })
          return
        }

        if (stage === 'PUBLISHED') {
          const params = new URLSearchParams({ docId: String(docId) })
          const folderId = Number(doc?.folderId)
          if (Number.isFinite(folderId) && folderId > 0) {
            params.set('folderId', String(folderId))
          }
          navigate(`/documents/published?${params.toString()}`, { replace: true })
          return
        }

        const params = new URLSearchParams({ docId: String(docId) })
        navigate(`/documents/review-approval?${params.toString()}`, { replace: true })
      } catch {
        if (cancelled) return
        const params = new URLSearchParams({ docId: String(docId) })
        navigate(`/documents/review-approval?${params.toString()}`, { replace: true })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [id, navigate])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-sm text-gray-600">Redirecting…</div>
    </div>
  )
}
