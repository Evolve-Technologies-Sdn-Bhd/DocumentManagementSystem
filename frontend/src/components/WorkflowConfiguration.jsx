import React, { useState, useEffect } from 'react'
import api from '../api/axios'
import AddWorkflowModal from './AddWorkflowModal'
import ActionMenu from './ActionMenu'
import { PermissionGate } from './PermissionGate'
import { hasPermission } from '../utils/permissions'
import ConfirmModal, { AlertModal } from './ConfirmModal'

export default function WorkflowConfiguration() {
  const [workflows, setWorkflows] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [showAddWorkflowModal, setShowAddWorkflowModal] = useState(false)
  const [editingWorkflow, setEditingWorkflow] = useState(null)
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' })
  const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null })
  const itemsPerPage = 10

  useEffect(() => {
    loadWorkflows()
  }, [])

  const loadWorkflows = async () => {
    try {
      const res = await api.get('/workflow/workflows')
      const data = res.data.workflows || []
      setWorkflows(data)
    } catch (error) {
      console.error('Failed to load workflows:', error)
      setAlertModal({ show: true, title: 'Error', message: 'Failed to load workflows. Please try again.', type: 'error' })
      setWorkflows([])
    } finally {
      setLoading(false)
    }
  }

  const filteredWorkflows = workflows.filter(workflow => {
    const matchesSearch = 
      workflow.workflowName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      workflow.documentType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      workflow.description.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesStatus = statusFilter === 'all' || workflow.status.toLowerCase() === statusFilter.toLowerCase()
    
    return matchesSearch && matchesStatus
  })

  const totalPages = Math.ceil(filteredWorkflows.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const currentWorkflows = filteredWorkflows.slice(startIndex, endIndex)

  const handlePageChange = (page) => {
    setCurrentPage(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleAddNewWorkflow = (e) => {
    e?.preventDefault()
    setEditingWorkflow(null)
    setShowAddWorkflowModal(true)
  }

  const handleEdit = (e, workflow) => {
    e?.preventDefault()
    setEditingWorkflow(workflow)
    setShowAddWorkflowModal(true)
  }

  const handleView = (workflow) => {
    setAlertModal({ show: true, title: `Workflow: ${workflow.workflowName}`, message: `Steps: ${workflow.stepsDetail.join(' → ')}`, type: 'info' })
  }

  const handleStatusChange = async (workflowId, newStatus) => {
    try {
      await api.patch(`/workflow/workflows/${workflowId}/toggle`)
      setWorkflows(prev => prev.map(w => 
        w.id === workflowId ? { ...w, status: newStatus } : w
      ))
    } catch (error) {
      console.error('Failed to update workflow status:', error)
      setAlertModal({ show: true, title: 'Error', message: 'Failed to update workflow status. Please try again.', type: 'error' })
    }
  }

  const handleDelete = async (workflow) => {
    setConfirmModal({
      show: true,
      title: 'Confirm Delete',
      message: `Are you sure you want to delete the workflow "${workflow.workflowName}"?`,
      onConfirm: async () => {
        setConfirmModal({ show: false })
        try {
          await api.delete(`/workflow/workflows/${workflow.id}`)
          setWorkflows(prev => prev.filter(w => w.id !== workflow.id))
          setAlertModal({ show: true, title: 'Success', message: `Workflow "${workflow.workflowName}" has been deleted successfully`, type: 'success' })
        } catch (error) {
          console.error('Failed to delete workflow:', error)
          const errorMsg = error.response?.data?.message || 'Failed to delete workflow. Please try again.'
          setAlertModal({ show: true, title: 'Error', message: errorMsg, type: 'error' })
        }
      }
    })
  }

  const handleWorkflowSubmit = async (workflowData) => {
    try {
      if (editingWorkflow) {
        // Update existing workflow
        await api.put(`/workflow/workflows/${editingWorkflow.id}`, workflowData)
        setAlertModal({ show: true, title: 'Success', message: 'Workflow updated successfully!', type: 'success' })
      } else {
        // Create new workflow
        await api.post('/workflow/workflows', workflowData)
        setAlertModal({ show: true, title: 'Success', message: 'Workflow created successfully!', type: 'success' })
      }
      
      setShowAddWorkflowModal(false)
      setEditingWorkflow(null)
      
      // Reload workflows
      loadWorkflows()
    } catch (error) {
      console.error('Failed to save workflow:', error)
      const errorMsg = error.response?.data?.message || 'Failed to save workflow. Please try again.'
      setAlertModal({ show: true, title: 'Error', message: errorMsg, type: 'error' })
    }
  }

  const getStatusBadge = (status) => {
    const styles = {
      Active: 'bg-[var(--dms-color-success-soft)] text-[var(--dms-color-success-ink)]',
      Inactive: 'bg-surface-muted text-ink-secondary'
    }
    return (
      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-surface-muted text-ink-secondary'}`}>
        {status}
      </span>
    )
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

      {/* Add/Edit Workflow Modal */}
      {showAddWorkflowModal && (
        <AddWorkflowModal
          onClose={() => {
            setShowAddWorkflowModal(false)
            setEditingWorkflow(null)
          }}
          onSubmit={handleWorkflowSubmit}
          initialData={editingWorkflow}
        />
      )}

      {/* Header */}
      <div className="card p-6">
        <h2 className="text-2xl font-bold text-ink">Workflow Configuration</h2>
        <p className="text-sm text-ink-secondary mt-1">
          Configure approval workflows and routing rules for document processing
        </p>
        <p className="text-sm text-ink-secondary">
          Define review, approval, and acknowledgement steps for each document type
        </p>
      </div>

      {/* Workflow List */}
      <div className="card p-6">
        <div className="mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
            <div>
              <h3 className="text-lg font-semibold text-ink">Workflow List</h3>
              <p className="text-sm text-ink-secondary mt-1">
                Manage and configure document approval workflows
              </p>
            </div>
            
            {/* Add New Workflow Button */}
            <PermissionGate module="configuration.workflows" action="create">
              <button 
                onClick={handleAddNewWorkflow}
                className="px-4 py-2 text-sm font-medium text-ink-inverse bg-brand rounded-lg hover:bg-brand-hover transition-colors"
              >
                + Add New Workflow
              </button>
            </PermissionGate>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Search */}
            <div className="relative">
              <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-ink-soft" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search by workflow name, document type, or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-border rounded-lg outline-none bg-surface text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand"
              />
            </div>

            {/* Status Filter */}
            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg outline-none bg-surface text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
        </div>

        {/* Desktop Table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-muted">
                <th className="text-left py-3 px-4 font-semibold text-ink-secondary text-xs uppercase tracking-wide">Workflow Name</th>
                <th className="text-left py-3 px-4 font-semibold text-ink-secondary text-xs uppercase tracking-wide">Document Type</th>
                <th className="text-left py-3 px-4 font-semibold text-ink-secondary text-xs uppercase tracking-wide">Description</th>
                <th className="text-left py-3 px-4 font-semibold text-ink-secondary text-xs uppercase tracking-wide">Steps</th>
                <th className="text-left py-3 px-4 font-semibold text-ink-secondary text-xs uppercase tracking-wide">Status</th>
                <th className="text-center py-3 px-4 font-semibold text-ink-secondary text-xs uppercase tracking-wide">Active</th>
                <th className="text-left py-3 px-4 font-semibold text-ink-secondary text-xs uppercase tracking-wide">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="text-center py-8 text-ink-muted">
                    <div className="flex flex-col items-center gap-2">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand"></div>
                      <span>Loading workflows...</span>
                    </div>
                  </td>
                </tr>
              ) : currentWorkflows.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-12 text-ink-muted">
                    <div className="flex flex-col items-center gap-2">
                      <svg className="w-12 h-12 text-ink-soft" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      <span>No workflows found</span>
                    </div>
                  </td>
                </tr>
              ) : (
                currentWorkflows.map((workflow) => (
                  <tr key={workflow.id} className="border-b border-border hover:bg-surface-muted transition-colors">
                    <td className="py-4 px-4">
                      <div className="font-medium text-ink">{workflow.workflowName}</div>
                      <div className="text-xs text-ink-muted mt-0.5">Created: {workflow.createdOn}</div>
                    </td>
                    <td className="py-4 px-4 text-ink-secondary">{workflow.documentType}</td>
                    <td className="py-4 px-4 text-ink-secondary max-w-xs truncate">{workflow.description}</td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-1">
                        <span className="font-semibold text-brand">{workflow.steps}</span>
                        <span className="text-ink-muted text-xs">steps</span>
                      </div>
                    </td>
                    <td className="py-4 px-4">{getStatusBadge(workflow.status)}</td>
                    <td className="py-4 px-4">
                      <div className="flex items-center justify-center">
                        {hasPermission('configuration.workflows', 'update') ? (
                          <button
                            onClick={() => handleStatusChange(workflow.id, workflow.status === 'Active' ? 'Inactive' : 'Active')}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand/20 focus:ring-offset-0 ${
                              workflow.status === 'Active' ? 'bg-[var(--dms-color-success-ink)]' : 'bg-surface-strong'
                            }`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-surface transition-transform ${
                                workflow.status === 'Active' ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        ) : (
                          getStatusBadge(workflow.status)
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <ActionMenu
                        actions={[
                          ...(hasPermission('configuration.workflows', 'read') ? [{ label: 'View', onClick: () => handleView(workflow) }] : []),
                          ...(hasPermission('configuration.workflows', 'update') ? [{ label: 'Edit', onClick: (e) => handleEdit(e, workflow), dividerAfter: true }] : []),
                          ...(hasPermission('configuration.workflows', 'delete') ? [{ label: 'Delete', onClick: () => handleDelete(workflow), variant: 'destructive' }] : [])
                        ]}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="lg:hidden space-y-4">
          {loading ? (
            <div className="text-center py-8 text-ink-muted">
              <div className="flex flex-col items-center gap-2">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand"></div>
                <span>Loading workflows...</span>
              </div>
            </div>
          ) : currentWorkflows.length === 0 ? (
            <div className="text-center py-12 text-ink-muted">
              <span>No workflows found</span>
            </div>
          ) : (
            currentWorkflows.map((workflow) => (
              <div key={workflow.id} className="border border-border rounded-lg p-4 space-y-3 bg-surface">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-semibold text-ink">{workflow.workflowName}</div>
                    <div className="text-sm text-ink-secondary mt-1">{workflow.documentType}</div>
                  </div>
                  {getStatusBadge(workflow.status)}
                </div>
                <p className="text-sm text-ink-secondary">{workflow.description}</p>
                <div className="flex items-center gap-4 text-sm">
                  <div>
                    <span className="text-ink-muted">Steps:</span>
                    <span className="ml-1 font-medium text-brand">{workflow.steps}</span>
                  </div>
                  <div>
                    <span className="text-ink-muted">Created:</span>
                    <span className="ml-1 text-ink">{workflow.createdOn}</span>
                  </div>
                </div>
                <div className="space-y-2 pt-2 border-t border-border">
                  {hasPermission('configuration.workflows', 'update') && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-ink-secondary">Active:</span>
                      <button
                        onClick={() => handleStatusChange(workflow.id, workflow.status === 'Active' ? 'Inactive' : 'Active')}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand/20 focus:ring-offset-0 ${
                          workflow.status === 'Active' ? 'bg-[var(--dms-color-success-ink)]' : 'bg-surface-strong'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-surface transition-transform ${
                            workflow.status === 'Active' ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  )}
                  <div className="flex gap-2">
                    {hasPermission('configuration.workflows', 'read') && (
                      <button
                        onClick={() => handleView(workflow)}
                        className="flex-1 px-3 py-2 text-sm text-ink-secondary bg-surface-muted rounded hover:bg-surface-strong"
                      >
                        View
                      </button>
                    )}
                    {hasPermission('configuration.workflows', 'update') && (
                      <button
                        onClick={(e) => handleEdit(e, workflow)}
                        className="flex-1 px-3 py-2 text-sm text-brand bg-surface-muted rounded hover:bg-surface-strong"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 pt-4 border-t border-border">
            <div className="text-sm text-ink-secondary">
              Showing {startIndex + 1} to {Math.min(endIndex, filteredWorkflows.length)} of {filteredWorkflows.length} workflows
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-2 hover:bg-surface-muted rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-5 h-5 text-ink-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              
              {[...Array(totalPages)].map((_, index) => {
                const page = index + 1
                if (
                  page === 1 ||
                  page === totalPages ||
                  (page >= currentPage - 1 && page <= currentPage + 1)
                ) {
                  return (
                    <button
                      key={page}
                      onClick={() => handlePageChange(page)}
                      className={`w-8 h-8 rounded ${
                        page === currentPage
                          ? 'bg-brand text-ink-inverse'
                          : 'hover:bg-surface-muted text-ink-secondary'
                      }`}
                    >
                      {page}
                    </button>
                  )
                } else if (page === currentPage - 2 || page === currentPage + 2) {
                  return <span key={page} className="text-ink-muted px-1">...</span>
                }
                return null
              })}
              
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-2 hover:bg-surface-muted rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-5 h-5 text-ink-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
