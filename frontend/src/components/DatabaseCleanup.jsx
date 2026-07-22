import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { usePreferences } from '../contexts/PreferencesContext';

export default function DatabaseCleanup() {
  const { t } = usePreferences();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  
  // Modal states
  const [showCleanupModal, setShowCleanupModal] = useState(false);
  const [showTestingModal, setShowTestingModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  
  // Form states
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [includeFiles, setIncludeFiles] = useState(false);
  
  // Result states
  const [cleanupResult, setCleanupResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('user')
      const user = raw ? JSON.parse(raw) : null
      const roles = Array.isArray(user?.roles) ? user.roles : []
      const hasAdmin = roles.some((r) => r?.role?.name === 'admin' || r?.name === 'admin')
      setIsAdminUser(!!hasAdmin)
    } catch {
      setIsAdminUser(false)
    }
  }, [])

  const loadStats = async () => {
    try {
      setLoading(true);
      const res = await api.get('/system/cleanup/stats');
      setStats(res.data.data.stats);
    } catch (error) {
      console.error('Failed to load cleanup stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCleanupDatabase = async () => {
    if (!password) {
      setError('Password is required');
      return;
    }

    setProcessing(true);
    setError('');
    setCleanupResult(null);

    try {
      const res = await api.post('/system/cleanup/database', {
        password,
        includeFiles
      });

      setCleanupResult(res.data.data.results);
      setPassword('');
      setIncludeFiles(false);
      setShowCleanupModal(false);
      
      // Reload stats after cleanup
      await loadStats();
      
      alert('Database cleanup completed successfully!');
    } catch (error) {
      setError(error.response?.data?.message || 'Database cleanup failed');
    } finally {
      setProcessing(false);
    }
  };

  const handleFullReset = async () => {
    if (!password) {
      setError('Password is required');
      return;
    }

    if (confirmText !== 'RESET EVERYTHING') {
      setError('You must type "RESET EVERYTHING" to confirm');
      return;
    }

    setProcessing(true);
    setError('');
    setCleanupResult(null);

    try {
      const res = await api.post('/system/cleanup/full-reset', {
        password,
        confirmText,
        includeFiles
      });

      setCleanupResult(res.data.data.results);
      setPassword('');
      setConfirmText('');
      setIncludeFiles(false);
      setShowResetModal(false);
      
      // Reload stats after reset
      await loadStats();
      
      alert('Full system reset completed successfully!');
    } catch (error) {
      setError(error.response?.data?.message || 'Full system reset failed');
    } finally {
      setProcessing(false);
    }
  };

  const handleCleanupTestingData = async () => {
    if (!password) {
      setError('Password is required');
      return;
    }

    setProcessing(true);
    setError('');
    setCleanupResult(null);

    try {
      const res = await api.post('/system/cleanup/testing-data', {
        password,
        includeFiles
      });

      setCleanupResult(res.data.data.results);
      setPassword('');
      setIncludeFiles(false);
      setShowTestingModal(false);
      
      await loadStats();
      
      alert('Testing data cleanup completed successfully!');
    } catch (error) {
      setError(error.response?.data?.message || 'Testing data cleanup failed');
    } finally {
      setProcessing(false);
    }
  };

  const openCleanupModal = () => {
    if (!isAdminUser) {
      setError('Only administrators can perform database cleanup. Please login as an admin user.');
      return;
    }
    setShowCleanupModal(true);
    setError('');
    setPassword('');
    setIncludeFiles(false);
  };

  const openTestingModal = () => {
    if (!isAdminUser) {
      setError('Only administrators can perform database cleanup. Please login as an admin user.');
      return;
    }
    setShowTestingModal(true);
    setError('');
    setPassword('');
    setIncludeFiles(false);
  };

  const openResetModal = () => {
    if (!isAdminUser) {
      setError('Only administrators can perform database cleanup. Please login as an admin user.');
      return;
    }
    setShowResetModal(true);
    setError('');
    setPassword('');
    setConfirmText('');
    setIncludeFiles(false);
  };

  const closeModals = () => {
    setShowCleanupModal(false);
    setShowTestingModal(false);
    setShowResetModal(false);
    setError('');
    setPassword('');
    setConfirmText('');
    setIncludeFiles(false);
  };

  if (loading) {
    return <div className="text-gray-500">{t('dc_loading_stats')}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900">{t('dc_title')}</h2>
        <p className="text-sm text-gray-500 mt-1">
          {t('dc_desc')}
        </p>
      </div>

      {/* Current Statistics */}
      <div className="card p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-4">{t('dc_current_stats')}</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard label="Users" value={stats?.users || 0} icon="👥" />
          <StatCard label="Documents" value={stats?.documents || 0} icon="📄" />
          <StatCard label="Folders" value={stats?.folders || 0} icon="📁" />
          <StatCard label="Templates" value={stats?.templates || 0} icon="📋" />
          <StatCard label="Workflows" value={stats?.workflows || 0} icon="🔄" />
          <StatCard label="Notifications" value={stats?.notifications || 0} icon="🔔" />
          <StatCard label="Comments" value={stats?.comments || 0} icon="💬" />
          <StatCard label="Audit Logs" value={stats?.auditLogs || 0} icon="📊" />
          <StatCard label="Reports" value={stats?.reports || 0} icon="📈" />
          <StatCard 
            label={t('dc_total_records')} 
            value={stats?.totalRecords || 0}
            icon="🗄️" 
            highlight 
          />
        </div>
      </div>

      {!isAdminUser && (
        <div className="card p-5 bg-yellow-50 border-yellow-200">
          <p className="text-sm text-yellow-800">
            Only administrators can run cleanup actions. Please login with an admin account to proceed.
          </p>
        </div>
      )}

      {/* Cleanup Result */}
      {cleanupResult && (
        <div className="card p-5 bg-green-50 border-green-200">
          <h3 className="text-base font-semibold text-green-900 mb-3">✅ {t('dc_cleanup_completed')}</h3>
          <div className="text-sm text-green-800 space-y-1">
            <p><strong>Timestamp:</strong> {new Date(cleanupResult.timestamp).toLocaleString()}</p>
            <p><strong>Records Cleaned:</strong></p>
            <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
              {Object.entries(cleanupResult.cleaned).map(([key, value]) => (
                <li key={key}>{key}: {value} records</li>
              ))}
            </ul>
            {cleanupResult.fileCleanup && (
              <p className="mt-2">
                <strong>Files Deleted:</strong> {cleanupResult.fileCleanup.deletedFiles}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Warning Card */}
      <div className="card p-5 bg-red-50 border-red-200">
        <div className="flex items-start gap-3">
          <div className="text-2xl">⚠️</div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-red-900 mb-2">⚠️ {t('dc_warning_title')}</h3>
            <p className="text-sm text-red-800 mb-3">
              {t('dc_warning_desc')}
            </p>
            <ul className="text-sm text-red-700 space-y-1 list-disc list-inside">
              <li>Database Cleanup: Removes all data but <strong>preserves master data</strong> (Document Types, Project Categories)</li>
              <li>Testing Data Cleanup: Removes test data while <strong>preserving configuration</strong> (Folders, Templates, Workflows, Master Data)</li>
              <li>Full System Reset: Removes <strong>ALL data including master data</strong></li>
              <li>Both options keep your admin user account active</li>
              <li>These operations <strong>CANNOT be undone</strong></li>
            </ul>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Database Cleanup */}
        <div className="card p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-2">Database Cleanup</h3>
          <p className="text-sm text-gray-600 mb-4">
            Remove all documents, users, and activity data while preserving master data (Document Types, Project Categories).
          </p>
          <button
            onClick={openCleanupModal}
            className="btn-danger w-full"
            disabled={!isAdminUser}
          >
            🗑️ Clean Database
          </button>
        </div>

        {/* Testing Data Cleanup */}
        <div className="card p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-2">Testing Data Cleanup</h3>
          <p className="text-sm text-gray-600 mb-4">
            Delete test data while keeping configuration (Folders, Templates, Workflows, Master Data). Keeps only your admin account.
          </p>
          <button
            onClick={openTestingModal}
            className="btn-danger w-full"
            disabled={!isAdminUser}
          >
            🧹 Clean Testing Data
          </button>
        </div>

        {/* Full System Reset */}
        <div className="card p-5 border-red-300">
          <h3 className="text-base font-semibold text-red-900 mb-2">Full System Reset</h3>
          <p className="text-sm text-red-700 mb-4">
            Remove <strong>EVERYTHING</strong> including master data. Use this when migrating to a new company.
          </p>
          <button
            onClick={openResetModal}
            className="bg-red-700 hover:bg-red-800 text-white px-4 py-2 rounded-md transition-colors w-full font-medium"
            disabled={!isAdminUser}
          >
            ⚠️ Full System Reset
          </button>
        </div>
      </div>

      {/* Database Cleanup Modal */}
      {showCleanupModal && (
        <Modal
          title="Database Cleanup"
          onClose={closeModals}
          danger
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              This will permanently delete all documents, users, workflows, and activity data.
            </p>
            <p className="text-sm font-semibold text-gray-900">
              ✅ Preserved: Document Types, Project Categories, Your Admin Account
            </p>
            
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div>
              <label className="label">Admin Password *</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="Enter your admin password"
                disabled={processing}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="includeFiles"
                checked={includeFiles}
                onChange={(e) => setIncludeFiles(e.target.checked)}
                disabled={processing}
                className="rounded"
              />
              <label htmlFor="includeFiles" className="text-sm text-gray-700">
                Also delete uploaded files from storage
              </label>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={closeModals}
                className="btn-secondary flex-1"
                disabled={processing}
              >
                Cancel
              </button>
              <button
                onClick={handleCleanupDatabase}
                className="btn-danger flex-1"
                disabled={processing}
              >
                {processing ? 'Processing...' : 'Confirm Cleanup'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Testing Data Cleanup Modal */}
      {showTestingModal && (
        <Modal
          title="Testing Data Cleanup"
          onClose={closeModals}
          danger
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              This will permanently delete all documents and activity data, and remove all users except your admin account.
            </p>
            <p className="text-sm font-semibold text-gray-900">
              ✅ Preserved: Folders, Templates, Workflows, Document Types, Project Categories, Your Admin Account
            </p>
            
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div>
              <label className="label">Admin Password *</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="Enter your admin password"
                disabled={processing}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="includeFilesTesting"
                checked={includeFiles}
                onChange={(e) => setIncludeFiles(e.target.checked)}
                disabled={processing}
                className="rounded"
              />
              <label htmlFor="includeFilesTesting" className="text-sm text-gray-700">
                Also delete uploaded document files from storage (keeps templates)
              </label>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={closeModals}
                className="btn-secondary flex-1"
                disabled={processing}
              >
                Cancel
              </button>
              <button
                onClick={handleCleanupTestingData}
                className="btn-danger flex-1"
                disabled={processing}
              >
                {processing ? 'Processing...' : 'Confirm Cleanup'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Full Reset Modal */}
      {showResetModal && (
        <Modal
          title="⚠️ Full System Reset"
          onClose={closeModals}
          danger
        >
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-300 rounded-md p-3">
              <p className="text-sm font-semibold text-red-900 mb-2">
                ⚠️ EXTREME CAUTION REQUIRED
              </p>
              <p className="text-sm text-red-800">
                This will delete <strong>EVERYTHING</strong> including all master data, document types, and project categories. Only your admin account will remain.
              </p>
            </div>
            
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div>
              <label className="label">Admin Password *</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="Enter your admin password"
                disabled={processing}
              />
            </div>

            <div>
              <label className="label">Type "RESET EVERYTHING" to confirm *</label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="input"
                placeholder="RESET EVERYTHING"
                disabled={processing}
              />
              <p className="text-xs text-gray-500 mt-1">Must match exactly (case sensitive)</p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="includeFilesReset"
                checked={includeFiles}
                onChange={(e) => setIncludeFiles(e.target.checked)}
                disabled={processing}
                className="rounded"
              />
              <label htmlFor="includeFilesReset" className="text-sm text-gray-700">
                Also delete uploaded files from storage
              </label>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={closeModals}
                className="btn-secondary flex-1"
                disabled={processing}
              >
                Cancel
              </button>
              <button
                onClick={handleFullReset}
                className="bg-red-700 hover:bg-red-800 text-white px-4 py-2 rounded-md transition-colors flex-1 font-medium"
                disabled={processing}
              >
                {processing ? 'Processing...' : 'Confirm Full Reset'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// Helper Components
function StatCard({ label, value, icon, highlight }) {
  return (
    <div className={`p-4 rounded-lg border ${highlight ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
      <div className="text-2xl mb-2">{icon}</div>
      <div className={`text-2xl font-bold ${highlight ? 'text-blue-700' : 'text-gray-900'}`}>
        {value.toLocaleString()}
      </div>
      <div className={`text-xs ${highlight ? 'text-blue-600' : 'text-gray-600'} mt-1`}>
        {label}
      </div>
    </div>
  );
}

function Modal({ title, children, onClose, danger }) {
  return (
    <>
      <div className="fixed inset-0 bg-overlay z-[90]" onClick={onClose}></div>
      <div className="fixed inset-0 flex items-center justify-center z-[91] p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
          <div className={`px-6 py-4 border-b ${danger ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}>
            <h3 className={`text-lg font-semibold ${danger ? 'text-red-900' : 'text-gray-900'}`}>
              {title}
            </h3>
          </div>
          <div className="px-6 py-4">
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
