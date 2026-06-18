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
      Active: 'bg-green-100 text-green-800',
      Inactive: 'bg-gray-100 text-gray-800'
    }
    return (
      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
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
        <h2 className="text-2xl font-bold text-gray-900">Workflow Configuration</h2>
        <p className="text-sm text-gray-600 mt-1">
          Configure approval workflows and routing rules for document processing
        </p>
        <p className="text-sm text-gray-600">
          Define review, approval, and acknowledgement steps for each document type
        </p>
      </div>

      {/* Workflow List */}
      <div className="card p-6">
        <div className="mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Workflow List</h3>
              <p className="text-sm text-gray-600 mt-1">
                Manage and configure document approval workflows
              </p>
            </div>
            
            {/* Add New Workflow Button */}
            <PermissionGate module="configuration.workflows" action="create">
              <button 
                onClick={handleAddNewWorkflow}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                + Add New Workflow
              </button>
            </PermissionGate>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Search */}
            <div className="relative">
              <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search by workflow name, document type, or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>

            {/* Status Filter */}
            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
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
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">Workflow Name</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">Document Type</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">Description</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">Steps</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">Status</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">Active</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="text-center py-8 text-gray-500">
                    <div className="flex flex-col items-center gap-2">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      <span>Loading workflows...</span>
                    </div>
                  </td>
                </tr>
              ) : currentWorkflows.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-12 text-gray-500">
                    <div className="flex flex-col items-center gap-2">
                      <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      <span>No workflows found</span>
                    </div>
                  </td>
                </tr>
              ) : (
                currentWorkflows.map((workflow) => (
                  <tr key={workflow.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-4 px-4">
                      <div className="font-medium text-gray-900">{workflow.workflowName}</div>
                      <div className="text-xs text-gray-500 mt-0.5">Created: {workflow.createdOn}</div>
                    </td>
                    <td className="py-4 px-4 text-gray-700">{workflow.documentType}</td>
                    <td className="py-4 px-4 text-gray-600 max-w-xs truncate">{workflow.description}</td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-1">
                        <span className="font-semibold text-blue-600">{workflow.steps}</span>
                        <span className="text-gray-500 text-xs">steps</span>
                      </div>
                    </td>
                    <td className="py-4 px-4">{getStatusBadge(workflow.status)}</td>
                    <td className="py-4 px-4">
                      <div className="flex items-center justify-center">
                        {hasPermission('configuration.workflows', 'update') ? (
                          <button
                            onClick={() => handleStatusChange(workflow.id, workflow.status === 'Active' ? 'Inactive' : 'Active')}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                              workflow.status === 'Active' ? 'bg-green-600' : 'bg-gray-300'
                            }`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                workflow.status === 'Active' ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        ) : (
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                            workflow.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {workflow.status}
                          </span>
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
            <div className="text-center py-8 text-gray-500">
              <div className="flex flex-col items-center gap-2">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span>Loading workflows...</span>
              </div>
            </div>
          ) : currentWorkflows.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <span>No workflows found</span>
            </div>
          ) : (
            currentWorkflows.map((workflow) => (
              <div key={workflow.id} className="border border-gray-200 rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900">{workflow.workflowName}</div>
                    <div className="text-sm text-gray-600 mt-1">{workflow.documentType}</div>
                  </div>
                  {getStatusBadge(workflow.status)}
                </div>
                <p className="text-sm text-gray-600">{workflow.description}</p>
                <div className="flex items-center gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Steps:</span>
                    <span className="ml-1 font-medium text-blue-600">{workflow.steps}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Created:</span>
                    <span className="ml-1 text-gray-900">{workflow.createdOn}</span>
                  </div>
                </div>
                <div className="space-y-2 pt-2 border-t border-gray-200">
                  {hasPermission('configuration.workflows', 'update') && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">Active:</span>
                      <button
                        onClick={() => handleStatusChange(workflow.id, workflow.status === 'Active' ? 'Inactive' : 'Active')}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                          workflow.status === 'Active' ? 'bg-green-600' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
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
                        className="flex-1 px-3 py-2 text-sm text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
                      >
                        View
                      </button>
                    )}
                    {hasPermission('configuration.workflows', 'update') && (
                      <button
                        onClick={(e) => handleEdit(e, workflow)}
                        className="flex-1 px-3 py-2 text-sm text-blue-600 bg-blue-50 rounded hover:bg-blue-100"
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
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 pt-4 border-t border-gray-200">
            <div className="text-sm text-gray-600">
              Showing {startIndex + 1} to {Math.min(endIndex, filteredWorkflows.length)} of {filteredWorkflows.length} workflows
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-2 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                          ? 'bg-blue-600 text-white'
                          : 'hover:bg-gray-100 text-gray-700'
                      }`}
                    >
                      {page}
                    </button>
                  )
                } else if (page === currentPage - 2 || page === currentPage + 2) {
                  return <span key={page} className="text-gray-500 px-1">...</span>
                }
                return null
              })}
              
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-2 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
