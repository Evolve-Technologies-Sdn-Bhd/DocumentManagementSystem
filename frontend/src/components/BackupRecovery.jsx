import React, { useState, useEffect } from 'react'
import api from '../api/axios'
import ConfirmModal, { AlertModal } from './ConfirmModal'
import { usePreferences } from '../contexts/PreferencesContext'
import Pagination from './Pagination'

export default function BackupRecovery() {
  const { t } = usePreferences()
  const [backups, setBackups] = useState([])
  const [loading, setLoading] = useState(true)
  const [isCreatingBackup, setIsCreatingBackup] = useState(false)
  const [backupName, setBackupName] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' })
  const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null })

  useEffect(() => {
    loadBackups()
  }, [])

  const loadBackups = async () => {
    try {
      setLoading(true)
      const res = await api.get('/system/backups')
      setBackups(res.data.backups || [])
    } catch (error) {
      console.error('Failed to load backups:', error)
      setBackups([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setCurrentPage(1)
  }, [backups.length])

  const totalRecords = backups.length
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize))
  const pageItems = backups.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const handleCreateBackup = async () => {
    if (!backupName.trim()) {
      setAlertModal({ show: true, title: 'Validation Error', message: 'Please enter a backup name', type: 'warning' })
      return
    }

    try {
      setIsCreatingBackup(true)
      await api.post('/system/backups', { 
        name: backupName.trim(),
        description: 'Manual backup'
      })
      setAlertModal({ show: true, title: 'Success', message: 'Backup created successfully!', type: 'success' })
      setShowCreateModal(false)
      setBackupName('')
      await loadBackups()
    } catch (error) {
      console.error('Failed to create backup:', error)
      setAlertModal({ show: true, title: 'Error', message: error.response?.data?.message || 'Failed to create backup. Please try again.', type: 'error' })
    } finally {
      setIsCreatingBackup(false)
    }
  }

  const handleDownloadBackup = async (backup) => {
    try {
      const res = await api.get(`/system/backups/${backup.id}/download`, {
        responseType: 'blob'
      })
      
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', backup.fileName || `backup_${backup.id}.zip`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to download backup:', error)
      setAlertModal({ show: true, title: 'Error', message: 'Failed to download backup. Please try again.', type: 'error' })
    }
  }

  const handleRestoreBackup = async (backup) => {
    setConfirmModal({
      show: true,
      title: 'Restore Backup',
      message: `Are you sure you want to restore from "${backup.name}"? WARNING: This will replace all current data with the backup data. This action cannot be undone.`,
      onConfirm: () => {
        setConfirmModal({ show: false })
        // Double confirmation
        setConfirmModal({
          show: true,
          title: 'Final Confirmation',
          message: 'This is your final confirmation. Do you really want to proceed with the restore?',
          onConfirm: async () => {
            setConfirmModal({ show: false })
            try {
              setLoading(true)
              await api.post(`/system/backups/${backup.id}/restore`)
              setAlertModal({ show: true, title: 'Success', message: 'Backup restored successfully! The page will reload now.', type: 'success' })
              setTimeout(() => window.location.reload(), 2000)
            } catch (error) {
              console.error('Failed to restore backup:', error)
              setAlertModal({ show: true, title: 'Error', message: error.response?.data?.message || 'Failed to restore backup. Please try again.', type: 'error' })
              setLoading(false)
            }
          }
        })
      }
    })
  }

  const handleDeleteBackup = async (backup) => {
    setConfirmModal({
      show: true,
      title: 'Confirm Delete',
      message: `Are you sure you want to delete backup "${backup.name}"? This action cannot be undone.`,
      onConfirm: async () => {
        setConfirmModal({ show: false })
        try {
          await api.delete(`/system/backups/${backup.id}`)
          setAlertModal({ show: true, title: 'Success', message: 'Backup deleted successfully!', type: 'success' })
          await loadBackups()
        } catch (error) {
          console.error('Failed to delete backup:', error)
          setAlertModal({ show: true, title: 'Error', message: error.response?.data?.message || 'Failed to delete backup. Please try again.', type: 'error' })
        }
      }
    })
  }

  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return 'N/A'
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="space-y-6">
      {/* Modal Components */}
      <ConfirmModal
        show={confirmModal.show}
        title={confirmModal.title}
        message={confirmModal.message}
        type="danger"
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal({ show: false })}
      />
      <AlertModal
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ show: false })}
      />

      {/* Header */}
      <div className="card p-6">
        <h2 className="text-2xl font-bold text-gray-900">{t('br_title')}</h2>
        <p className="text-sm text-gray-600 mt-1">
          {t('br_desc')}
        </p>
        <div className="mt-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-900">{t('br_important_notice')}</p>
              <p className="text-sm text-amber-700 mt-1">
                {t('br_notice_desc')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Backup List */}
      <div className="card p-6">
        <div className="mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{t('br_available_backups')}</h3>
              <p className="text-sm text-gray-600 mt-1">
                {backups.length} {t('br_backups_available')}
              </p>
            </div>
            
            <button 
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {t('br_create_backup')}
            </button>
          </div>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('br_backup_name')}</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('rp_created_on')}</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('size')}</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('status')}</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" className="text-center py-8 text-gray-500">
                    <div className="flex flex-col items-center gap-2">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      <span>Loading backups...</span>
                    </div>
                  </td>
                </tr>
              ) : backups.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center py-12 text-gray-500">
                    <div className="flex flex-col items-center gap-2">
                      <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                      </svg>
                      <span className="font-medium">No backups found</span>
                      <span className="text-sm">Create your first backup to get started</span>
                    </div>
                  </td>
                </tr>
              ) : (
                pageItems.map((backup) => (
                  <tr key={backup.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                        </svg>
                        <div>
                          <div className="font-medium text-gray-900">{backup.name}</div>
                          {backup.description && (
                            <div className="text-xs text-gray-500">{backup.description}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-gray-700">{formatDate(backup.createdAt)}</td>
                    <td className="py-4 px-4 text-gray-700">{formatFileSize(backup.size)}</td>
                    <td className="py-4 px-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        backup.status === 'completed' ? 'bg-green-100 text-green-800' :
                        backup.status === 'failed' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {backup.status || 'completed'}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDownloadBackup(backup)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="Download Backup"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleRestoreBackup(backup)}
                          className="p-2 text-green-600 hover:bg-green-50 rounded transition-colors"
                          title="Restore Backup"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteBackup(backup)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Delete Backup"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden space-y-4">
          {loading ? (
            <div className="text-center py-8 text-gray-500">
              <div className="flex flex-col items-center gap-2">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span>Loading backups...</span>
              </div>
            </div>
          ) : backups.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <span>No backups found</span>
            </div>
          ) : (
            pageItems.map((backup) => (
              <div key={backup.id} className="border border-gray-200 rounded-lg p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <svg className="w-6 h-6 text-blue-600 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900">{backup.name}</div>
                    {backup.description && (
                      <div className="text-xs text-gray-500 mt-1">{backup.description}</div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-500">Created:</span>
                    <div className="text-gray-900 font-medium text-xs">{formatDate(backup.createdAt)}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Size:</span>
                    <div className="text-gray-900 font-medium">{formatFileSize(backup.size)}</div>
                  </div>
                </div>
                <div className="flex gap-2 pt-2 border-t border-gray-200">
                  <button
                    onClick={() => handleDownloadBackup(backup)}
                    className="flex-1 px-3 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 flex items-center justify-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    {t('download')}
                  </button>
                  <button
                    onClick={() => handleRestoreBackup(backup)}
                    className="flex-1 px-3 py-2 text-sm text-white bg-green-600 rounded hover:bg-green-700 flex items-center justify-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {t('mr_restore')}
                  </button>
                  <button
                    onClick={() => handleDeleteBackup(backup)}
                    className="px-3 py-2 text-sm text-white bg-red-600 rounded hover:bg-red-700"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalRecords={totalRecords}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1) }}
        />
      </div>

      {/* Create Backup Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-overlay flex items-center justify-center p-4 z-[90]">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">{t('br_create_backup')}</h3>
            </div>
            <div className="px-6 py-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('br_backup_name')}
              </label>
              <input
                type="text"
                value={backupName}
                onChange={(e) => setBackupName(e.target.value)}
                placeholder="e.g., Weekly Backup, Pre-Update Backup"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                autoFocus
                disabled={isCreatingBackup}
              />
              <p className="mt-2 text-sm text-gray-500">
                Give your backup a descriptive name to help identify it later.
              </p>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowCreateModal(false)
                  setBackupName('')
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
                disabled={isCreatingBackup}
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleCreateBackup}
                disabled={isCreatingBackup}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isCreatingBackup ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    {t('loading')}
                  </>
                ) : (
                  t('br_create_backup')
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
