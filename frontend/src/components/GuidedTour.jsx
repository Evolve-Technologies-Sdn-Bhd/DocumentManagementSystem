import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { usePreferences } from '../contexts/PreferencesContext'
import { hasAnyPermission, hasPermission } from '../utils/permissions'

const TOUR_TARGET_TIMEOUT_MS = 8000

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

function getTargetRect(targetId) {
  const targets = Array.isArray(targetId) ? targetId : [targetId]

  for (const id of targets) {
    if (!id) continue
    const el = document.querySelector(`[data-tour-id="${id}"]`)
    if (!el) continue
    const rect = el.getBoundingClientRect()
    return { el, rect }
  }

  return null
}

function computeTooltipPosition(rect, placement, size) {
  const padding = 12
  const w = size?.width || 360
  const h = size?.height || 180
  const vw = window.innerWidth
  const vh = window.innerHeight

  if (!rect) {
    return { left: clamp((vw - w) / 2, padding, vw - w - padding), top: clamp((vh - h) / 2, padding, vh - h - padding) }
  }

  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2

  let left = cx - w / 2
  let top = 0

  if (placement === 'top') top = rect.top - h - 12
  else if (placement === 'left') { left = rect.left - w - 12; top = cy - h / 2 }
  else if (placement === 'right') { left = rect.right + 12; top = cy - h / 2 }
  else top = rect.bottom + 12

  return {
    left: clamp(left, padding, vw - w - padding),
    top: clamp(top, padding, vh - h - padding)
  }
}

function getScrollParent(el) {
  let p = el?.parentElement || null
  while (p) {
    const style = window.getComputedStyle(p)
    const oy = style.overflowY
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 1) return p
    p = p.parentElement
  }
  return null
}

function isElementFullyVisibleInParent(el, parent, margin = 8) {
  if (!el || !parent) return false
  const r = el.getBoundingClientRect()
  const pr = parent.getBoundingClientRect()
  return r.top >= pr.top + margin && r.bottom <= pr.bottom - margin
}

function canAccessStep(step) {
  if (!step?.access) return true
  const { module, action = 'view', requireAny = false, enabled = true } = step.access
  if (!enabled) return false

  const modules = Array.isArray(module) ? module : [module]
  if (!modules[0]) return true

  return requireAny
    ? modules.some((item) => hasAnyPermission(item))
    : modules.some((item) => hasPermission(item, action))
}

function isRfidRegistryEnabled() {
  try {
    const savedSettings = localStorage.getItem('dms_document_settings')
    if (!savedSettings) return false
    const parsed = JSON.parse(savedSettings)
    return Boolean(parsed?.rfidEpcRegistryEnabled)
  } catch {
    return false
  }
}

export default function GuidedTour({ open, tourId, onClose }) {
  const { t } = usePreferences()
  const navigate = useNavigate()
  const location = useLocation()
  const [stepIndex, setStepIndex] = useState(0)
  const [targetRect, setTargetRect] = useState(null)
  const [tooltipSize, setTooltipSize] = useState({ width: 360, height: 180 })
  const rafRef = useRef(null)
  const timeoutRef = useRef(null)
  const tooltipRef = useRef(null)
  const clickedStepRef = useRef(-1)

  const steps = useMemo(() => {
    const rfidEnabled = isRfidRegistryEnabled()

    if (tourId === 'admin') {
      return [
        { route: '/config', target: 'nav-config', titleKey: 'tour_admin_1_title', bodyKey: 'tour_admin_1_body', placement: 'right', access: { module: ['configuration.users', 'configuration.roles', 'configuration.templates', 'configuration.templateRequests', 'configuration.documentTypes', 'configuration.masterData', 'configuration.settings', 'configuration.backup', 'configuration.cleanup', 'configuration.auditSettings'], requireAny: true } },
        { route: '/config', target: 'config-tab-general', titleKey: 'tour_admin_2_title', bodyKey: 'tour_admin_2_body', placement: 'bottom', click: true, access: { module: ['configuration.users', 'configuration.roles', 'configuration.templates', 'configuration.templateRequests', 'configuration.documentTypes', 'configuration.masterData', 'configuration.settings', 'configuration.backup', 'configuration.cleanup', 'configuration.auditSettings'], requireAny: true } },
        { route: '/config', target: 'gss-tabbar', titleKey: 'tour_admin_3_title', bodyKey: 'tour_admin_3_body', placement: 'bottom', access: { module: ['configuration.users', 'configuration.roles', 'configuration.templates', 'configuration.templateRequests', 'configuration.documentTypes', 'configuration.masterData', 'configuration.settings', 'configuration.backup', 'configuration.cleanup', 'configuration.auditSettings'], requireAny: true } },
        { route: '/config', target: 'config-tab-masterdata', titleKey: 'tour_admin_4_title', bodyKey: 'tour_admin_4_body', placement: 'bottom', click: true, access: { module: ['configuration.users', 'configuration.roles', 'configuration.templates', 'configuration.templateRequests', 'configuration.documentTypes', 'configuration.masterData', 'configuration.settings', 'configuration.backup', 'configuration.cleanup', 'configuration.auditSettings'], requireAny: true } },
        { route: '/config', target: 'mdm-tabbar', titleKey: 'tour_admin_5_title', bodyKey: 'tour_admin_5_body', placement: 'bottom', access: { module: ['configuration.users', 'configuration.roles', 'configuration.templates', 'configuration.templateRequests', 'configuration.documentTypes', 'configuration.masterData', 'configuration.settings', 'configuration.backup', 'configuration.cleanup', 'configuration.auditSettings'], requireAny: true } },
        { route: '/config', target: 'config-tab-roles', titleKey: 'tour_admin_6_title', bodyKey: 'tour_admin_6_body', placement: 'bottom', click: true, access: { module: ['configuration.users', 'configuration.roles', 'configuration.templates', 'configuration.templateRequests', 'configuration.documentTypes', 'configuration.masterData', 'configuration.settings', 'configuration.backup', 'configuration.cleanup', 'configuration.auditSettings'], requireAny: true } },
        { route: '/config', target: 'rp-tabbar', titleKey: 'tour_admin_7_title', bodyKey: 'tour_admin_7_body', placement: 'bottom', access: { module: ['configuration.users', 'configuration.roles', 'configuration.templates', 'configuration.templateRequests', 'configuration.documentTypes', 'configuration.masterData', 'configuration.settings', 'configuration.backup', 'configuration.cleanup', 'configuration.auditSettings'], requireAny: true } },
        { route: '/config', target: 'config-tab-template', titleKey: 'tour_admin_8_title', bodyKey: 'tour_admin_8_body', placement: 'bottom', click: true, access: { module: ['configuration.users', 'configuration.roles', 'configuration.templates', 'configuration.templateRequests', 'configuration.documentTypes', 'configuration.masterData', 'configuration.settings', 'configuration.backup', 'configuration.cleanup', 'configuration.auditSettings'], requireAny: true } },
        { route: '/config', target: 'tmpl-btn-add-template', titleKey: 'tour_admin_9_title', bodyKey: 'tour_admin_9_body', placement: 'left', access: { module: ['configuration.users', 'configuration.roles', 'configuration.templates', 'configuration.templateRequests', 'configuration.documentTypes', 'configuration.masterData', 'configuration.settings', 'configuration.backup', 'configuration.cleanup', 'configuration.auditSettings'], requireAny: true } },
        { route: '/published', target: 'nav-published', titleKey: 'tour_admin_10_title', bodyKey: 'tour_admin_10_body', placement: 'right', access: { module: 'documents.published', requireAny: true } },
        { route: '/published', target: 'pub-actions-card', titleKey: 'tour_admin_11_title', bodyKey: 'tour_admin_11_body', placement: 'bottom', access: { module: 'documents.published', requireAny: true } },
        { route: '/dashboard', target: 'nav-dashboard', titleKey: 'tour_admin_12_title', bodyKey: 'tour_admin_12_body', placement: 'right', access: { module: 'dashboard' } },
        { route: '/dashboard', target: 'dashboard-metrics', titleKey: 'tour_admin_13_title', bodyKey: 'tour_admin_13_body', placement: 'bottom', access: { module: 'dashboard' } },
        { route: '/new-document-request', target: 'nav-new-document-request', titleKey: 'tour_admin_14_title', bodyKey: 'tour_admin_14_body', placement: 'right', access: { module: 'newDocumentRequest' } },
        { route: '/new-document-request', target: 'ndr-form-card', titleKey: 'tour_admin_15_title', bodyKey: 'tour_admin_15_body', placement: 'bottom', access: { module: 'newDocumentRequest' } },
        { route: '/new-document-request', target: 'ndr-request-list-card', titleKey: 'tour_admin_16_title', bodyKey: 'tour_admin_16_body', placement: 'bottom', access: { module: 'newDocumentRequest' } },
        { route: '/new-document-request', target: 'ndr-btn-download-template', titleKey: 'tour_admin_17_title', bodyKey: 'tour_admin_17_body', placement: 'bottom', access: { module: 'newDocumentRequest' } },
        { route: '/project-tracking', target: 'nav-project-tracking', titleKey: 'tour_admin_18_title', bodyKey: 'tour_admin_18_body', placement: 'right', access: { module: 'projectTracking' } },
        { route: '/project-tracking', target: ['pt-tabbar', 'pt-shell-card', 'pt-page'], titleKey: 'tour_admin_19_title', bodyKey: 'tour_admin_19_body', placement: 'bottom', access: { module: 'projectTracking' } },
        { route: '/expiry-tracking', target: 'nav-expiry-tracking', titleKey: 'tour_admin_20_title', bodyKey: 'tour_admin_20_body', placement: 'right', access: { module: 'expiryTracking' } },
        { route: '/expiry-tracking', target: 'expiry-filters-card', titleKey: 'tour_admin_21_title', bodyKey: 'tour_admin_21_body', placement: 'bottom', access: { module: 'expiryTracking' } },
        { route: '/rfid-epc-registry', target: 'nav-rfid-epc-registry', titleKey: 'tour_admin_22_title', bodyKey: 'tour_admin_22_body', placement: 'right', access: { module: 'documents.rfidRegistry', enabled: rfidEnabled } },
        { route: '/rfid-epc-registry', target: 'epc-table-card', titleKey: 'tour_admin_23_title', bodyKey: 'tour_admin_23_body', placement: 'bottom', access: { module: 'documents.rfidRegistry', enabled: rfidEnabled } },
        { route: '/drafts', target: 'nav-drafts', titleKey: 'tour_admin_24_title', bodyKey: 'tour_admin_24_body', placement: 'right', access: { module: 'documents.draft', requireAny: true } },
        { route: '/drafts', target: 'drafts-btn-new-draft', titleKey: 'tour_admin_25_title', bodyKey: 'tour_admin_25_body', placement: 'left', click: true, access: { module: 'documents.draft', requireAny: true } },
        { route: '/drafts', target: 'new-draft-upload', titleKey: 'tour_admin_26_title', bodyKey: 'tour_admin_26_body', placement: 'bottom', access: { module: 'documents.draft', requireAny: true } },
        { route: '/drafts', target: 'new-draft-assign-reviewer', titleKey: 'tour_admin_27_title', bodyKey: 'tour_admin_27_body', placement: 'bottom', access: { module: 'documents.draft', requireAny: true } },
        { route: '/drafts', target: 'new-draft-submit-review', titleKey: 'tour_admin_28_title', bodyKey: 'tour_admin_28_body', placement: 'top', access: { module: 'documents.draft', requireAny: true } },
        { route: '/review-approval', target: 'nav-review-approval', titleKey: 'tour_admin_29_title', bodyKey: 'tour_admin_29_body', placement: 'right', access: { module: 'documents.review', requireAny: true } },
        { route: '/review-approval', target: 'ra-list-card', titleKey: 'tour_admin_30_title', bodyKey: 'tour_admin_30_body', placement: 'bottom', access: { module: 'documents.review', requireAny: true } },
        { route: '/published', target: 'pub-docs-table', titleKey: 'tour_admin_31_title', bodyKey: 'tour_admin_31_body', placement: 'bottom', access: { module: 'documents.published', requireAny: true } },
        { route: '/archived', target: 'nav-archived', titleKey: 'tour_admin_32_title', bodyKey: 'tour_admin_32_body', placement: 'right', access: { module: 'documents.superseded', requireAny: true } },
        { route: '/archived', target: 'so-btn-request', titleKey: 'tour_admin_33_title', bodyKey: 'tour_admin_33_body', placement: 'left', access: { module: 'documents.superseded', requireAny: true } },
        { route: '/logs', target: 'nav-logs', titleKey: 'tour_admin_34_title', bodyKey: 'tour_admin_34_body', placement: 'right', access: { module: 'logsReport.activityLogs', requireAny: true } },
        { route: '/logs', target: 'logs-tabbar', titleKey: 'tour_admin_35_title', bodyKey: 'tour_admin_35_body', placement: 'bottom', access: { module: 'logsReport.activityLogs', requireAny: true } },
        { route: '/logs', target: 'logs-export-activity', titleKey: 'tour_admin_36_title', bodyKey: 'tour_admin_36_body', placement: 'left', access: { module: 'logsReport.activityLogs', requireAny: true } },
        { route: '/master-record', target: 'nav-master-record', titleKey: 'tour_admin_37_title', bodyKey: 'tour_admin_37_body', placement: 'right', access: { module: 'masterRecord' } },
        { route: '/master-record', target: 'mr-tabbar', titleKey: 'tour_admin_38_title', bodyKey: 'tour_admin_38_body', placement: 'bottom', access: { module: 'masterRecord' } }
      ].filter(canAccessStep)
    }

    return [
      { route: '/profile', target: 'nav-profile', titleKey: 'tour_user_1_title', bodyKey: 'tour_user_1_body', placement: 'right', access: { module: 'profileSettings' } },
      { route: '/profile', target: 'profile-tabbar', titleKey: 'tour_user_2_title', bodyKey: 'tour_user_2_body', placement: 'bottom', access: { module: 'profileSettings' } },
      { route: '/dashboard', target: 'nav-dashboard', titleKey: 'tour_user_3_title', bodyKey: 'tour_user_3_body', placement: 'right', access: { module: 'dashboard' } },
      { route: '/dashboard', target: 'dashboard-metrics', titleKey: 'tour_user_4_title', bodyKey: 'tour_user_4_body', placement: 'bottom', access: { module: 'dashboard' } },
      { route: '/new-document-request', target: 'nav-new-document-request', titleKey: 'tour_user_5_title', bodyKey: 'tour_user_5_body', placement: 'right', access: { module: 'newDocumentRequest' } },
      { route: '/new-document-request', target: 'ndr-form-card', titleKey: 'tour_user_6_title', bodyKey: 'tour_user_6_body', placement: 'bottom', access: { module: 'newDocumentRequest' } },
      { route: '/new-document-request', target: 'ndr-request-list-card', titleKey: 'tour_user_7_title', bodyKey: 'tour_user_7_body', placement: 'bottom', access: { module: 'newDocumentRequest' } },
      { route: '/new-document-request', target: 'ndr-btn-download-template', titleKey: 'tour_user_8_title', bodyKey: 'tour_user_8_body', placement: 'bottom', access: { module: 'newDocumentRequest' } },
      { route: '/my-documents', target: 'nav-my-documents', titleKey: 'tour_user_9_title', bodyKey: 'tour_user_9_body', placement: 'right', access: { module: 'myDocumentsStatus' } },
      { route: '/my-documents', target: 'my-docs-list-card', titleKey: 'tour_user_10_title', bodyKey: 'tour_user_10_body', placement: 'bottom', access: { module: 'myDocumentsStatus' } },
      { route: '/project-tracking', target: 'nav-project-tracking', titleKey: 'tour_user_11_title', bodyKey: 'tour_user_11_body', placement: 'right', access: { module: 'projectTracking' } },
      { route: '/project-tracking', target: ['pt-tabbar', 'pt-shell-card', 'pt-page'], titleKey: 'tour_user_12_title', bodyKey: 'tour_user_12_body', placement: 'bottom', access: { module: 'projectTracking' } },
      { route: '/expiry-tracking', target: 'nav-expiry-tracking', titleKey: 'tour_user_13_title', bodyKey: 'tour_user_13_body', placement: 'right', access: { module: 'expiryTracking' } },
      { route: '/expiry-tracking', target: 'expiry-filters-card', titleKey: 'tour_user_14_title', bodyKey: 'tour_user_14_body', placement: 'bottom', access: { module: 'expiryTracking' } },
      { route: '/rfid-epc-registry', target: 'nav-rfid-epc-registry', titleKey: 'tour_user_15_title', bodyKey: 'tour_user_15_body', placement: 'right', access: { module: 'documents.rfidRegistry', enabled: rfidEnabled } },
      { route: '/rfid-epc-registry', target: 'epc-table-card', titleKey: 'tour_user_16_title', bodyKey: 'tour_user_16_body', placement: 'bottom', access: { module: 'documents.rfidRegistry', enabled: rfidEnabled } },
      { route: '/drafts', target: 'nav-drafts', titleKey: 'tour_user_17_title', bodyKey: 'tour_user_17_body', placement: 'right', access: { module: 'documents.draft', requireAny: true } },
      { route: '/drafts', target: 'drafts-btn-new-draft', titleKey: 'tour_user_18_title', bodyKey: 'tour_user_18_body', placement: 'left', click: true, access: { module: 'documents.draft', requireAny: true } },
      { route: '/drafts', target: 'new-draft-upload', titleKey: 'tour_user_19_title', bodyKey: 'tour_user_19_body', placement: 'bottom', access: { module: 'documents.draft', requireAny: true } },
      { route: '/drafts', target: 'new-draft-assign-reviewer', titleKey: 'tour_user_20_title', bodyKey: 'tour_user_20_body', placement: 'bottom', access: { module: 'documents.draft', requireAny: true } },
      { route: '/drafts', target: 'new-draft-submit-review', titleKey: 'tour_user_21_title', bodyKey: 'tour_user_21_body', placement: 'top', access: { module: 'documents.draft', requireAny: true } },
      { route: '/review-approval', target: 'nav-review-approval', titleKey: 'tour_user_22_title', bodyKey: 'tour_user_22_body', placement: 'right', access: { module: 'documents.review', requireAny: true } },
      { route: '/review-approval', target: 'ra-list-card', titleKey: 'tour_user_23_title', bodyKey: 'tour_user_23_body', placement: 'bottom', access: { module: 'documents.review', requireAny: true } },
      { route: '/published', target: 'nav-published', titleKey: 'tour_user_24_title', bodyKey: 'tour_user_24_body', placement: 'right', access: { module: 'documents.published', requireAny: true } },
      { route: '/published', target: 'pub-docs-table', titleKey: 'tour_user_25_title', bodyKey: 'tour_user_25_body', placement: 'bottom', access: { module: 'documents.published', requireAny: true } },
      { route: '/archived', target: 'nav-archived', titleKey: 'tour_user_26_title', bodyKey: 'tour_user_26_body', placement: 'right', access: { module: 'documents.superseded', requireAny: true } },
      { route: '/archived', target: 'so-list-card', titleKey: 'tour_user_27_title', bodyKey: 'tour_user_27_body', placement: 'bottom', access: { module: 'documents.superseded', requireAny: true } }
    ].filter(canAccessStep)
  }, [tourId])

  useEffect(() => {
    if (!open) return
    setStepIndex(0)
  }, [open, tourId])

  useEffect(() => {
    if (!open) return
    if (!steps.length) {
      onClose?.({ completed: false })
      return
    }
    setStepIndex((prev) => Math.min(prev, steps.length - 1))
  }, [open, steps, onClose])

  useEffect(() => {
    if (!open) return
    const step = steps[stepIndex]
    if (!step) return
    if (step.route && location.pathname !== step.route) {
      navigate(step.route)
    }
  }, [open, stepIndex, steps, location.pathname, navigate])

  useEffect(() => {
    if (!open) return
    const step = steps[stepIndex]
    if (!step) return

    const clear = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      rafRef.current = null
      timeoutRef.current = null
    }

    clear()
    setTargetRect(null)
    if (clickedStepRef.current !== -1 && clickedStepRef.current !== stepIndex) {
      clickedStepRef.current = -1
    }

    const start = Date.now()
    const tick = () => {
      const found = getTargetRect(step.target)
      if (found) {
        try {
          const isNavTarget = String(step.target || '').startsWith('nav-')
          if (isNavTarget) {
            const parent = getScrollParent(found.el)
            const visible = parent ? isElementFullyVisibleInParent(found.el, parent, 10) : true
            if (!visible) found.el.scrollIntoView({ block: 'nearest' })
          } else {
            found.el.scrollIntoView({ block: 'center', behavior: 'smooth' })
          }
        } catch {
        }
        if (step.click && clickedStepRef.current !== stepIndex) {
          try {
            found.el.click()
            clickedStepRef.current = stepIndex
          } catch {
          }
        }
        setTargetRect(found.rect)
        return
      }
      if (Date.now() - start > TOUR_TARGET_TIMEOUT_MS) return
      rafRef.current = requestAnimationFrame(tick)
    }

    timeoutRef.current = setTimeout(() => tick(), 0)
    return clear
  }, [open, stepIndex, steps, location.pathname])

  useEffect(() => {
    if (!open) return
    const onResize = () => {
      const step = steps[stepIndex]
      if (!step) return
      const found = getTargetRect(step.target)
      setTargetRect(found?.rect || null)
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
    }
  }, [open, stepIndex, steps])

  const step = steps[stepIndex]
  const isLast = stepIndex === steps.length - 1

  useLayoutEffect(() => {
    if (!open) return
    const el = tooltipRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const next = { width: rect.width, height: rect.height }
    setTooltipSize((prev) => (prev.width === next.width && prev.height === next.height ? prev : next))
  }, [open, stepIndex, targetRect, tourId])

  if (!open) return null
  if (!step) return null

  const tooltipPos = computeTooltipPosition(targetRect, step?.placement || 'bottom', tooltipSize)

  const pad = 8
  const highlight = targetRect
    ? {
        left: Math.max(0, targetRect.left - pad),
        top: Math.max(0, targetRect.top - pad),
        width: Math.min(window.innerWidth, targetRect.width + pad * 2),
        height: Math.min(window.innerHeight, targetRect.height + pad * 2)
      }
    : null

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <div className="absolute inset-0 pointer-events-none" />
      {highlight && (
        <div
          className="fixed rounded-lg"
          style={{
            left: highlight.left,
            top: highlight.top,
            width: highlight.width,
            height: highlight.height,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
            border: '2px solid rgba(253, 224, 71, 0.9)',
            pointerEvents: 'none'
          }}
        />
      )}

      <div
        ref={tooltipRef}
        className="fixed bg-white rounded-lg shadow-xl border border-gray-200 p-4 pointer-events-auto"
        style={{
          left: tooltipPos.left,
          top: tooltipPos.top,
          width: Math.min(380, window.innerWidth - 24),
          maxHeight: Math.min(260, window.innerHeight - 24),
          overflow: 'auto'
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm sm:text-base font-semibold text-gray-900">{t(step.titleKey)}</div>
            <div className="text-xs sm:text-sm text-gray-700 mt-1">{t(step.bodyKey)}</div>
            <div className="text-xs text-gray-500 mt-2">
              {t('tour_step_indicator')} {stepIndex + 1}/{steps.length}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onClose?.({ completed: false })}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 mt-4">
          <button
            type="button"
            onClick={() => onClose?.({ completed: false })}
            className="px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {t('tour_skip')}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
              disabled={stepIndex === 0}
              className="px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
            >
              {t('tour_back')}
            </button>
            <button
              type="button"
              onClick={() => {
                if (isLast) onClose?.({ completed: true })
                else setStepIndex((i) => Math.min(steps.length - 1, i + 1))
              }}
              className="px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              {isLast ? t('tour_done') : t('tour_next')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
