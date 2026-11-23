import React, { Suspense, lazy, useEffect, useLayoutEffect } from 'react'
import { Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom'
import HomePage from './components/HomePage'
import DiagnosticPage from './components/DiagnosticPage'
import Dashboard from './components/Dashboard'
import CalendarPage from './components/CalendarPage'
import NewDocumentRequest from './components/NewDocumentRequest'
import MyDocumentsStatus from './components/MyDocumentsStatus'
import DraftDocuments from './components/DraftDocuments'
import ReviewAndApproval from './components/ReviewAndApproval'
import PublishedDocuments from './components/PublishedDocuments'
import SupersededObsolete from './components/SupersededObsolete'
import Configuration from './components/Configuration'
import SystemReports from './components/SystemReports'
import LogsReports from './pages/LogsReports'
import ReportViewer from './components/ReportViewer'
import MasterRecord from './pages/MasterRecord'
import ProfileSettings from './pages/ProfileSettings'
import SmartDocumentEditor from './pages/SmartDocumentEditor'
import DocumentLink from './pages/DocumentLink'
import PublicShare from './pages/PublicShare'
import Maintenance from './pages/Maintenance'
import Login from './components/Login'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import SessionProvider from './components/SessionProvider'
import RfidEpcRegistry from './components/RfidEpcRegistry'
import ExpiryTracking from './components/ExpiryTracking'
import TenderBookRegister from './components/TenderBookRegister'
import FbEnquiryRegister from './components/FbEnquiryRegister'
import { PreferencesProvider, usePreferences } from './contexts/PreferencesContext'
import api from './api/axios'
import { applyCompanyInfo, applyTheme, applyThemeMode, persistBranding, readCompanyInfo, readStoredJson, readThemeSettings } from './utils/branding'
import { isSystemAdmin } from './utils/permissions'
import { getDefaultRoute } from './utils/defaultRoute'

const ProjectTracking = lazy(() => import('./components/ProjectTracking'))
const ProjectDashboardPage = lazy(() =>
  import('./components/ProjectTracking').then((module) => ({
    default: module.ProjectDashboardPage
  }))
)

function SmartDocGate({ children }) {
  const { smartDocumentEnabled } = usePreferences()
  const navigate = useNavigate()

  useEffect(() => {
    if (!smartDocumentEnabled) {
      navigate('/draft-documents', { replace: true })
    }
  }, [smartDocumentEnabled, navigate])

  if (!smartDocumentEnabled) return null
  return children
}

function SystemFeatureRefresher({ children }) {
  const { refreshSystemFeatureFlags } = usePreferences()
  const location = useLocation()

  useEffect(() => {
    refreshSystemFeatureFlags()
  }, [location.pathname, refreshSystemFeatureFlags])

  return children
}

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()

  useLayoutEffect(() => {
    const savedTheme = readThemeSettings()
    const savedCompanyInfo = readCompanyInfo()
    const savedPreferences = readStoredJson('userPreferences')
    applyThemeMode(savedPreferences?.themeMode)
    if (savedTheme) applyTheme(savedTheme)
    if (savedCompanyInfo) applyCompanyInfo(savedCompanyInfo)
  }, [])

  useEffect(() => {
    let cancelled = false
    let timer = null
    const load = async () => {
      const alreadyCached = Boolean(readCompanyInfo() && readThemeSettings())
      const delayMs = alreadyCached ? 3500 : 800
      await new Promise((r) => { timer = setTimeout(r, delayMs) })
      if (cancelled) return
      try {
        const res = await api.get('/public/branding', { timeout: 6000, skipGlobalLoading: true, _retryAttempt: 0 })
        if (cancelled) return
        const companyInfo = res.data?.data?.companyInfo || null
        const theme = res.data?.data?.theme || null
        persistBranding({ companyInfo, theme })
        if (theme) applyTheme(theme)
        if (companyInfo) applyCompanyInfo(companyInfo)
      } catch {}
    }
    load()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let timer = null
    let inFlight = false
    let checkAgain = false

    const checkMaintenance = async () => {
      if (cancelled) return

      if (inFlight) {
        checkAgain = true
        return
      }

      inFlight = true
      let nextDelay = 15000;

      try {
        const res = await api.get('/public/maintenance-status', {
          timeout: 5000,
          skipGlobalLoading: true,
          _retryAttempt: 0
        })

        if (cancelled) return

        const data = res?.data?.data || {}
        const enabled = Boolean(data.enabled)
        const message =
          data.message || res?.data?.message || 'System is under maintenance'

        const nextStatus = {
          enabled,
          manualEnabled: Boolean(data.manualEnabled),
          message,
          manualMessage: data.manualMessage || message,
          scheduleStatus: data.scheduleStatus || 'disabled',
          schedule: data.schedule || {
            enabled: false,
            startAt: null,
            endAt: null,
            message
          }
        }

        try {
          localStorage.setItem('maintenanceStatus', JSON.stringify(nextStatus))
        } catch {}

        nextDelay = 10000;

        const schedule = nextStatus.schedule || {};
        const transitionAt = nextStatus.scheduleStatus === 'pending'
          ? Date.parse(schedule.startAt)
          : nextStatus.scheduleStatus === 'active'
            ? Date.parse(schedule.endAt)
            : NaN;

        if (Number.isFinite(transitionAt) && transitionAt > Date.now()) {
          nextDelay = Math.min(
            nextDelay,
            Math.max(250, transitionAt - Date.now() + 150)
          );
        }

        const hasSystemAdminAccess = isSystemAdmin()
        const path = location.pathname

        if (
          enabled &&
          !hasSystemAdminAccess &&
          path !== '/maintenance' &&
          path !== '/login'
        ) {
          navigate('/maintenance', { replace: true })
        }
      } catch {}
      finally {
        inFlight = false

        if (!cancelled) {
          if (checkAgain) {
            checkAgain = false
            timer = setTimeout(checkMaintenance, 0)
          } else {
            timer = setTimeout(checkMaintenance, nextDelay)
          }
        }
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      if (timer) clearTimeout(timer)
      checkMaintenance()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    timer = setTimeout(checkMaintenance, 0)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (timer) clearTimeout(timer)
    }
  }, [location.pathname, navigate])

  return (
    <PreferencesProvider>
    <SessionProvider>
      <div className="min-h-screen">
        <SystemFeatureRefresher>
          <Routes>
          {/* Public Routes */}
          <Route path="/" element={<HomePage />} />
          <Route path="/diagnostic" element={<DiagnosticPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/maintenance" element={<Maintenance />} />
          <Route path="/documents/:id" element={<DocumentLink />} />
          <Route path="/share/:token" element={<PublicShare />} />
          
          {/* Protected Routes */}
          <Route
          path="/rfid-epc-registry"
          element={
            <ProtectedRoute module="documents.rfidRegistry" action="view">
              <Layout>
                <RfidEpcRegistry />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/rfid-epc-encoder"
          element={
            <ProtectedRoute module="documents.rfidRegistry" action="view">
              <Layout>
                <RfidEpcRegistry />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
            path="/dashboard"
            element={
              <ProtectedRoute module="dashboard" action="view">
                <Layout>
                  <Dashboard />
                </Layout>
              </ProtectedRoute>
            }
          />
        <Route
          path="/calendar"
          element={
            <ProtectedRoute module="calendar" action="view">
              <Layout>
                <Suspense fallback={<div className="min-h-screen bg-surface p-6 text-sm text-ink-muted">Loading calendar...</div>}>
                  <CalendarPage />
                </Suspense>
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/project-dashboard"
          element={
            <ProtectedRoute module="projectTracking" action="view">
              <Layout>
                <Suspense fallback={<div className="min-h-screen bg-surface p-6 text-sm text-ink-muted">Loading project dashboard...</div>}>
                  <ProjectDashboardPage />
                </Suspense>
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/project-tracking"
          element={
            <ProtectedRoute module="projectTracking" action="view">
              <Layout>
                <Suspense fallback={<div className="min-h-screen bg-surface p-6 text-sm text-ink-muted">Loading project tracking...</div>}>
                  <ProjectTracking />
                </Suspense>
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/project-tracking/:projectId"
          element={
            <ProtectedRoute module="projectTracking" action="view">
              <Layout>
                <Suspense fallback={<div className="min-h-screen bg-surface p-6 text-sm text-ink-muted">Loading project tracking...</div>}>
                  <ProjectTracking />
                </Suspense>
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/expiry-tracking"
          element={
            <ProtectedRoute module="expiryTracking" action="view">
              <Layout>
                <ExpiryTracking />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/tender-book"
          element={
            <ProtectedRoute module="crm.tenderBook" requireAny>
              <Layout>
                <TenderBookRegister />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/fb-enquiries"
          element={
            <ProtectedRoute module="crm.fbEnquiry" requireAny>
              <Layout>
                <FbEnquiryRegister />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/new-document-request"
          element={
            <ProtectedRoute module="newDocumentRequest" action="view">
              <Layout>
                <NewDocumentRequest />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-documents"
          element={
            <ProtectedRoute module="myDocumentsStatus" action="view">
              <Layout>
                <MyDocumentsStatus />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/drafts"
          element={
            <Navigate
              to={`/documents/drafts${location.search || ''}${location.hash || ''}`}
              replace
            />
          }
        />
        <Route
          path="/documents/drafts"
          element={
            <ProtectedRoute module="documents.draft" requireAny>
              <Layout>
                <DraftDocuments />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/documents/review-approval"
          element={
            <ProtectedRoute module="documents.review" requireAny>
              <Layout>
                <ReviewAndApproval />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/documents/published"
          element={
            <ProtectedRoute module="documents.published" requireAny>
              <Layout>
                <PublishedDocuments />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/documents/archived"
          element={
            <ProtectedRoute module="documents.superseded" requireAny>
              <Layout>
                <SupersededObsolete />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/documents/my-documents"
          element={
            <ProtectedRoute module="myDocumentsStatus" action="view">
              <Layout>
                <MyDocumentsStatus />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/review-approval"
          element={
            <Navigate
              to={`/documents/review-approval${location.search || ''}${location.hash || ''}`}
              replace
            />
          }
        />
        <Route
          path="/published"
          element={
            <Navigate
              to={`/documents/published${location.search || ''}${location.hash || ''}`}
              replace
            />
          }
        />
        <Route
          path="/archived"
          element={
            <Navigate
              to={`/documents/archived${location.search || ''}${location.hash || ''}`}
              replace
            />
          }
        />
        <Route
          path="/my-documents"
          element={
            <Navigate
              to={`/documents/my-documents${location.search || ''}${location.hash || ''}`}
              replace
            />
          }
        />
        <Route
          path="/config"
          element={
            <ProtectedRoute module={[
              'configuration.users',
              'configuration.roles',
              'configuration.templates',
              'configuration.templateRequests',
              'configuration.documentTypes',
              'configuration.masterData',
              'configuration.settings',
              'configuration.backup',
              'configuration.cleanup',
              'configuration.auditSettings'
            ]} requireAny>
              <Layout>
                <Configuration />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/logs"
          element={
            <ProtectedRoute
              module={[
                'logsReport.activityLogs',
                'logsReport.userActivity',
                'logsReport.reports',
                'logsReport.analytics'
              ]}
              requireAny
            >
              <Layout>
                <LogsReports />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ProtectedRoute module="logsReport.reports" requireAny>
              <Layout>
                <SystemReports />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/:reportType"
          element={
            <ProtectedRoute module="logsReport.reports" requireAny>
              <Layout>
                <ReportViewer />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/master-record"
          element={
            <ProtectedRoute module="masterRecord" action="view">
              <Layout>
                <MasterRecord />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Layout>
                <ProfileSettings />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/smart-documents/edit/:documentId/:documentVersionId"
          element={
            <ProtectedRoute module="documents.draft" requireAny>
              <Layout>
                <SmartDocGate>
                  <SmartDocumentEditor />
                </SmartDocGate>
              </Layout>
            </ProtectedRoute>
          }
        />
        {/* Unknown URLs must not render a blank page. */}
        <Route
          path="*"
          element={<Navigate to={localStorage.getItem('token') ? getDefaultRoute() : '/login'} replace />}
        />
        </Routes>
        </SystemFeatureRefresher>
      </div>
    </SessionProvider>
    </PreferencesProvider>
  )
}
