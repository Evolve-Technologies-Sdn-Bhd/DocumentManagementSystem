import React, { useEffect, useLayoutEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import HomePage from './components/HomePage'
import DiagnosticPage from './components/DiagnosticPage'
import Dashboard from './components/Dashboard'
import NewDocumentRequest from './components/NewDocumentRequest'
import MyDocumentsStatus from './components/MyDocumentsStatus'
import DraftDocuments from './components/DraftDocuments'
import ReviewAndApproval from './components/ReviewAndApproval'
import PublishedDocuments from './components/PublishedDocuments'
import SupersededObsolete from './components/SupersededObsolete'
import Configuration from './components/Configuration'
import LogsReports from './pages/LogsReports'
import ReportViewer from './components/ReportViewer'
import MasterRecord from './pages/MasterRecord'
import ProfileSettings from './pages/ProfileSettings'
import DocumentLink from './pages/DocumentLink'
import Login from './components/Login'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import SessionProvider from './components/SessionProvider'
import RfidEpcRegistry from './components/RfidEpcRegistry'
import ProjectTracking from './components/ProjectTracking'
import { PreferencesProvider } from './contexts/PreferencesContext'
import api from './api/axios'
import { applyCompanyInfo, applyTheme, persistBranding } from './utils/branding'

export default function App() {
  useLayoutEffect(() => {
    try {
      const savedTheme = localStorage.getItem('dms_theme_settings')
      if (savedTheme) applyTheme(JSON.parse(savedTheme))
    } catch {}
    try {
      const savedCompanyInfo = localStorage.getItem('dms_company_info')
      if (savedCompanyInfo) applyCompanyInfo(JSON.parse(savedCompanyInfo))
    } catch {}
  }, [])

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const res = await api.get('/public/branding')
        const companyInfo = res.data?.data?.companyInfo || null
        const theme = res.data?.data?.theme || null
        if (!mounted) return
        persistBranding({ companyInfo, theme })
        applyTheme(theme)
        applyCompanyInfo(companyInfo)
      } catch {}
    }
    load()
    return () => {
      mounted = false
    }
  }, [])

  return (
    <PreferencesProvider>
    <SessionProvider>
      <div className="min-h-screen">
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<HomePage />} />
          <Route path="/diagnostic" element={<DiagnosticPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/documents/:id" element={<DocumentLink />} />
          
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
          path="/project-tracking"
          element={
            <ProtectedRoute module="projectTracking" action="view">
              <Layout>
                <ProjectTracking />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/project-tracking/:projectId"
          element={
            <ProtectedRoute module="projectTracking" action="view">
              <Layout>
                <ProjectTracking />
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
            <ProtectedRoute module="documents.draft" requireAny>
              <Layout>
                <DraftDocuments />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/review-approval"
          element={
            <ProtectedRoute module="documents.review" requireAny>
              <Layout>
                <ReviewAndApproval />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/published"
          element={
            <ProtectedRoute module="documents.published" requireAny>
              <Layout>
                <PublishedDocuments />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/archived"
          element={
            <ProtectedRoute module="documents.superseded" requireAny>
              <Layout>
                <SupersededObsolete />
              </Layout>
            </ProtectedRoute>
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
            <ProtectedRoute module="logsReport.activityLogs" requireAny>
              <Layout>
                <LogsReports />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ProtectedRoute module="logsReport.activityLogs" requireAny>
              <Layout>
                <LogsReports />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/:reportType"
          element={
            <ProtectedRoute module="logsReport.activityLogs" requireAny>
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
            <ProtectedRoute module="profileSettings" action="view">
              <Layout>
                <ProfileSettings />
              </Layout>
            </ProtectedRoute>
          }
        />
        </Routes>
      </div>
    </SessionProvider>
    </PreferencesProvider>
  )
}
