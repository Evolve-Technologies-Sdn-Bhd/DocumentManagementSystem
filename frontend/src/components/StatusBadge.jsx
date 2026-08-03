import React from 'react'
import { usePreferences } from '../contexts/PreferencesContext'

/**
 * Unified StatusBadge Component
 * Use this component consistently across all pages for status display
 */
export default function StatusBadge({ status }) {
  const { t } = usePreferences()

  // Comprehensive status configuration with consistent styling
  const statusConfig = {
    // Draft/Work in Progress States
    'DRAFT': { 
      label: t('status_draft'), 
      style: 'bg-gray-100 text-gray-700 border-gray-300'
    },
    'Draft': { 
      label: t('status_draft'), 
      style: 'bg-gray-100 text-gray-700 border-gray-300'
    },
    'Draft Saved': { 
      label: t('status_draft'), 
      style: 'bg-gray-100 text-gray-700 border-gray-300'
    },
    'Drafting': { 
      label: t('status_drafting'), 
      style: 'bg-blue-100 text-blue-700 border-blue-300'
    },
    'SUBMITTED': {
      label: t('status_submitted'),
      style: 'bg-blue-100 text-blue-700 border-blue-300'
    },
    'Submitted': {
      label: t('status_submitted'),
      style: 'bg-blue-100 text-blue-700 border-blue-300'
    },
    'PENDING': {
      label: t('status_pending'),
      style: 'bg-yellow-100 text-yellow-700 border-yellow-300'
    },
    'KIV': {
      label: t('status_kiv'),
      style: 'bg-purple-100 text-purple-700 border-purple-300'
    },
    'In Progress': { 
      label: t('status_in_progress'), 
      style: 'bg-blue-100 text-blue-700 border-blue-300'
    },
    'WON': {
      label: t('status_won'),
      style: 'bg-green-100 text-green-700 border-green-300'
    },
    'Won': {
      label: t('status_won'),
      style: 'bg-green-100 text-green-700 border-green-300'
    },
    'LOST': {
      label: t('status_lost'),
      style: 'bg-red-100 text-red-700 border-red-300'
    },
    'Lost': {
      label: t('status_lost'),
      style: 'bg-red-100 text-red-700 border-red-300'
    },
    'IN_PIPELINE': {
      label: t('status_in_pipeline'),
      style: 'bg-blue-100 text-blue-700 border-blue-300'
    },
    'In Pipeline': {
      label: t('status_in_pipeline'),
      style: 'bg-blue-100 text-blue-700 border-blue-300'
    },
    'CONTACTED': {
      label: t('status_contacted'),
      style: 'bg-sky-100 text-sky-700 border-sky-300'
    },
    'Contacted': {
      label: t('status_contacted'),
      style: 'bg-sky-100 text-sky-700 border-sky-300'
    },
    'FOLLOW_UP': {
      label: t('status_follow_up'),
      style: 'bg-indigo-100 text-indigo-700 border-indigo-300'
    },
    'Follow Up': {
      label: t('status_follow_up'),
      style: 'bg-indigo-100 text-indigo-700 border-indigo-300'
    },
    'NO_RESPONSE': {
      label: t('status_no_response'),
      style: 'bg-gray-100 text-gray-700 border-gray-300'
    },
    'No Response': {
      label: t('status_no_response'),
      style: 'bg-gray-100 text-gray-700 border-gray-300'
    },
    'QUOTATION_ISSUED': {
      label: t('status_quotation_issued'),
      style: 'bg-amber-100 text-amber-700 border-amber-300'
    },
    'Quotation Issued': {
      label: t('status_quotation_issued'),
      style: 'bg-amber-100 text-amber-700 border-amber-300'
    },
    'QUALIFIED': {
      label: t('status_qualified'),
      style: 'bg-indigo-100 text-indigo-700 border-indigo-300'
    },
    'Qualified': {
      label: t('status_qualified'),
      style: 'bg-indigo-100 text-indigo-700 border-indigo-300'
    },
    'QUOTATION_PROVIDED': {
      label: t('status_quotation_provided'),
      style: 'bg-amber-100 text-amber-700 border-amber-300'
    },
    'Quotation Provided': {
      label: t('status_quotation_provided'),
      style: 'bg-amber-100 text-amber-700 border-amber-300'
    },
    'CONVERTED': {
      label: t('status_converted'),
      style: 'bg-green-100 text-green-700 border-green-300'
    },
    'Converted': {
      label: t('status_converted'),
      style: 'bg-green-100 text-green-700 border-green-300'
    },
    'NEW': {
      label: t('status_new'),
      style: 'bg-gray-100 text-gray-700 border-gray-300'
    },
    'New': {
      label: t('status_new'),
      style: 'bg-gray-100 text-gray-700 border-gray-300'
    },
    
    // Review States
    'Waiting for Review': { 
      label: t('status_waiting_review'), 
      style: 'bg-yellow-100 text-yellow-700 border-yellow-300'
    },
    'Pending Review': { 
      label: t('status_in_review'), 
      style: 'bg-yellow-100 text-yellow-700 border-yellow-300'
    },
    'Ready for Review': { 
      label: t('status_ready_review'), 
      style: 'bg-green-100 text-green-700 border-green-300'
    },
    'In Review': { 
      label: t('status_in_review'), 
      style: 'bg-yellow-100 text-yellow-700 border-yellow-300'
    },
    
    // Approval States
    'Pending Approval': { 
      label: t('status_pending_approval'), 
      style: 'bg-blue-100 text-blue-700 border-blue-300'
    },
    'PENDING_FIRST_APPROVAL': {
      label: t('status_pending_first_approval'),
      style: 'bg-blue-100 text-blue-700 border-blue-300'
    },
    'IN_FIRST_APPROVAL': {
      label: t('status_in_first_approval'),
      style: 'bg-blue-100 text-blue-700 border-blue-300'
    },
    'PENDING_SECOND_APPROVAL': {
      label: t('status_pending_second_approval'),
      style: 'bg-purple-100 text-purple-700 border-purple-300'
    },
    'IN_SECOND_APPROVAL': {
      label: t('status_in_second_approval'),
      style: 'bg-purple-100 text-purple-700 border-purple-300'
    },
    'READY_TO_PUBLISH': {
      label: t('status_ready_publish'),
      style: 'bg-emerald-100 text-emerald-700 border-emerald-300'
    },
    
    // Revision/Amendment States
    'Return for Amendments': { 
      label: t('status_needs_revision'), 
      style: 'bg-red-100 text-red-700 border-red-300'
    },
    'Needs Revision': { 
      label: t('status_needs_revision'), 
      style: 'bg-red-100 text-red-700 border-red-300'
    },
    
    // Process States
    'Pending': { 
      label: t('status_pending'), 
      style: 'bg-yellow-100 text-yellow-700 border-yellow-300'
    },
    'Pending Acknowledgment': { 
      label: t('status_pending_ack'), 
      style: 'bg-yellow-100 text-yellow-700 border-yellow-300'
    },
    'In Process': { 
      label: t('status_in_process'), 
      style: 'bg-orange-100 text-orange-700 border-orange-300'
    },
    
    // Approval/Success States
    'Acknowledged': { 
      label: t('status_acknowledged'), 
      style: 'bg-green-100 text-green-700 border-green-300'
    },
    'Approved': { 
      label: t('status_approved'), 
      style: 'bg-green-100 text-green-700 border-green-300'
    },
    'PUBLISHED': { 
      label: t('status_published'), 
      style: 'bg-green-100 text-green-700 border-green-300'
    },
    'Published': { 
      label: t('status_published'), 
      style: 'bg-green-100 text-green-700 border-green-300'
    },
    'Active': { 
      label: t('status_active'), 
      style: 'bg-green-100 text-green-700 border-green-300'
    },
    
    // Archive/End States
    'Archived': { 
      label: t('status_archived'), 
      style: 'bg-gray-100 text-gray-600 border-gray-300'
    },
    'Obsolete': { 
      label: t('status_obsolete'), 
      style: 'bg-gray-100 text-gray-600 border-gray-300'
    },
    'Superseded': { 
      label: t('status_superseded'), 
      style: 'bg-gray-100 text-gray-600 border-gray-300'
    },
    
    // Rejection States
    'Rejected': { 
      label: t('status_rejected'), 
      style: 'bg-red-100 text-red-700 border-red-300'
    },
    'Cancelled': { 
      label: t('status_cancelled'), 
      style: 'bg-red-100 text-red-700 border-red-300'
    }
  }

  const config = statusConfig[status] || { 
    label: status, 
    style: 'bg-gray-100 text-gray-700 border-gray-300'
  }

  return (
    <span className={`inline-flex items-center px-3 py-1 text-xs font-medium rounded-full border whitespace-nowrap ${config.style}`}>
      {config.label}
    </span>
  )
}
