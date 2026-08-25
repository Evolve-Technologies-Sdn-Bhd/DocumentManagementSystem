import React from 'react'
import { Link } from 'react-router-dom'
import AppSurface from '../ui/AppSurface'
import SectionHeader from '../ui/SectionHeader'
import { usePreferences } from '../../contexts/PreferencesContext'

const actions = [
  {
    key: 'new-document',
    labelKey: 'quick_actions_new_document',
    descriptionKey: 'quick_actions_new_document_desc',
    to: '/new-document-request'
  },
  {
    key: 'my-documents',
    labelKey: 'quick_actions_my_documents',
    descriptionKey: 'quick_actions_my_documents_desc',
    to: '/documents/my-documents'
  },
  {
    key: 'drafts',
    labelKey: 'quick_actions_drafts',
    descriptionKey: 'quick_actions_drafts_desc',
    to: '/documents/drafts'
  },
  {
    key: 'review-approval',
    labelKey: 'quick_actions_review_approval',
    descriptionKey: 'quick_actions_review_approval_desc',
    to: '/documents/review-approval'
  }
]

export default function DashboardQuickActions() {
  const { t } = usePreferences()

  return (
    <AppSurface padding="lg" className="space-y-4">
      <SectionHeader
        title={t('quick_actions_title')}
        subtitle={t('quick_actions_subtitle')}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {actions.map((action) => (
          <Link
            key={action.key}
            to={action.to}
            className="rounded-2xl border border-border bg-surface-muted p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/20 hover:bg-surface hover:shadow-dms-soft"
          >
            <div className="text-sm font-semibold text-ink">{t(action.labelKey)}</div>
            <p className="mt-2 text-xs leading-5 text-ink-muted">{t(action.descriptionKey)}</p>
          </Link>
        ))}
      </div>
    </AppSurface>
  )
}
