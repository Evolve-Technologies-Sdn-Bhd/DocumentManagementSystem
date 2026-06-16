import React, { useState, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'
import { usePreferences } from '../contexts/PreferencesContext'
import api from '../api/axios'
import { applyTheme } from '../utils/branding'
import MarkdownEditor from './MarkdownEditor'

// Sub-tab Navigation
function SubTabNavigation({ activeTab, onTabChange }) {
  const { t } = usePreferences()
  const tabs = [
    { id: 'company', label: t('gss_company_info') },
    { id: 'landing', label: t('gss_landing_page') },
    { id: 'theme', label: t('gss_theme_branding') },
    { id: 'document', label: t('gss_document_settings') },
    { id: 'notification', label: t('gss_notification_settings') },
    { id: 'security', label: t('gss_security') }
  ]

  return (
    <div className="border-b border-gray-200 mb-6" data-tour-id="gss-tabbar">
      <nav className="flex space-x-4 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            data-tour-id={`gss-tab-${tab.id}`}
            className={`py-3 px-4 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  )
};

// Tab 1: Company Information
function CompanyInfo() {
  const { t } = usePreferences()
  const [formData, setFormData] = useState({
    companyName: 'Acme Corporation',
    address: '123 Business Street',
    city: 'Kuala Lumpur',
    state: 'Wilayah Persekutuan',
    zip: '50450',
    country: 'Malaysia',
    phone: '+60 3-1234 5678',
    email: 'info@company.com',
    website: 'www.company.com',
    taxId: 'ABC1234567890',
    businessHoursStart: '09:00',
    businessHoursEnd: '17:00',
    timezone: 'UTC+8'
  })

  useEffect(() => {
    let mounted = true

    const load = async () => {
      try {
        const res = await api.get('/system/config/company-info')
        const companyInfo = res.data?.data?.companyInfo
        if (companyInfo && typeof companyInfo === 'object') {
          if (!mounted) return
          setFormData(companyInfo)
          try {
            localStorage.setItem('dms_company_info', JSON.stringify(companyInfo))
            window.dispatchEvent(new Event('brandingUpdated'))
          } catch {}
          return
        }
      } catch {}

      try {
        const saved = localStorage.getItem('dms_company_info')
        if (saved) {
          const parsed = JSON.parse(saved)
          if (!mounted) return
          setFormData(parsed)
        }
      } catch {}
    }

    load()
    return () => {
      mounted = false
    }
  }, [])

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSave = async () => {
    try {
      const res = await api.put('/system/config/company-info', formData)
      const savedCompanyInfo = res.data?.data?.companyInfo || formData
      try {
        localStorage.setItem('dms_company_info', JSON.stringify(savedCompanyInfo))
        window.dispatchEvent(new Event('brandingUpdated'))
      } catch {}
      alert('Company information saved successfully!')
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to save company information')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">{t('gss_company_profile')}</h3>
        <p className="text-sm text-gray-600 mt-1">{t('gss_company_profile_desc')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">{t('gss_company_name')} *</label>
          <input type="text" name="companyName" value={formData.companyName} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">{t('email_address')} *</label>
          <input type="email" name="email" value={formData.email} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-900 mb-2">{t('gss_company_address')}</label>
          <input type="text" name="address" value={formData.address} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">{t('gss_city')}</label>
          <input type="text" name="city" value={formData.city} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">{t('gss_state')}</label>
          <input type="text" name="state" value={formData.state} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">{t('gss_zip')}</label>
          <input type="text" name="zip" value={formData.zip} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">{t('gss_country')}</label>
          <select name="country" value={formData.country} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white">
            <option>Malaysia</option>
            <option>Singapore</option>
            <option>Indonesia</option>
            <option>Thailand</option>
            <option>Philippines</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">{t('gss_phone')}</label>
          <input type="tel" name="phone" value={formData.phone} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">{t('gss_website')}</label>
          <input type="text" name="website" value={formData.website} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">{t('gss_tax_id')}</label>
          <input type="text" name="taxId" value={formData.taxId} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
        </div>
      </div>

      <div className="border-t border-gray-200 pt-6">
        <h4 className="font-medium text-gray-900 mb-4">{t('gss_business_hours')}</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">{t('gss_start_time')}</label>
            <input type="time" name="businessHoursStart" value={formData.businessHoursStart} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">{t('gss_end_time')}</label>
            <input type="time" name="businessHoursEnd" value={formData.businessHoursEnd} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">{t('gss_time_zone')}</label>
            <select name="timezone" value={formData.timezone} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white">
              <option>UTC+8 (Malaysia)</option>
              <option>UTC+7 (Thailand)</option>
              <option>UTC+9 (Japan)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
          {t('gss_save_changes')}
        </button>
      </div>
    </div>
  )
}

// Tab 2: Landing Page Settings
function LandingPageSettings() {
  const { t } = usePreferences()
  const [content, setContent] = useState({
    // Hero Section
    heroHeadline: 'Centralized Control for Your Documents',
    heroSubheadline: 'A unified system to create, review, approve, and publish all organizational documents — securely and efficiently.',
    heroImage: null,
    heroImagePosition: 'right',
    
    // What is DMS Section
    aboutTitle: 'What is DMS?',
    aboutDescription: 'The Document Management System (DMS) is designed to standardize and digitalize our document lifecycle — from creation to publication and archiving.',
    aboutSubDescription: 'It ensures traceability, accountability, and version control for all controlled documents across departments.',
    aboutImage: null,
    aboutImagePosition: 'left',
    
    // Key Features (8 features)
    features: [
      { title: 'New Document Request (NDR) and Code Generation', iconImage: null, iconBgColor: '#DBEAFE', textColor: '#1E40AF', description: 'Initiate new document requests, auto-generate file codes, and select document templates by type.' },
      { title: 'Drafting, Review & Approval Flow', iconImage: null, iconBgColor: '#D1FAE5', textColor: '#065F46', description: 'Structured document routing between Document Owner, Reviewer, and Approver with version tracking.' },
      { title: 'Publishing & Archiving', iconImage: null, iconBgColor: '#EDE9FE', textColor: '#5B21B6', description: 'Automatically move approved documents to Published, Supersede, or Obsolete folders with controlled duplication.' },
      { title: 'Notification & Acknowledgement', iconImage: null, iconBgColor: '#FEF3C7', textColor: '#92400E', description: 'Real-time system alerts for submission, review, approval, and publication status.' },
      { title: 'Role-Based Access', iconImage: null, iconBgColor: '#CFFAFE', textColor: '#155E75', description: 'Access and permissions are granted based on roles — Document Owner, Reviewer, Approver, Document Controller, and Admin.' },
      { title: 'System Configuration', iconImage: null, iconBgColor: '#FFEDD5', textColor: '#9A3412', description: 'Upload templates, define document types, and manage approval flows per project or department.' },
      { title: 'Log & Audit Trail', iconImage: null, iconBgColor: '#FCE7F3', textColor: '#9D174D', description: 'Every activity and version is recorded for compliance and audit reference.' },
      { title: 'Security & Profile Control', iconImage: null, iconBgColor: '#FEE2E2', textColor: '#991B1B', description: 'Change password, manage profile settings, and maintain secure document ownership.' }
    ],
    
    // User Roles Section
    rolesTitle: 'Who Uses This System?',
    roles: [
      { name: 'Admin', description: 'Full control over configurations, roles, and system access.', position: 'center' },
      { name: 'Document Controller', description: 'Oversees NDR acknowledgment, file code generation, publication, and archiving.', position: 'top' },
      { name: 'Document Owner', description: 'Creates and drafts documents, assigns reviewers and approvers.', position: 'bottom' },
      { name: 'Reviewer', description: 'Reviews and recommends approval.', position: 'left' },
      { name: 'Approver', description: 'Approves finalized document and initiates publication.', position: 'right' }
    ],
    
    // Workflow Section
    workflowTitle: 'End-to-End Workflow Overview',
    workflowSteps: [
      { step: 'Initiate New Document Request', color: 'cyan' },
      { step: 'Acknowledge by Controller', color: 'blue' },
      { step: 'Draft and Upload', color: 'gray' },
      { step: 'Review', color: 'cyan' },
      { step: 'Correction (if Any)', color: 'blue' },
      { step: 'Approval', color: 'gray' },
      { step: 'Publish / Archive', color: 'cyan' }
    ],
    workflowImage: null,
    workflowImagePosition: 'right',
    
    // Contact Section
    contactTitle: 'Need Assistance?',
    contactDescription: 'For any questions or technical support, please contact the Document Control team at:',
    contactEmails: ['hanish@clbgroups.com', 'khairul@clbgroups.com'],
    contactPhone: '+60 19-6653453',
    contactImage: null,
    contactImagePosition: 'right',
    
    // Footer
    copyrightText: '© 2025 CLB Groups. All rights reserved.',
    footerLinks: [
      { label: 'Terms of Use', pdf: null },
      { label: 'Privacy Policy', pdf: null }
    ]
  })
  const [maxUploadMB, setMaxUploadMB] = useState(null)

  useEffect(() => {
    let mounted = true

    const applySettings = (parsed) => {
      setContent(prev => ({
        ...prev,
        ...parsed,
        heroImagePosition: parsed.heroImagePosition || prev.heroImagePosition,
        aboutImagePosition: parsed.aboutImagePosition || prev.aboutImagePosition,
        workflowImagePosition: parsed.workflowImagePosition || prev.workflowImagePosition,
        contactImagePosition: parsed.contactImagePosition || prev.contactImagePosition
      }))
    }

    const load = async () => {
      try {
        const res = await api.get('/system/config/file-upload')
        const settings = res.data?.data?.settings
        if (settings && typeof settings === 'object' && mounted) {
          const mb = Number(settings.maxFileSize)
          if (!Number.isNaN(mb) && Number.isFinite(mb)) setMaxUploadMB(mb)
        }
      } catch {}

      try {
        const res = await api.get('/system/config/landing-page-settings')
        const serverSettings = res.data?.data?.settings
        if (serverSettings && typeof serverSettings === 'object') {
          if (!mounted) return
          applySettings(serverSettings)
          try {
            localStorage.setItem('dms_landing_page_settings', JSON.stringify(serverSettings))
          } catch {}
          return
        }
      } catch {}

      try {
        const saved = localStorage.getItem('dms_landing_page_settings')
        if (!saved) return
        const parsed = JSON.parse(saved)
        if (!mounted) return
        applySettings(parsed)
      } catch {}
    }

    load()
    return () => {
      mounted = false
    }
  }, [])

  const handleSave = async () => {
    try {
      const res = await api.put('/system/config/landing-page-settings', content)
      const savedSettings = res.data?.data?.settings || content
      try {
        localStorage.setItem('dms_landing_page_settings', JSON.stringify(savedSettings))
      } catch {}
      alert('Landing page settings saved successfully!')
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to save landing page settings')
    }
  }

  const isHexColor = (v) => typeof v === 'string' && /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v)
  const hexOr = (v, fallback) => (isHexColor(v) ? v : fallback)

  const MAX_LP_IMAGE_BYTES = 2 * 1024 * 1024
  const formatBytes = (bytes) => {
    const mb = bytes / (1024 * 1024)
    if (mb >= 1) return `${Math.round(mb * 10) / 10} MB`
    const kb = bytes / 1024
    if (kb >= 1) return `${Math.round(kb)} KB`
    return `${bytes} B`
  }
  const maxLpImageHint = `Max ${formatBytes(MAX_LP_IMAGE_BYTES)} per image`

  const validateImageFile = (file, inputEl) => {
    if (!file) return false
    if (file.size > MAX_LP_IMAGE_BYTES) {
      if (inputEl) inputEl.value = ''
      alert(`Image too large. ${maxLpImageHint}.`)
      return false
    }
    return true
  }

  const handleAddFeature = () => {
    setContent(prev => ({
      ...prev,
      features: [...prev.features, { title: '', iconImage: null, iconBgColor: '#F3F4F6', textColor: '#1F2937', description: '' }]
    }))
  }

  const handleIconImageUpload = (index, event) => {
    const file = event.target.files[0]
    if (!file) return
    if (!validateImageFile(file, event.target)) return
    const reader = new FileReader()
    reader.onloadend = () => {
      handleFeatureChange(index, 'iconImage', reader.result)
    }
    reader.readAsDataURL(file)
  }

  const handleSectionImageUpload = (section, event) => {
    const file = event.target.files[0]
    if (!file) return
    if (!validateImageFile(file, event.target)) return
    const reader = new FileReader()
    reader.onloadend = () => {
      setContent(prev => ({ ...prev, [section]: reader.result }))
    }
    reader.readAsDataURL(file)
  }

  const handleFeatureChange = (index, field, value) => {
    setContent(prev => ({
      ...prev,
      features: prev.features.map((f, i) => i === index ? { ...f, [field]: value } : f)
    }))
  }

  const handleRemoveFeature = (index) => {
    setContent(prev => ({
      ...prev,
      features: prev.features.filter((_, i) => i !== index)
    }))
  }

  const handleAddRole = () => {
    setContent(prev => ({
      ...prev,
      roles: [...prev.roles, { name: '', description: '', position: 'center' }]
    }))
  }

  const handleRoleChange = (index, field, value) => {
    setContent(prev => ({
      ...prev,
      roles: prev.roles.map((r, i) => i === index ? { ...r, [field]: value } : r)
    }))
  }

  const handleRemoveRole = (index) => {
    setContent(prev => ({
      ...prev,
      roles: prev.roles.filter((_, i) => i !== index)
    }))
  }

  const handleAddWorkflowStep = () => {
    setContent(prev => ({
      ...prev,
      workflowSteps: [...prev.workflowSteps, { step: '', color: 'gray' }]
    }))
  }

  const handleWorkflowStepChange = (index, field, value) => {
    setContent(prev => ({
      ...prev,
      workflowSteps: prev.workflowSteps.map((s, i) => i === index ? { ...s, [field]: value } : s)
    }))
  }

  const handleRemoveWorkflowStep = (index) => {
    setContent(prev => ({
      ...prev,
      workflowSteps: prev.workflowSteps.filter((_, i) => i !== index)
    }))
  }

  const handleAddContactEmail = () => {
    setContent(prev => ({
      ...prev,
      contactEmails: [...prev.contactEmails, '']
    }))
  }

  const handleContactEmailChange = (index, value) => {
    setContent(prev => ({
      ...prev,
      contactEmails: prev.contactEmails.map((e, i) => i === index ? value : e)
    }))
  }

  const handleRemoveContactEmail = (index) => {
    setContent(prev => ({
      ...prev,
      contactEmails: prev.contactEmails.filter((_, i) => i !== index)
    }))
  }

  const handleAddFooterLink = () => {
    setContent(prev => ({
      ...prev,
      footerLinks: [...prev.footerLinks, { label: '', pdf: null }]
    }))
  }

  const handleFooterLinkChange = (index, field, value) => {
    setContent(prev => ({
      ...prev,
      footerLinks: prev.footerLinks.map((l, i) => i === index ? { ...l, [field]: value } : l)
    }))
  }

  const handleRemoveFooterLink = (index) => {
    setContent(prev => ({
      ...prev,
      footerLinks: prev.footerLinks.filter((_, i) => i !== index)
    }))
  }

  const handleFooterPdfUpload = (index, event) => {
    const file = event.target.files[0]
    if (!file) return
    if (file.type !== 'application/pdf') {
      alert('Please upload a PDF file')
      return
    }

    if (typeof maxUploadMB === 'number' && Number.isFinite(maxUploadMB)) {
      const maxBytes = maxUploadMB * 1024 * 1024
      if (file.size > maxBytes) {
        alert(`File too large. Max upload size is ${maxUploadMB}MB`)
        return
      }
    }

    const formData = new FormData()
    formData.append('file', file)
    api
      .post('/system/config/landing-page/footer-pdf', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      .then((res) => {
        const url = res.data?.data?.url
        if (url) handleFooterLinkChange(index, 'pdf', url)
      })
      .catch((error) => {
        const msg = error?.response?.status === 413
          ? (typeof maxUploadMB === 'number' ? `File too large. Max upload size is ${maxUploadMB}MB` : 'File too large')
          : (error?.response?.data?.message || 'Failed to upload PDF')
        alert(msg)
      })
  }

  const handlePreview = () => {
    window.open('/', '_blank')
  }

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h3 className="text-sm font-semibold text-blue-900">{t('gss_lp_content_mgr')}</h3>
            <p className="text-xs text-blue-800 mt-1">{t('gss_lp_content_mgr_desc')}</p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-600">
          <span className="font-medium">7 Sections</span> • Customize content, images, and layout
        </div>
        <button onClick={handlePreview} className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
          👁 {t('gss_lp_preview')}
        </button>
      </div>

      {/* Hero Section */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-4">{t('gss_lp_hero')}</h4>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">{t('gss_lp_headline')}</label>
            <input type="text" value={content.heroHeadline} onChange={(e) => setContent(prev => ({ ...prev, heroHeadline: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">{t('gss_lp_subheadline')}</label>
            <MarkdownEditor
              value={content.heroSubheadline}
              onChange={(val) => setContent(prev => ({ ...prev, heroSubheadline: val }))}
              rows={2}
            />
          </div>

          <div className="border-t pt-4">
            <label className="block text-sm font-medium text-gray-900 mb-2">Section Image</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                {content.heroImage && (
                  <div className="mb-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                    ✓ Image uploaded (see preview)
                  </div>
                )}
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={(e) => handleSectionImageUpload('heroImage', e)} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none file:mr-2 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                <p className="text-xs text-gray-500 mt-1">{maxLpImageHint}</p>
                {content.heroImage && (
                  <button 
                    onClick={() => setContent(prev => ({ ...prev, heroImage: null }))} 
                    className="mt-2 w-full px-3 py-2 text-sm text-red-600 bg-red-50 hover:bg-red-100 rounded-lg"
                  >
                    Remove Image
                  </button>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-2">Image Position</label>
                <select 
                  value={content.heroImagePosition} 
                  onChange={(e) => setContent(prev => ({ ...prev, heroImagePosition: e.target.value }))} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none bg-white"
                >
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
                {content.heroImage && (
                  <div className="mt-2 border rounded-lg p-2 bg-gray-50">
                    <p className="text-xs text-gray-600 mb-2">Preview:</p>
                    <img src={content.heroImage} alt="Hero" className="w-full h-32 object-contain rounded" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* What is DMS Section */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-4">{t('gss_lp_about')}</h4>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Section Title</label>
            <input type="text" value={content.aboutTitle} onChange={(e) => setContent(prev => ({ ...prev, aboutTitle: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Main Description</label>
            <MarkdownEditor
              value={content.aboutDescription}
              onChange={(val) => setContent(prev => ({ ...prev, aboutDescription: val }))}
              rows={3}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Sub Description</label>
            <MarkdownEditor
              value={content.aboutSubDescription}
              onChange={(val) => setContent(prev => ({ ...prev, aboutSubDescription: val }))}
              rows={2}
            />
          </div>
          <div className="border-t pt-4">
            <label className="block text-sm font-medium text-gray-900 mb-2">Section Image (Optional)</label>
            <p className="text-xs text-gray-600 mb-2">Upload a custom image to replace the default gradient icon</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                {content.aboutImage && (
                  <div className="mb-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                    ✓ Image uploaded (see preview)
                  </div>
                )}
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={(e) => handleSectionImageUpload('aboutImage', e)} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none file:mr-2 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                <p className="text-xs text-gray-500 mt-1">{maxLpImageHint}</p>
                {content.aboutImage && (
                  <button 
                    onClick={() => setContent(prev => ({ ...prev, aboutImage: null }))} 
                    className="mt-2 w-full px-3 py-2 text-sm text-red-600 bg-red-50 hover:bg-red-100 rounded-lg"
                  >
                    Remove Image
                  </button>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-2">Image Position</label>
                <select 
                  value={content.aboutImagePosition} 
                  onChange={(e) => setContent(prev => ({ ...prev, aboutImagePosition: e.target.value }))} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none bg-white"
                >
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
                {content.aboutImage && (
                  <div className="mt-2 border rounded-lg p-2 bg-gray-50">
                    <p className="text-xs text-gray-600 mb-2">Preview:</p>
                    <img src={content.aboutImage} alt="About" className="w-full h-32 object-contain rounded" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Key Features Section */}
      <div className="border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-medium text-gray-900">{t('gss_lp_features')}</h4>
          <button onClick={handleAddFeature} className="text-sm text-blue-600 hover:text-blue-700 font-medium">{t('gss_lp_add_feature')}</button>
        </div>
        <div className="space-y-3">
          {content.features.map((feature, idx) => (
            <div key={idx} className="border border-gray-200 rounded p-3 bg-gray-50">
              <div className="space-y-3">
                {/* Row 1: Title and Description */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-4">
                    <label className="block text-xs text-gray-600 mb-1">Feature Title</label>
                    <input type="text" value={feature.title} onChange={(e) => handleFeatureChange(idx, 'title', e.target.value)} placeholder="Feature Title" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" />
                  </div>
                  <div className="md:col-span-7">
                    <label className="block text-xs text-gray-600 mb-1">Description</label>
                    <MarkdownEditor
                      value={feature.description}
                      onChange={(val) => handleFeatureChange(idx, 'description', val)}
                      rows={2}
                    />
                  </div>
                  <div className="md:col-span-1 flex items-end">
                    <button onClick={() => handleRemoveFeature(idx)} className="p-2 text-red-600 hover:bg-red-50 rounded w-full" title="Remove">
                      <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
                {/* Row 2: Icon Settings */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-3">
                    <label className="block text-xs text-gray-600 mb-1">Icon Image Upload</label>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={(e) => handleIconImageUpload(idx, e)} 
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs outline-none file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                    <p className="text-xs text-gray-500 mt-1">{maxLpImageHint}</p>
                  </div>
                  <div className={feature.iconImage ? "md:col-span-3" : "md:col-span-3"}>
                    <label className="block text-xs text-gray-600 mb-1">Background Color</label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={hexOr(feature.iconBgColor, '#F3F4F6')}
                        onChange={(e) => handleFeatureChange(idx, 'iconBgColor', e.target.value)}
                        className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                      />
                      <input
                        type="text"
                        value={feature.iconBgColor || ''}
                        onChange={(e) => handleFeatureChange(idx, 'iconBgColor', e.target.value)}
                        placeholder="#F3F4F6"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                      />
                    </div>
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-xs text-gray-600 mb-1">Text Color</label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={hexOr(feature.textColor, '#1F2937')}
                        onChange={(e) => handleFeatureChange(idx, 'textColor', e.target.value)}
                        className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                      />
                      <input
                        type="text"
                        value={feature.textColor || ''}
                        onChange={(e) => handleFeatureChange(idx, 'textColor', e.target.value)}
                        placeholder="#1F2937"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                      />
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs text-gray-600 mb-1">Preview</label>
                    <div
                      className={`w-full h-10 ${isHexColor(feature.iconBgColor) ? '' : (feature.iconBgColor || 'bg-gray-100')} rounded-lg flex items-center justify-center`}
                      style={isHexColor(feature.iconBgColor) ? { backgroundColor: feature.iconBgColor } : undefined}
                    >
                      {feature.iconImage ? (
                        <img src={feature.iconImage} alt="icon" className="h-6 w-6 object-contain" />
                      ) : (
                        <span
                          className={`text-xs ${isHexColor(feature.textColor) ? '' : (feature.textColor || 'text-gray-400')}`}
                          style={isHexColor(feature.textColor) ? { color: feature.textColor } : undefined}
                        >
                          No icon
                        </span>
                      )}
                    </div>
                  </div>
                  {feature.iconImage && (
                    <div className="md:col-span-2">
                      <label className="block text-xs text-gray-600 mb-1">Clear Image</label>
                      <button 
                        onClick={() => handleFeatureChange(idx, 'iconImage', null)} 
                        className="w-full px-3 py-2 text-xs text-red-600 bg-red-50 hover:bg-red-100 rounded-lg"
                      >
                        Remove Image
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* User Roles Section */}
      <div className="border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-medium text-gray-900">{t('gss_lp_roles')}</h4>
          <button onClick={handleAddRole} className="text-sm text-blue-600 hover:text-blue-700 font-medium">{t('gss_lp_add_role')}</button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Section Title</label>
            <input type="text" value={content.rolesTitle} onChange={(e) => setContent(prev => ({ ...prev, rolesTitle: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none" />
          </div>
          <div className="space-y-3">
            {content.roles.map((role, idx) => (
              <div key={idx} className="border border-gray-200 rounded p-3 bg-gray-50">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-3">
                    <input type="text" value={role.name} onChange={(e) => handleRoleChange(idx, 'name', e.target.value)} placeholder="Role Name" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" />
                  </div>
                  <div className="md:col-span-6">
                    <MarkdownEditor
                      value={role.description}
                      onChange={(val) => handleRoleChange(idx, 'description', val)}
                      rows={2}
                      placeholder="Role Description"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <select value={role.position} onChange={(e) => handleRoleChange(idx, 'position', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none bg-white">
                      <option value="center">Center</option>
                      <option value="top">Top</option>
                      <option value="bottom">Bottom</option>
                      <option value="left">Left</option>
                      <option value="right">Right</option>
                    </select>
                  </div>
                  <div className="md:col-span-1 flex items-center">
                    <button onClick={() => handleRemoveRole(idx)} className="p-2 text-red-600 hover:bg-red-50 rounded" title="Remove">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Workflow Section */}
      <div className="border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-medium text-gray-900">{t('gss_lp_workflow')}</h4>
          <button onClick={handleAddWorkflowStep} className="text-sm text-blue-600 hover:text-blue-700 font-medium">{t('gss_lp_add_step')}</button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Section Title</label>
            <input type="text" value={content.workflowTitle} onChange={(e) => setContent(prev => ({ ...prev, workflowTitle: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none" />
          </div>
          <div className="space-y-3">
            {content.workflowSteps.map((step, idx) => (
              <div key={idx} className="border border-gray-200 rounded p-3 bg-gray-50">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-1 flex items-center justify-center">
                    <span className="text-sm font-bold text-gray-600">{idx + 1}</span>
                  </div>
                  <div className="md:col-span-8">
                    <input type="text" value={step.step} onChange={(e) => handleWorkflowStepChange(idx, 'step', e.target.value)} placeholder="Step Name" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" />
                  </div>
                  <div className="md:col-span-2">
                    <select value={step.color} onChange={(e) => handleWorkflowStepChange(idx, 'color', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none bg-white">
                      <option value="cyan">Cyan</option>
                      <option value="blue">Blue</option>
                      <option value="gray">Gray</option>
                    </select>
                  </div>
                  <div className="md:col-span-1 flex items-center">
                    <button onClick={() => handleRemoveWorkflowStep(idx)} className="p-2 text-red-600 hover:bg-red-50 rounded" title="Remove">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t pt-4">
            <label className="block text-sm font-medium text-gray-900 mb-2">Section Image</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                {content.workflowImage && (
                  <div className="mb-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                    ✓ Image uploaded (see preview)
                  </div>
                )}
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={(e) => handleSectionImageUpload('workflowImage', e)} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none file:mr-2 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                <p className="text-xs text-gray-500 mt-1">{maxLpImageHint}</p>
                {content.workflowImage && (
                  <button 
                    onClick={() => setContent(prev => ({ ...prev, workflowImage: null }))} 
                    className="mt-2 w-full px-3 py-2 text-sm text-red-600 bg-red-50 hover:bg-red-100 rounded-lg"
                  >
                    Remove Image
                  </button>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-2">Image Position</label>
                <select 
                  value={content.workflowImagePosition} 
                  onChange={(e) => setContent(prev => ({ ...prev, workflowImagePosition: e.target.value }))} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none bg-white"
                >
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                  <option value="top">Top</option>
                  <option value="bottom">Bottom</option>
                </select>
                {content.workflowImage && (
                  <div className="mt-2 border rounded-lg p-2 bg-gray-50">
                    <p className="text-xs text-gray-600 mb-2">Preview:</p>
                    <img src={content.workflowImage} alt="Workflow" className="w-full h-32 object-contain rounded" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Contact Section */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-4">{t('gss_lp_contact')}</h4>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Contact Title</label>
            <input type="text" value={content.contactTitle} onChange={(e) => setContent(prev => ({ ...prev, contactTitle: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Contact Description</label>
            <MarkdownEditor
              value={content.contactDescription}
              onChange={(val) => setContent(prev => ({ ...prev, contactDescription: val }))}
              rows={3}
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-900">Contact Emails</label>
              <button onClick={handleAddContactEmail} className="text-xs text-blue-600 hover:text-blue-700">+ Add Email</button>
            </div>
            <div className="space-y-2">
              {content.contactEmails.map((email, idx) => (
                <div key={idx} className="flex gap-2">
                  <input type="email" value={email} onChange={(e) => handleContactEmailChange(idx, e.target.value)} placeholder="email@example.com" className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" />
                  <button onClick={() => handleRemoveContactEmail(idx)} className="px-3 py-2 text-red-600 hover:bg-red-50 rounded" title="Remove">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Contact Phone</label>
            <input type="tel" value={content.contactPhone} onChange={(e) => setContent(prev => ({ ...prev, contactPhone: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none" />
          </div>
          <div className="border-t pt-4">
            <label className="block text-sm font-medium text-gray-900 mb-2">Section Image</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                {content.contactImage && (
                  <div className="mb-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                    ✓ Image uploaded (see preview)
                  </div>
                )}
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={(e) => handleSectionImageUpload('contactImage', e)} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none file:mr-2 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                <p className="text-xs text-gray-500 mt-1">{maxLpImageHint}</p>
                {content.contactImage && (
                  <button 
                    onClick={() => setContent(prev => ({ ...prev, contactImage: null }))} 
                    className="mt-2 w-full px-3 py-2 text-sm text-red-600 bg-red-50 hover:bg-red-100 rounded-lg"
                  >
                    Remove Image
                  </button>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-2">Image Position</label>
                <select 
                  value={content.contactImagePosition} 
                  onChange={(e) => setContent(prev => ({ ...prev, contactImagePosition: e.target.value }))} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none bg-white"
                >
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                  <option value="top">Top</option>
                  <option value="bottom">Bottom</option>
                </select>
                {content.contactImage && (
                  <div className="mt-2 border rounded-lg p-2 bg-gray-50">
                    <p className="text-xs text-gray-600 mb-2">Preview:</p>
                    <img src={content.contactImage} alt="Contact" className="w-full h-32 object-contain rounded" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Section */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-4">{t('gss_lp_footer')}</h4>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Copyright Text</label>
            <input type="text" value={content.copyrightText} onChange={(e) => setContent(prev => ({ ...prev, copyrightText: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-900">Footer Links</label>
              <button onClick={handleAddFooterLink} className="text-xs text-blue-600 hover:text-blue-700">+ Add Link</button>
            </div>
            <div className="space-y-3">
              {content.footerLinks.map((link, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                  <div className="flex gap-2 mb-2">
                    <input type="text" value={link.label} onChange={(e) => handleFooterLinkChange(idx, 'label', e.target.value)} placeholder="Link Label" className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" />
                    <button onClick={() => handleRemoveFooterLink(idx)} className="px-3 py-2 text-red-600 hover:bg-red-50 rounded" title="Remove">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div>
                    {link.pdf && (
                      <div className="mb-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                        ✓ PDF uploaded
                      </div>
                    )}
                    {typeof maxUploadMB === 'number' && Number.isFinite(maxUploadMB) && (
                      <div className="mb-2 text-xs text-gray-600">Max upload size: {maxUploadMB}MB</div>
                    )}
                    <input 
                      type="file" 
                      accept="application/pdf" 
                      onChange={(e) => handleFooterPdfUpload(idx, e)} 
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none file:mr-2 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                    {link.pdf && (
                      <button 
                        onClick={() => handleFooterLinkChange(idx, 'pdf', null)} 
                        className="mt-2 w-full px-3 py-2 text-sm text-red-600 bg-red-50 hover:bg-red-100 rounded-lg"
                      >
                        Remove PDF
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-between pt-4">
        <button onClick={handlePreview} className="px-6 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
          {t('gss_lp_preview')}
        </button>
        <button onClick={handleSave} className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
          {t('gss_save_changes')}
        </button>
      </div>
    </div>
  )
}

// Tab 3: Theme & Branding
const ThemeBranding = () => {
  const { t } = usePreferences()
  const [theme, setTheme] = useState({
    // Basic Colors
    primaryColor: '#0f6fcf',
    secondaryColor: '#10B981',
    accentColor: '#F59E0B',
    sidebarBgColor: '#ffffff',
    sidebarTextColor: '#374151',
    mainBgColor: '#f9fafb',
    tabTextColor: '#6b7280',
    tabActiveColor: '#0f6fcf',
    
    // Extended Color Palette
    successColor: '#10B981',
    warningColor: '#F59E0B',
    errorColor: '#EF4444',
    infoColor: '#3B82F6',
    textPrimary: '#111827',
    textSecondary: '#6B7280',
    textMuted: '#9CA3AF',
    textDisabled: '#D1D5DB',
    borderLight: '#E5E7EB',
    borderMedium: '#D1D5DB',
    borderDark: '#9CA3AF',
    bgCard: '#FFFFFF',
    bgPanel: '#F9FAFB',
    bgHover: '#F3F4F6',
    bgSelected: '#DBEAFE',
    
    // Typography
    fontFamily: 'Inter',
    fontSizeH1: '2.25rem',
    fontSizeH2: '1.875rem',
    fontSizeH3: '1.5rem',
    fontSizeH4: '1.25rem',
    fontSizeH5: '1.125rem',
    fontSizeH6: '1rem',
    fontSizeBody: '1rem',
    fontSizeSmall: '0.875rem',
    fontSizeLabel: '0.875rem',
    fontWeightLight: '300',
    fontWeightNormal: '400',
    fontWeightMedium: '500',
    fontWeightSemibold: '600',
    fontWeightBold: '700',
    lineHeightTight: '1.25',
    lineHeightNormal: '1.5',
    lineHeightRelaxed: '1.75',
    letterSpacingTight: '-0.025em',
    letterSpacingNormal: '0',
    letterSpacingWide: '0.025em',
    
    // Spacing & Sizing
    spacingScale: 'normal', // compact, normal, comfortable, spacious
    buttonPaddingX: '1rem',
    buttonPaddingY: '0.5rem',
    cardPadding: '1.5rem',
    borderRadiusSmall: '0.375rem',
    borderRadiusMedium: '0.5rem',
    borderRadiusLarge: '0.75rem',
    borderRadiusFull: '9999px',
    inputHeight: '2.5rem',
    
    // Button Styles
    btnPrimaryBg: '#0f6fcf',
    btnPrimaryText: '#FFFFFF',
    btnPrimaryHover: '#0b57a8',
    btnSecondaryBg: '#F3F4F6',
    btnSecondaryText: '#374151',
    btnSecondaryHover: '#E5E7EB',
    btnDangerBg: '#EF4444',
    btnDangerText: '#FFFFFF',
    btnDangerHover: '#DC2626',
    buttonBorderRadius: '0.5rem',
    buttonShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    
    // Effects & Shadows
    cardShadow: '0 8px 20px rgba(21,25,40,0.06)',
    focusRingColor: '#3B82F6',
    focusRingWidth: '2px',
    hoverOpacity: '0.9',
    transitionSpeed: '150ms',
    
    // Content Formatting
    tableRowHeight: '3rem',
    tableHeaderBg: '#F9FAFB',
    tableHeaderText: '#6B7280',
    badgePaddingX: '0.625rem',
    badgePaddingY: '0.25rem',
    modalBackdropOpacity: '0.5',
    dropdownShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    
    // Layout
    sidebarPosition: 'left',
    sidebarWidth: '240px',
    mainLogo: null,
    favicon: null,
    bgImage: null,
    
    // Landing Page Colors
    landingNavBg: '#0f6fcf',
    landingNavText: '#FFFFFF',
    landingHeroGradientStart: '#2563EB',
    landingHeroGradientMid: '#3B82F6',
    landingHeroGradientEnd: '#06B6D4',
    landingHeroText: '#FFFFFF',
    landingButtonPrimary: '#FFFFFF',
    landingButtonPrimaryText: '#2563EB',
    landingButtonSecondary: 'transparent',
    landingButtonSecondaryText: '#FFFFFF',
    landingAboutBg: '#F9FAFB',
    landingCoreFeaturesBg: '#F9FAFB',
    landingSystemFeaturesBg: 'linear-gradient(to bottom right, #EFF6FF, #FAF5FF)',
    landingRolesBg: 'linear-gradient(to bottom right, #ECFEFF, #EFF6FF, #FAF5FF)',
    landingWorkflowBg: 'linear-gradient(to bottom right, #F8FAFC, #EFF6FF)',
    landingContactBg: '#F3F4F6',
    
    // Login Page Colors
    loginBgGradientStart: '#F9FAFB',
    loginBgGradientEnd: '#DBEAFE',
    loginCardBg: '#FFFFFF',
    loginCardShadow: '0 8px 20px rgba(21,25,40,0.1)',
    loginButtonBg: '#0f6fcf',
    loginButtonText: '#FFFFFF',
    loginButtonHover: '#0b57a8',
    loginAccentBg: '#DBEAFE',
    loginAccentIcon: '#0f6fcf',
    
    // Login Page Text
    loginWelcomeMessage: 'Welcome to {companyName}'
  })
  const [originalTheme, setOriginalTheme] = useState(null)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [logoPreview, setLogoPreview] = useState(null)
  const [faviconPreview, setFaviconPreview] = useState(null)
  const [bgImagePreview, setBgImagePreview] = useState(null)
  const logoInputRef = useRef(null)
  const faviconInputRef = useRef(null)
  const bgImageInputRef = useRef(null)

  useEffect(() => {
    // Load saved theme or get current CSS variables
    let mounted = true

    const applyLoadedTheme = (savedTheme) => {
      setTheme(savedTheme)
      setOriginalTheme(savedTheme)
      applyTheme(savedTheme)
      if (savedTheme.mainLogo) setLogoPreview(savedTheme.mainLogo)
      if (savedTheme.favicon) setFaviconPreview(savedTheme.favicon)
      if (savedTheme.bgImage) setBgImagePreview(savedTheme.bgImage)
    }

    const load = async () => {
      try {
        const res = await api.get('/system/config/theme-settings')
        const savedTheme = res.data?.data?.theme
        if (savedTheme && typeof savedTheme === 'object') {
          try {
            localStorage.setItem('dms_theme_settings', JSON.stringify(savedTheme))
            window.dispatchEvent(new Event('brandingUpdated'))
          } catch {}
          if (!mounted) return
          applyLoadedTheme(savedTheme)
          return
        }
      } catch {}

      const saved = localStorage.getItem('dms_theme_settings')
      if (saved) {
        try {
          const savedTheme = JSON.parse(saved)
          if (!mounted) return
          applyLoadedTheme(savedTheme)
          return
        } catch {}
      }

      const root = document.documentElement
      const currentTheme = {
        primaryColor: getComputedStyle(root).getPropertyValue('--dms-primary').trim() || '#0f6fcf',
        secondaryColor: getComputedStyle(root).getPropertyValue('--dms-secondary').trim() || '#10B981',
        accentColor: getComputedStyle(root).getPropertyValue('--dms-accent').trim() || '#F59E0B',
        sidebarBgColor: getComputedStyle(root).getPropertyValue('--dms-sidebar-bg').trim() || '#ffffff',
        sidebarTextColor: getComputedStyle(root).getPropertyValue('--dms-sidebar-text').trim() || '#374151',
        mainBgColor: getComputedStyle(root).getPropertyValue('--dms-main-bg').trim() || '#f9fafb',
        tabTextColor: getComputedStyle(root).getPropertyValue('--dms-tab-text').trim() || '#6b7280',
        tabActiveColor: getComputedStyle(root).getPropertyValue('--dms-tab-active').trim() || '#0f6fcf',
        fontFamily: 'Inter',
        sidebarPosition: 'left',
        sidebarWidth: '240px',
        mainLogo: null,
        favicon: null,
        bgImage: null
      }
      if (!mounted) return
      setOriginalTheme(currentTheme)
    }

    load()
    return () => {
      mounted = false
    }
  }, [])

  const updateFavicon = (faviconData) => {
    let link = document.querySelector("link[rel~='icon']")
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = faviconData
  }

  const handleLogoUpload = (e, type) => {
    const file = e.target.files[0]
    if (!file) return
    
    console.log(`Uploading ${type}:`, file.name, file.size, 'bytes')
    
    // Validate file size (max 5MB for background, 2MB for others)
    const maxSize = type === 'bgImage' ? 5 * 1024 * 1024 : 2 * 1024 * 1024
    if (file.size > maxSize) {
      alert(`File size must be less than ${type === 'bgImage' ? '5MB' : '2MB'}`)
      return
    }
    
    const reader = new FileReader()
    reader.onloadend = () => {
      const base64String = reader.result
      console.log(`${type} converted to base64, length:`, base64String.length)
      
      if (type === 'logo') {
        setLogoPreview(base64String)
        handleThemeChange('mainLogo', base64String)
      } else if (type === 'favicon') {
        setFaviconPreview(base64String)
        handleThemeChange('favicon', base64String)
        updateFavicon(base64String)
      } else if (type === 'bgImage') {
        setBgImagePreview(base64String)
        handleThemeChange('bgImage', base64String)
        console.log('Background image set, CSS variable should be:', `url('${base64String.substring(0, 50)}...')`)
      }
    }
    reader.onerror = (error) => {
      console.error(`Failed to read ${type}:`, error)
      alert(`Failed to upload ${type}. Please try again.`)
    }
    reader.readAsDataURL(file)
  }

  const handleRemoveLogo = async (type) => {
    const newTheme = { ...theme }
    
    if (type === 'logo') {
      setLogoPreview(null)
      newTheme.mainLogo = null
      // Clear the file input
      if (logoInputRef.current) {
        logoInputRef.current.value = ''
      }
    } else if (type === 'favicon') {
      setFaviconPreview(null)
      newTheme.favicon = null
      // Clear the file input
      if (faviconInputRef.current) {
        faviconInputRef.current.value = ''
      }
      // Reset to default favicon
      const defaultFavicon = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='0.9em' font-size='90'>📄</text></svg>"
      updateFavicon(defaultFavicon)
    } else if (type === 'bgImage') {
      setBgImagePreview(null)
      newTheme.bgImage = null
      // Clear the file input
      if (bgImageInputRef.current) {
        bgImageInputRef.current.value = ''
      }
    }
    
    setTheme(newTheme)
    applyTheme(newTheme)
    // Immediately save the change
    try {
      const res = await api.put('/system/config/theme-settings', newTheme)
      const savedTheme = res.data?.data?.theme || newTheme
      localStorage.setItem('dms_theme_settings', JSON.stringify(savedTheme))
      window.dispatchEvent(new Event('brandingUpdated'))
      setOriginalTheme(savedTheme)
      return
    } catch {}
    localStorage.setItem('dms_theme_settings', JSON.stringify(newTheme))
    window.dispatchEvent(new Event('brandingUpdated'))
    setOriginalTheme(newTheme)
  }

  const handleThemeChange = (key, value) => {
    const newTheme = { ...theme, [key]: value }
    setTheme(newTheme)
    setHasChanges(true)
    applyTheme(newTheme)
    
    // Show confirmation modal after 500ms of no changes
    if (!showConfirmModal) {
      setTimeout(() => {
        setShowConfirmModal(true)
      }, 500)
    }
  }

  const handleKeepChanges = async () => {
    try {
      const res = await api.put('/system/config/theme-settings', theme)
      const savedTheme = res.data?.data?.theme || theme
      localStorage.setItem('dms_theme_settings', JSON.stringify(savedTheme))
      window.dispatchEvent(new Event('brandingUpdated'))
      setOriginalTheme(savedTheme)
      setShowConfirmModal(false)
      setHasChanges(false)
      return
    } catch {}
    localStorage.setItem('dms_theme_settings', JSON.stringify(theme))
    window.dispatchEvent(new Event('brandingUpdated'))
    setOriginalTheme(theme)
    setShowConfirmModal(false)
    setHasChanges(false)
  }

  const handleRevertChanges = () => {
    if (originalTheme) {
      setTheme(originalTheme)
      applyTheme(originalTheme)
    }
    setShowConfirmModal(false)
    setHasChanges(false)
  }

  const handleResetTheme = () => {
    const defaultTheme = {
      // Core Colors
      primaryColor: '#003366',
      secondaryColor: '#0066CC',
      accentColor: '#FF9900',
      successColor: '#28A745',
      warningColor: '#FFC107',
      errorColor: '#DC3545',
      infoColor: '#0066CC',
      
      // Sidebar & Navigation
      sidebarBgColor: '#003366',
      sidebarTextColor: '#E3F2FD',
      mainBgColor: '#F5F7FA',
      tabTextColor: '#64748B',
      tabActiveColor: '#0066CC',
      
      // Extended Color Palette
      textPrimary: '#111827',
      textSecondary: '#6B7280',
      textMuted: '#9CA3AF',
      textDisabled: '#D1D5DB',
      borderLight: '#E5E7EB',
      borderMedium: '#D1D5DB',
      borderDark: '#9CA3AF',
      bgCard: '#FFFFFF',
      bgPanel: '#F9FAFB',
      bgHover: '#F3F4F6',
      bgSelected: '#DBEAFE',
      
      // Buttons
      btnPrimaryBg: '#003366',
      btnPrimaryText: '#FFFFFF',
      btnPrimaryHover: '#002244',
      btnSecondaryBg: '#E3F2FD',
      btnSecondaryText: '#003366',
      btnSecondaryHover: '#BBDEFB',
      btnDangerBg: '#EF4444',
      btnDangerText: '#FFFFFF',
      btnDangerHover: '#DC2626',
      buttonBorderRadius: '0.25rem',
      buttonShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      
      // Effects & Shadows
      cardShadow: '0 8px 20px rgba(21,25,40,0.06)',
      focusRingColor: '#3B82F6',
      focusRingWidth: '2px',
      hoverOpacity: '0.9',
      transitionSpeed: '150ms',
      
      // Content Formatting
      tableRowHeight: '3rem',
      tableHeaderBg: '#F9FAFB',
      tableHeaderText: '#6B7280',
      badgePaddingX: '0.625rem',
      badgePaddingY: '0.25rem',
      modalBackdropOpacity: '0.5',
      dropdownShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
      
      // Layout
      sidebarPosition: 'left',
      sidebarWidth: '240px',
      mainLogo: null,
      favicon: null,
      bgImage: null,
      
      // Landing Page
      landingNavBg: '#003366',
      landingNavText: '#FFFFFF',
      landingHeroGradientStart: '#003366',
      landingHeroGradientMid: '#0066CC',
      landingHeroGradientEnd: '#0099FF',
      landingHeroText: '#FFFFFF',
      landingButtonPrimary: '#FF9900',
      landingButtonPrimaryText: '#FFFFFF',
      landingButtonSecondary: 'transparent',
      landingButtonSecondaryText: '#FFFFFF',
      landingAboutBg: '#F5F7FA',
      landingCoreFeaturesBg: '#F5F7FA',
      landingSystemFeaturesBg: 'linear-gradient(to bottom right, #E3F2FD, #F5F7FA)',
      landingRolesBg: 'linear-gradient(to bottom right, #BBDEFB, #E3F2FD, #F5F7FA)',
      landingWorkflowBg: 'linear-gradient(to bottom right, #F5F7FA, #E3F2FD)',
      landingContactBg: '#E3F2FD',
      
      // Login Page
      loginBgGradientStart: '#F5F7FA',
      loginBgGradientEnd: '#E3F2FD',
      loginCardBg: '#FFFFFF',
      loginCardShadow: '0 8px 20px rgba(21,25,40,0.1)',
      loginButtonBg: '#003366',
      loginButtonText: '#FFFFFF',
      loginButtonHover: '#002244',
      loginAccentBg: '#E3F2FD',
      loginAccentIcon: '#0066CC',
      
      // Login Page Text
      loginWelcomeMessage: 'Welcome to {companyName}',
      
      // Typography
      fontFamily: 'Roboto',
      fontSizeH1: '2.25rem',
      fontSizeH2: '1.875rem',
      fontSizeH3: '1.5rem',
      fontSizeH4: '1.25rem',
      fontSizeH5: '1.125rem',
      fontSizeH6: '1rem',
      fontSizeBody: '1rem',
      fontSizeSmall: '0.875rem',
      fontSizeLabel: '0.875rem',
      fontWeightLight: '300',
      fontWeightNormal: '400',
      fontWeightMedium: '500',
      fontWeightSemibold: '600',
      fontWeightBold: '700',
      lineHeightTight: '1.25',
      lineHeightNormal: '1.5',
      lineHeightRelaxed: '1.75',
      letterSpacingTight: '-0.025em',
      letterSpacingNormal: '0',
      letterSpacingWide: '0.025em',
      
      // Spacing & Sizing
      spacingScale: 'normal',
      buttonPaddingX: '1rem',
      buttonPaddingY: '0.5rem',
      cardPadding: '1.5rem',
      borderRadiusSmall: '0.125rem',
      borderRadiusMedium: '0.25rem',
      borderRadiusLarge: '0.5rem',
      borderRadiusFull: '9999px',
      inputHeight: '2.5rem'
    }
    setTheme(defaultTheme)
    applyTheme(defaultTheme)
    setHasChanges(true)
    setTimeout(() => setShowConfirmModal(true), 500)
  }

  const applyPreset = (presetName) => {
    const presets = {
      default: {
        // Core Colors
        primaryColor: '#0f6fcf',
        secondaryColor: '#10B981',
        accentColor: '#F59E0B',
        successColor: '#10B981',
        warningColor: '#F59E0B',
        errorColor: '#EF4444',
        infoColor: '#3B82F6',
        
        // Sidebar & Navigation
        sidebarBgColor: '#1E293B',
        sidebarTextColor: '#F1F5F9',
        mainBgColor: '#F9FAFB',
        tabTextColor: '#6B7280',
        tabActiveColor: '#1D60DE',
        
        // Buttons
        btnPrimaryBg: '#0f6fcf',
        btnPrimaryText: '#FFFFFF',
        btnPrimaryHover: '#0b57a8',
        btnSecondaryBg: '#F3F4F6',
        btnSecondaryText: '#374151',
        btnSecondaryHover: '#E5E7EB',
        
        // Landing Page
        landingNavBg: '#0f6fcf',
        landingNavText: '#FFFFFF',
        landingHeroGradientStart: '#2563EB',
        landingHeroGradientMid: '#3B82F6',
        landingHeroGradientEnd: '#06B6D4',
        landingHeroText: '#FFFFFF',
        landingButtonPrimary: '#FFFFFF',
        landingButtonPrimaryText: '#2563EB',
        landingButtonSecondary: 'transparent',
        landingButtonSecondaryText: '#FFFFFF',
        landingAboutBg: '#F9FAFB',
        landingCoreFeaturesBg: '#F9FAFB',
        landingSystemFeaturesBg: 'linear-gradient(to bottom right, #EFF6FF, #FAF5FF)',
        landingRolesBg: 'linear-gradient(to bottom right, #ECFEFF, #EFF6FF, #FAF5FF)',
        landingWorkflowBg: 'linear-gradient(to bottom right, #F8FAFC, #EFF6FF)',
        landingContactBg: '#F3F4F6',
        
        // Login Page
        loginBgGradientStart: '#F9FAFB',
        loginBgGradientEnd: '#DBEAFE',
        loginCardBg: '#FFFFFF',
        loginButtonBg: '#0f6fcf',
        loginButtonText: '#FFFFFF',
        loginButtonHover: '#0b57a8',
        loginAccentBg: '#DBEAFE',
        loginAccentIcon: '#0f6fcf',
        
        // Typography & Spacing
        fontFamily: 'Inter',
        borderRadiusMedium: '0.5rem',
        spacingScale: 'normal'
      },
      corporate: {
        // Core Colors
        primaryColor: '#003366',
        secondaryColor: '#0066CC',
        accentColor: '#FF9900',
        successColor: '#28A745',
        warningColor: '#FFC107',
        errorColor: '#DC3545',
        infoColor: '#0066CC',
        
        // Sidebar & Navigation
        sidebarBgColor: '#003366',
        sidebarTextColor: '#E3F2FD',
        mainBgColor: '#F5F7FA',
        tabTextColor: '#64748B',
        tabActiveColor: '#0066CC',
        
        // Buttons
        btnPrimaryBg: '#003366',
        btnPrimaryText: '#FFFFFF',
        btnPrimaryHover: '#002244',
        btnSecondaryBg: '#E3F2FD',
        btnSecondaryText: '#003366',
        btnSecondaryHover: '#BBDEFB',
        
        // Landing Page
        landingNavBg: '#003366',
        landingNavText: '#FFFFFF',
        landingHeroGradientStart: '#003366',
        landingHeroGradientMid: '#0066CC',
        landingHeroGradientEnd: '#0099FF',
        landingHeroText: '#FFFFFF',
        landingButtonPrimary: '#FF9900',
        landingButtonPrimaryText: '#FFFFFF',
        landingButtonSecondary: 'transparent',
        landingButtonSecondaryText: '#FFFFFF',
        landingAboutBg: '#F5F7FA',
        landingCoreFeaturesBg: '#F5F7FA',
        landingSystemFeaturesBg: 'linear-gradient(to bottom right, #E3F2FD, #F5F7FA)',
        landingRolesBg: 'linear-gradient(to bottom right, #BBDEFB, #E3F2FD, #F5F7FA)',
        landingWorkflowBg: 'linear-gradient(to bottom right, #F5F7FA, #E3F2FD)',
        landingContactBg: '#E3F2FD',
        
        // Login Page
        loginBgGradientStart: '#F5F7FA',
        loginBgGradientEnd: '#E3F2FD',
        loginCardBg: '#FFFFFF',
        loginButtonBg: '#003366',
        loginButtonText: '#FFFFFF',
        loginButtonHover: '#002244',
        loginAccentBg: '#E3F2FD',
        loginAccentIcon: '#0066CC',
        
        // Typography & Spacing
        fontFamily: 'Roboto',
        borderRadiusMedium: '0.25rem',
        spacingScale: 'normal'
      },
      modern: {
        // Core Colors
        primaryColor: '#6366F1',
        secondaryColor: '#8B5CF6',
        accentColor: '#EC4899',
        successColor: '#10B981',
        warningColor: '#F59E0B',
        errorColor: '#EF4444',
        infoColor: '#6366F1',
        
        // Sidebar & Navigation
        sidebarBgColor: '#4F46E5',
        sidebarTextColor: '#EDE9FE',
        mainBgColor: '#F8FAFC',
        tabTextColor: '#64748B',
        tabActiveColor: '#6366F1',
        
        // Buttons
        btnPrimaryBg: '#6366F1',
        btnPrimaryText: '#FFFFFF',
        btnPrimaryHover: '#4F46E5',
        btnSecondaryBg: '#EDE9FE',
        btnSecondaryText: '#6366F1',
        btnSecondaryHover: '#DDD6FE',
        
        // Landing Page
        landingNavBg: '#6366F1',
        landingNavText: '#FFFFFF',
        landingHeroGradientStart: '#6366F1',
        landingHeroGradientMid: '#8B5CF6',
        landingHeroGradientEnd: '#EC4899',
        landingHeroText: '#FFFFFF',
        landingButtonPrimary: '#FFFFFF',
        landingButtonPrimaryText: '#6366F1',
        landingButtonSecondary: 'transparent',
        landingButtonSecondaryText: '#FFFFFF',
        landingAboutBg: '#F8FAFC',
        landingCoreFeaturesBg: '#F8FAFC',
        landingSystemFeaturesBg: 'linear-gradient(to bottom right, #EDE9FE, #FCE7F3)',
        landingRolesBg: 'linear-gradient(to bottom right, #DDD6FE, #EDE9FE, #FCE7F3)',
        landingWorkflowBg: 'linear-gradient(to bottom right, #F8FAFC, #EDE9FE)',
        landingContactBg: '#EDE9FE',
        
        // Login Page
        loginBgGradientStart: '#F8FAFC',
        loginBgGradientEnd: '#EDE9FE',
        loginCardBg: '#FFFFFF',
        loginButtonBg: '#6366F1',
        loginButtonText: '#FFFFFF',
        loginButtonHover: '#4F46E5',
        loginAccentBg: '#EDE9FE',
        loginAccentIcon: '#6366F1',
        
        // Typography & Spacing
        fontFamily: 'Inter',
        borderRadiusMedium: '0.75rem',
        spacingScale: 'comfortable'
      },
      minimal: {
        // Core Colors
        primaryColor: '#000000',
        secondaryColor: '#666666',
        accentColor: '#999999',
        successColor: '#4CAF50',
        warningColor: '#FFA000',
        errorColor: '#F44336',
        infoColor: '#666666',
        
        // Sidebar & Navigation
        sidebarBgColor: '#000000',
        sidebarTextColor: '#FFFFFF',
        mainBgColor: '#FFFFFF',
        tabTextColor: '#666666',
        tabActiveColor: '#000000',
        
        // Buttons
        btnPrimaryBg: '#000000',
        btnPrimaryText: '#FFFFFF',
        btnPrimaryHover: '#333333',
        btnSecondaryBg: '#F5F5F5',
        btnSecondaryText: '#000000',
        btnSecondaryHover: '#E0E0E0',
        
        // Landing Page
        landingNavBg: '#000000',
        landingNavText: '#FFFFFF',
        landingHeroGradientStart: '#000000',
        landingHeroGradientMid: '#333333',
        landingHeroGradientEnd: '#666666',
        landingHeroText: '#FFFFFF',
        landingButtonPrimary: '#FFFFFF',
        landingButtonPrimaryText: '#000000',
        landingButtonSecondary: 'transparent',
        landingButtonSecondaryText: '#FFFFFF',
        landingAboutBg: '#FFFFFF',
        landingCoreFeaturesBg: '#FAFAFA',
        landingSystemFeaturesBg: '#F5F5F5',
        landingRolesBg: '#FAFAFA',
        landingWorkflowBg: '#F5F5F5',
        landingContactBg: '#EEEEEE',
        
        // Login Page
        loginBgGradientStart: '#FFFFFF',
        loginBgGradientEnd: '#F5F5F5',
        loginCardBg: '#FFFFFF',
        loginButtonBg: '#000000',
        loginButtonText: '#FFFFFF',
        loginButtonHover: '#333333',
        loginAccentBg: '#F5F5F5',
        loginAccentIcon: '#000000',
        
        // Typography & Spacing
        fontFamily: 'Helvetica',
        borderRadiusMedium: '0',
        spacingScale: 'compact'
      },
      vibrant: {
        // Core Colors
        primaryColor: '#FF6B6B',
        secondaryColor: '#4ECDC4',
        accentColor: '#FFE66D',
        successColor: '#95E1D3',
        warningColor: '#FFA07A',
        errorColor: '#FF6B9D',
        infoColor: '#4ECDC4',
        
        // Sidebar & Navigation
        sidebarBgColor: '#FF6B6B',
        sidebarTextColor: '#FFFFFF',
        mainBgColor: '#FFFBF5',
        tabTextColor: '#9CA3AF',
        tabActiveColor: '#FF6B6B',
        
        // Buttons
        btnPrimaryBg: '#FF6B6B',
        btnPrimaryText: '#FFFFFF',
        btnPrimaryHover: '#FF5252',
        btnSecondaryBg: '#FFE5E5',
        btnSecondaryText: '#FF6B6B',
        btnSecondaryHover: '#FFCCCC',
        
        // Landing Page
        landingNavBg: '#FF6B6B',
        landingNavText: '#FFFFFF',
        landingHeroGradientStart: '#FF6B6B',
        landingHeroGradientMid: '#4ECDC4',
        landingHeroGradientEnd: '#FFE66D',
        landingHeroText: '#FFFFFF',
        landingButtonPrimary: '#FFFFFF',
        landingButtonPrimaryText: '#FF6B6B',
        landingButtonSecondary: 'transparent',
        landingButtonSecondaryText: '#FFFFFF',
        landingAboutBg: '#FFFBF5',
        landingCoreFeaturesBg: '#FFF5E5',
        landingSystemFeaturesBg: 'linear-gradient(to bottom right, #FFE5E5, #E5F5F5)',
        landingRolesBg: 'linear-gradient(to bottom right, #FFFACD, #FFE5E5, #E5F5F5)',
        landingWorkflowBg: 'linear-gradient(to bottom right, #FFFBF5, #E5F5F5)',
        landingContactBg: '#FFE5E5',
        
        // Login Page
        loginBgGradientStart: '#FFFBF5',
        loginBgGradientEnd: '#FFE5E5',
        loginCardBg: '#FFFFFF',
        loginButtonBg: '#FF6B6B',
        loginButtonText: '#FFFFFF',
        loginButtonHover: '#FF5252',
        loginAccentBg: '#FFE5E5',
        loginAccentIcon: '#FF6B6B',
        
        // Typography & Spacing
        fontFamily: 'Poppins',
        borderRadiusMedium: '1rem',
        spacingScale: 'spacious'
      },
      ocean: {
        // Core Colors
        primaryColor: '#006994',
        secondaryColor: '#00A9CE',
        accentColor: '#0DCEDA',
        successColor: '#06B6D4',
        warningColor: '#F59E0B',
        errorColor: '#EF4444',
        infoColor: '#00A9CE',
        
        // Sidebar & Navigation
        sidebarBgColor: '#006994',
        sidebarTextColor: '#E0F2FE',
        mainBgColor: '#F0F9FF',
        tabTextColor: '#64748B',
        tabActiveColor: '#00A9CE',
        
        // Buttons
        btnPrimaryBg: '#006994',
        btnPrimaryText: '#FFFFFF',
        btnPrimaryHover: '#004F6D',
        btnSecondaryBg: '#E0F2FE',
        btnSecondaryText: '#006994',
        btnSecondaryHover: '#BAE6FD',
        
        // Landing Page
        landingNavBg: '#006994',
        landingNavText: '#FFFFFF',
        landingHeroGradientStart: '#006994',
        landingHeroGradientMid: '#00A9CE',
        landingHeroGradientEnd: '#0DCEDA',
        landingHeroText: '#FFFFFF',
        landingButtonPrimary: '#FFFFFF',
        landingButtonPrimaryText: '#006994',
        landingButtonSecondary: 'transparent',
        landingButtonSecondaryText: '#FFFFFF',
        landingAboutBg: '#F0F9FF',
        landingCoreFeaturesBg: '#F0F9FF',
        landingSystemFeaturesBg: 'linear-gradient(to bottom right, #E0F2FE, #CFFAFE)',
        landingRolesBg: 'linear-gradient(to bottom right, #BAE6FD, #E0F2FE, #CFFAFE)',
        landingWorkflowBg: 'linear-gradient(to bottom right, #F0F9FF, #E0F2FE)',
        landingContactBg: '#E0F2FE',
        
        // Login Page
        loginBgGradientStart: '#F0F9FF',
        loginBgGradientEnd: '#E0F2FE',
        loginCardBg: '#FFFFFF',
        loginButtonBg: '#006994',
        loginButtonText: '#FFFFFF',
        loginButtonHover: '#004F6D',
        loginAccentBg: '#E0F2FE',
        loginAccentIcon: '#00A9CE',
        
        // Typography & Spacing
        fontFamily: 'Inter',
        borderRadiusMedium: '0.5rem',
        spacingScale: 'normal'
      },
      forest: {
        // Core Colors
        primaryColor: '#065F46',
        secondaryColor: '#059669',
        accentColor: '#10B981',
        successColor: '#10B981',
        warningColor: '#F59E0B',
        errorColor: '#DC2626',
        infoColor: '#059669',
        
        // Sidebar & Navigation
        sidebarBgColor: '#065F46',
        sidebarTextColor: '#D1FAE5',
        mainBgColor: '#F0FDF4',
        tabTextColor: '#64748B',
        tabActiveColor: '#059669',
        
        // Buttons
        btnPrimaryBg: '#065F46',
        btnPrimaryText: '#FFFFFF',
        btnPrimaryHover: '#064E3B',
        btnSecondaryBg: '#D1FAE5',
        btnSecondaryText: '#065F46',
        btnSecondaryHover: '#A7F3D0',
        
        // Landing Page
        landingNavBg: '#065F46',
        landingNavText: '#FFFFFF',
        landingHeroGradientStart: '#065F46',
        landingHeroGradientMid: '#059669',
        landingHeroGradientEnd: '#10B981',
        landingHeroText: '#FFFFFF',
        landingButtonPrimary: '#FFFFFF',
        landingButtonPrimaryText: '#065F46',
        landingButtonSecondary: 'transparent',
        landingButtonSecondaryText: '#FFFFFF',
        landingAboutBg: '#F0FDF4',
        landingCoreFeaturesBg: '#F0FDF4',
        landingSystemFeaturesBg: 'linear-gradient(to bottom right, #D1FAE5, #ECFDF5)',
        landingRolesBg: 'linear-gradient(to bottom right, #A7F3D0, #D1FAE5, #ECFDF5)',
        landingWorkflowBg: 'linear-gradient(to bottom right, #F0FDF4, #D1FAE5)',
        landingContactBg: '#D1FAE5',
        
        // Login Page
        loginBgGradientStart: '#F0FDF4',
        loginBgGradientEnd: '#D1FAE5',
        loginCardBg: '#FFFFFF',
        loginButtonBg: '#065F46',
        loginButtonText: '#FFFFFF',
        loginButtonHover: '#064E3B',
        loginAccentBg: '#D1FAE5',
        loginAccentIcon: '#059669',
        
        // Typography & Spacing
        fontFamily: 'Inter',
        borderRadiusMedium: '0.5rem',
        spacingScale: 'normal'
      },
      sunset: {
        // Core Colors
        primaryColor: '#C2410C',
        secondaryColor: '#EA580C',
        accentColor: '#FB923C',
        successColor: '#10B981',
        warningColor: '#FBBF24',
        errorColor: '#DC2626',
        infoColor: '#EA580C',
        
        // Sidebar & Navigation
        sidebarBgColor: '#C2410C',
        sidebarTextColor: '#FFEDD5',
        mainBgColor: '#FFF7ED',
        tabTextColor: '#64748B',
        tabActiveColor: '#EA580C',
        
        // Buttons
        btnPrimaryBg: '#C2410C',
        btnPrimaryText: '#FFFFFF',
        btnPrimaryHover: '#9A3412',
        btnSecondaryBg: '#FFEDD5',
        btnSecondaryText: '#C2410C',
        btnSecondaryHover: '#FED7AA',
        
        // Landing Page
        landingNavBg: '#C2410C',
        landingNavText: '#FFFFFF',
        landingHeroGradientStart: '#C2410C',
        landingHeroGradientMid: '#EA580C',
        landingHeroGradientEnd: '#FB923C',
        landingHeroText: '#FFFFFF',
        landingButtonPrimary: '#FFFFFF',
        landingButtonPrimaryText: '#C2410C',
        landingButtonSecondary: 'transparent',
        landingButtonSecondaryText: '#FFFFFF',
        landingAboutBg: '#FFF7ED',
        landingCoreFeaturesBg: '#FFF7ED',
        landingSystemFeaturesBg: 'linear-gradient(to bottom right, #FFEDD5, #FEF3C7)',
        landingRolesBg: 'linear-gradient(to bottom right, #FED7AA, #FFEDD5, #FEF3C7)',
        landingWorkflowBg: 'linear-gradient(to bottom right, #FFF7ED, #FFEDD5)',
        landingContactBg: '#FFEDD5',
        
        // Login Page
        loginBgGradientStart: '#FFF7ED',
        loginBgGradientEnd: '#FFEDD5',
        loginCardBg: '#FFFFFF',
        loginButtonBg: '#C2410C',
        loginButtonText: '#FFFFFF',
        loginButtonHover: '#9A3412',
        loginAccentBg: '#FFEDD5',
        loginAccentIcon: '#EA580C',
        
        // Typography & Spacing
        fontFamily: 'Inter',
        borderRadiusMedium: '0.5rem',
        spacingScale: 'normal'
      },
      midnight: {
        // Core Colors
        primaryColor: '#1E293B',
        secondaryColor: '#334155',
        accentColor: '#60A5FA',
        successColor: '#10B981',
        warningColor: '#F59E0B',
        errorColor: '#EF4444',
        infoColor: '#60A5FA',
        
        // Sidebar & Navigation
        sidebarBgColor: '#1E293B',
        sidebarTextColor: '#F1F5F9',
        mainBgColor: '#F8FAFC',
        tabTextColor: '#64748B',
        tabActiveColor: '#334155',
        
        // Buttons
        btnPrimaryBg: '#1E293B',
        btnPrimaryText: '#FFFFFF',
        btnPrimaryHover: '#0F172A',
        btnSecondaryBg: '#F1F5F9',
        btnSecondaryText: '#1E293B',
        btnSecondaryHover: '#E2E8F0',
        
        // Landing Page
        landingNavBg: '#1E293B',
        landingNavText: '#FFFFFF',
        landingHeroGradientStart: '#1E293B',
        landingHeroGradientMid: '#334155',
        landingHeroGradientEnd: '#60A5FA',
        landingHeroText: '#FFFFFF',
        landingButtonPrimary: '#FFFFFF',
        landingButtonPrimaryText: '#1E293B',
        landingButtonSecondary: 'transparent',
        landingButtonSecondaryText: '#FFFFFF',
        landingAboutBg: '#F8FAFC',
        landingCoreFeaturesBg: '#F8FAFC',
        landingSystemFeaturesBg: 'linear-gradient(to bottom right, #F1F5F9, #E2E8F0)',
        landingRolesBg: 'linear-gradient(to bottom right, #CBD5E1, #F1F5F9, #E2E8F0)',
        landingWorkflowBg: 'linear-gradient(to bottom right, #F8FAFC, #F1F5F9)',
        landingContactBg: '#F1F5F9',
        
        // Login Page
        loginBgGradientStart: '#F8FAFC',
        loginBgGradientEnd: '#F1F5F9',
        loginCardBg: '#FFFFFF',
        loginButtonBg: '#1E293B',
        loginButtonText: '#FFFFFF',
        loginButtonHover: '#0F172A',
        loginAccentBg: '#F1F5F9',
        loginAccentIcon: '#334155',
        
        // Typography & Spacing
        fontFamily: 'Inter',
        borderRadiusMedium: '0.5rem',
        spacingScale: 'normal'
      },
      rose: {
        // Core Colors
        primaryColor: '#BE123C',
        secondaryColor: '#E11D48',
        accentColor: '#FB7185',
        successColor: '#10B981',
        warningColor: '#F59E0B',
        errorColor: '#DC2626',
        infoColor: '#E11D48',
        
        // Sidebar & Navigation
        sidebarBgColor: '#BE123C',
        sidebarTextColor: '#FFE4E6',
        mainBgColor: '#FFF1F2',
        tabTextColor: '#64748B',
        tabActiveColor: '#E11D48',
        
        // Buttons
        btnPrimaryBg: '#BE123C',
        btnPrimaryText: '#FFFFFF',
        btnPrimaryHover: '#9F1239',
        btnSecondaryBg: '#FFE4E6',
        btnSecondaryText: '#BE123C',
        btnSecondaryHover: '#FECDD3',
        
        // Landing Page
        landingNavBg: '#BE123C',
        landingNavText: '#FFFFFF',
        landingHeroGradientStart: '#BE123C',
        landingHeroGradientMid: '#E11D48',
        landingHeroGradientEnd: '#FB7185',
        landingHeroText: '#FFFFFF',
        landingButtonPrimary: '#FFFFFF',
        landingButtonPrimaryText: '#BE123C',
        landingButtonSecondary: 'transparent',
        landingButtonSecondaryText: '#FFFFFF',
        landingAboutBg: '#FFF1F2',
        landingCoreFeaturesBg: '#FFF1F2',
        landingSystemFeaturesBg: 'linear-gradient(to bottom right, #FFE4E6, #FECDD3)',
        landingRolesBg: 'linear-gradient(to bottom right, #FECDD3, #FFE4E6, #FFF1F2)',
        landingWorkflowBg: 'linear-gradient(to bottom right, #FFF1F2, #FFE4E6)',
        landingContactBg: '#FFE4E6',
        
        // Login Page
        loginBgGradientStart: '#FFF1F2',
        loginBgGradientEnd: '#FFE4E6',
        loginCardBg: '#FFFFFF',
        loginButtonBg: '#BE123C',
        loginButtonText: '#FFFFFF',
        loginButtonHover: '#9F1239',
        loginAccentBg: '#FFE4E6',
        loginAccentIcon: '#E11D48',
        
        // Typography & Spacing
        fontFamily: 'Inter',
        borderRadiusMedium: '0.5rem',
        spacingScale: 'normal'
      },
      lavender: {
        // Core Colors
        primaryColor: '#7C3AED',
        secondaryColor: '#A78BFA',
        accentColor: '#C4B5FD',
        successColor: '#10B981',
        warningColor: '#F59E0B',
        errorColor: '#EF4444',
        infoColor: '#A78BFA',
        
        // Sidebar & Navigation
        sidebarBgColor: '#7C3AED',
        sidebarTextColor: '#EDE9FE',
        mainBgColor: '#FAF5FF',
        tabTextColor: '#64748B',
        tabActiveColor: '#A78BFA',
        
        // Buttons
        btnPrimaryBg: '#7C3AED',
        btnPrimaryText: '#FFFFFF',
        btnPrimaryHover: '#6D28D9',
        btnSecondaryBg: '#EDE9FE',
        btnSecondaryText: '#7C3AED',
        btnSecondaryHover: '#DDD6FE',
        
        // Landing Page
        landingNavBg: '#7C3AED',
        landingNavText: '#FFFFFF',
        landingHeroGradientStart: '#7C3AED',
        landingHeroGradientMid: '#A78BFA',
        landingHeroGradientEnd: '#C4B5FD',
        landingHeroText: '#FFFFFF',
        landingButtonPrimary: '#FFFFFF',
        landingButtonPrimaryText: '#7C3AED',
        landingButtonSecondary: 'transparent',
        landingButtonSecondaryText: '#FFFFFF',
        landingAboutBg: '#FAF5FF',
        landingCoreFeaturesBg: '#FAF5FF',
        landingSystemFeaturesBg: 'linear-gradient(to bottom right, #EDE9FE, #DDD6FE)',
        landingRolesBg: 'linear-gradient(to bottom right, #C4B5FD, #EDE9FE, #DDD6FE)',
        landingWorkflowBg: 'linear-gradient(to bottom right, #FAF5FF, #EDE9FE)',
        landingContactBg: '#EDE9FE',
        
        // Login Page
        loginBgGradientStart: '#FAF5FF',
        loginBgGradientEnd: '#EDE9FE',
        loginCardBg: '#FFFFFF',
        loginButtonBg: '#7C3AED',
        loginButtonText: '#FFFFFF',
        loginButtonHover: '#6D28D9',
        loginAccentBg: '#EDE9FE',
        loginAccentIcon: '#A78BFA',
        
        // Typography & Spacing
        fontFamily: 'Inter',
        borderRadiusMedium: '0.5rem',
        spacingScale: 'normal'
      },
      amber: {
        // Core Colors
        primaryColor: '#D97706',
        secondaryColor: '#F59E0B',
        accentColor: '#FBBF24',
        successColor: '#10B981',
        warningColor: '#FB923C',
        errorColor: '#DC2626',
        infoColor: '#F59E0B',
        
        // Sidebar & Navigation
        sidebarBgColor: '#D97706',
        sidebarTextColor: '#FEF3C7',
        mainBgColor: '#FFFBEB',
        tabTextColor: '#64748B',
        tabActiveColor: '#F59E0B',
        
        // Buttons
        btnPrimaryBg: '#D97706',
        btnPrimaryText: '#FFFFFF',
        btnPrimaryHover: '#B45309',
        btnSecondaryBg: '#FEF3C7',
        btnSecondaryText: '#D97706',
        btnSecondaryHover: '#FDE68A',
        
        // Landing Page
        landingNavBg: '#D97706',
        landingNavText: '#FFFFFF',
        landingHeroGradientStart: '#D97706',
        landingHeroGradientMid: '#F59E0B',
        landingHeroGradientEnd: '#FBBF24',
        landingHeroText: '#FFFFFF',
        landingButtonPrimary: '#FFFFFF',
        landingButtonPrimaryText: '#D97706',
        landingButtonSecondary: 'transparent',
        landingButtonSecondaryText: '#FFFFFF',
        landingAboutBg: '#FFFBEB',
        landingCoreFeaturesBg: '#FFFBEB',
        landingSystemFeaturesBg: 'linear-gradient(to bottom right, #FEF3C7, #FEF9C3)',
        landingRolesBg: 'linear-gradient(to bottom right, #FDE68A, #FEF3C7, #FEF9C3)',
        landingWorkflowBg: 'linear-gradient(to bottom right, #FFFBEB, #FEF3C7)',
        landingContactBg: '#FEF3C7',
        
        // Login Page
        loginBgGradientStart: '#FFFBEB',
        loginBgGradientEnd: '#FEF3C7',
        loginCardBg: '#FFFFFF',
        loginButtonBg: '#D97706',
        loginButtonText: '#FFFFFF',
        loginButtonHover: '#B45309',
        loginAccentBg: '#FEF3C7',
        loginAccentIcon: '#F59E0B',
        
        // Typography & Spacing
        fontFamily: 'Inter',
        borderRadiusMedium: '0.5rem',
        spacingScale: 'normal'
      }
    }

    const selectedPreset = presets[presetName]
    if (selectedPreset) {
      const newTheme = { ...theme, ...selectedPreset }
      setTheme(newTheme)
      applyTheme(newTheme)
      setHasChanges(true)
      setTimeout(() => setShowConfirmModal(true), 500)
    }
  }

  const exportTheme = () => {
    const themeJSON = JSON.stringify(theme, null, 2)
    const blob = new Blob([themeJSON], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `dms-theme-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    alert('Theme exported successfully!')
  }

  const importTheme = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json'
    input.onchange = (e) => {
      const file = e.target.files[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = (event) => {
          try {
            const importedTheme = JSON.parse(event.target.result)
            const newTheme = { ...theme, ...importedTheme }
            setTheme(newTheme)
            applyTheme(newTheme)
            setHasChanges(true)
            setTimeout(() => setShowConfirmModal(true), 500)
            alert('Theme imported successfully!')
          } catch (error) {
            alert('Failed to import theme. Please check the JSON file format.')
          }
        }
        reader.readAsText(file)
      }
    }
    input.click()
  }

  return (
    <div className="space-y-6">
      {/* Confirmation Modal */}
      {showConfirmModal && hasChanges && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[9999]">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-4 sm:p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Keep Theme Changes?</h3>
                <p className="text-sm text-gray-600 mb-4">
                  You've made changes to the theme. Would you like to keep these changes or revert to the previous theme?
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={handleRevertChanges}
                    className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Revert Changes
                  </button>
                  <button
                    onClick={handleKeepChanges}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Keep Changes
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
          </svg>
          <div>
            <h3 className="text-sm font-semibold text-blue-900">Theme & Branding Manager</h3>
            <p className="text-xs text-blue-800 mt-1">Customize colors, logos, and visual identity. Changes apply instantly with a confirmation dialog.</p>
          </div>
        </div>
      </div>

      {/* Quick Theme Presets - Moved to top */}
      <div className="border border-gray-200 rounded-lg p-4 bg-gradient-to-r from-blue-50 to-purple-50">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="font-medium text-gray-900">🎨 Quick Theme Presets</h4>
            <p className="text-xs text-gray-600 mt-1">Start with a pre-designed theme, then customize to your needs</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={exportTheme}
              className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-white border border-blue-200 rounded-lg hover:bg-blue-50"
            >
              📥 Export
            </button>
            <button
              onClick={importTheme}
              className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-white border border-blue-200 rounded-lg hover:bg-blue-50"
            >
              📤 Import
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
          {/* Default */}
          <button
            onClick={() => applyPreset('default')}
            className="group flex flex-col items-center gap-2 p-3 text-center border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:shadow-md transition-all bg-white"
          >
            <div className="flex gap-1">
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#0f6fcf' }}></div>
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#10B981' }}></div>
            </div>
            <span className="text-xs font-medium text-gray-900 group-hover:text-blue-600">Default</span>
          </button>
          
          {/* Corporate */}
          <button
            onClick={() => applyPreset('corporate')}
            className="group flex flex-col items-center gap-2 p-3 text-center border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:shadow-md transition-all bg-white"
          >
            <div className="flex gap-1">
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#003366' }}></div>
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#0066CC' }}></div>
            </div>
            <span className="text-xs font-medium text-gray-900 group-hover:text-blue-600">Corporate</span>
          </button>
          
          {/* Modern */}
          <button
            onClick={() => applyPreset('modern')}
            className="group flex flex-col items-center gap-2 p-3 text-center border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:shadow-md transition-all bg-white"
          >
            <div className="flex gap-1">
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#6366F1' }}></div>
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#8B5CF6' }}></div>
            </div>
            <span className="text-xs font-medium text-gray-900 group-hover:text-blue-600">Modern</span>
          </button>
          
          {/* Minimal */}
          <button
            onClick={() => applyPreset('minimal')}
            className="group flex flex-col items-center gap-2 p-3 text-center border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:shadow-md transition-all bg-white"
          >
            <div className="flex gap-1">
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#000000' }}></div>
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#666666' }}></div>
            </div>
            <span className="text-xs font-medium text-gray-900 group-hover:text-blue-600">Minimal</span>
          </button>
          
          {/* Vibrant */}
          <button
            onClick={() => applyPreset('vibrant')}
            className="group flex flex-col items-center gap-2 p-3 text-center border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:shadow-md transition-all bg-white"
          >
            <div className="flex gap-1">
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#FF6B6B' }}></div>
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#4ECDC4' }}></div>
            </div>
            <span className="text-xs font-medium text-gray-900 group-hover:text-blue-600">Vibrant</span>
          </button>
          
          {/* Ocean */}
          <button
            onClick={() => applyPreset('ocean')}
            className="group flex flex-col items-center gap-2 p-3 text-center border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:shadow-md transition-all bg-white"
          >
            <div className="flex gap-1">
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#006994' }}></div>
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#00A9CE' }}></div>
            </div>
            <span className="text-xs font-medium text-gray-900 group-hover:text-blue-600">Ocean</span>
          </button>
          
          {/* Forest */}
          <button
            onClick={() => applyPreset('forest')}
            className="group flex flex-col items-center gap-2 p-3 text-center border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:shadow-md transition-all bg-white"
          >
            <div className="flex gap-1">
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#065F46' }}></div>
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#059669' }}></div>
            </div>
            <span className="text-xs font-medium text-gray-900 group-hover:text-blue-600">Forest</span>
          </button>
          
          {/* Sunset */}
          <button
            onClick={() => applyPreset('sunset')}
            className="group flex flex-col items-center gap-2 p-3 text-center border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:shadow-md transition-all bg-white"
          >
            <div className="flex gap-1">
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#C2410C' }}></div>
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#EA580C' }}></div>
            </div>
            <span className="text-xs font-medium text-gray-900 group-hover:text-blue-600">Sunset</span>
          </button>
          
          {/* Midnight */}
          <button
            onClick={() => applyPreset('midnight')}
            className="group flex flex-col items-center gap-2 p-3 text-center border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:shadow-md transition-all bg-white"
          >
            <div className="flex gap-1">
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#1E293B' }}></div>
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#334155' }}></div>
            </div>
            <span className="text-xs font-medium text-gray-900 group-hover:text-blue-600">Midnight</span>
          </button>
          
          {/* Rose */}
          <button
            onClick={() => applyPreset('rose')}
            className="group flex flex-col items-center gap-2 p-3 text-center border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:shadow-md transition-all bg-white"
          >
            <div className="flex gap-1">
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#BE123C' }}></div>
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#E11D48' }}></div>
            </div>
            <span className="text-xs font-medium text-gray-900 group-hover:text-blue-600">Rose</span>
          </button>
          
          {/* Lavender */}
          <button
            onClick={() => applyPreset('lavender')}
            className="group flex flex-col items-center gap-2 p-3 text-center border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:shadow-md transition-all bg-white"
          >
            <div className="flex gap-1">
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#7C3AED' }}></div>
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#A78BFA' }}></div>
            </div>
            <span className="text-xs font-medium text-gray-900 group-hover:text-blue-600">Lavender</span>
          </button>
          
          {/* Amber */}
          <button
            onClick={() => applyPreset('amber')}
            className="group flex flex-col items-center gap-2 p-3 text-center border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:shadow-md transition-all bg-white"
          >
            <div className="flex gap-1">
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#D97706' }}></div>
              <div className="w-5 h-5 rounded" style={{ backgroundColor: '#F59E0B' }}></div>
            </div>
            <span className="text-xs font-medium text-gray-900 group-hover:text-blue-600">Amber</span>
          </button>
        </div>
      </div>

      {/* Branding Assets */}
      <div className="space-y-4">
        <h4 className="font-semibold text-gray-900 text-base">🖼 Brand Assets</h4>
      </div>

      {/* Logo Upload */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-4">System Logo</h4>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Main Logo</label>
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <input 
                  ref={logoInputRef}
                  type="file" 
                  accept="image/*" 
                  onChange={(e) => handleLogoUpload(e, 'logo')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg" 
                />
                <p className="text-xs text-gray-500 mt-1">Recommended: 200x60px, PNG/SVG (Max 2MB)</p>
              </div>
              {(logoPreview || theme.mainLogo) && (
                <div className="flex flex-col gap-2">
                  <div className="w-32 h-20 border border-gray-300 rounded-lg flex items-center justify-center bg-white p-2">
                    <img 
                      src={logoPreview || theme.mainLogo} 
                      alt="Logo Preview" 
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                  <button
                    onClick={() => handleRemoveLogo('logo')}
                    className="text-xs text-red-600 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Favicon</label>
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <input 
                  ref={faviconInputRef}
                  type="file" 
                  accept="image/x-icon,image/png,image/*" 
                  onChange={(e) => handleLogoUpload(e, 'favicon')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg" 
                />
                <p className="text-xs text-gray-500 mt-1">Recommended: 32x32px, ICO/PNG (Max 2MB)</p>
              </div>
              {(faviconPreview || theme.favicon) && (
                <div className="flex flex-col gap-2">
                  <div className="w-16 h-16 border border-gray-300 rounded-lg flex items-center justify-center bg-white p-2">
                    <img 
                      src={faviconPreview || theme.favicon} 
                      alt="Favicon Preview" 
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                  <button
                    onClick={() => handleRemoveLogo('favicon')}
                    className="text-xs text-red-600 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Background Image */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-4">Background Image</h4>
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">Main Background Image (Optional)</label>
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <input 
                ref={bgImageInputRef}
                type="file" 
                accept="image/*" 
                onChange={(e) => handleLogoUpload(e, 'bgImage')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg" 
              />
              <p className="text-xs text-gray-500 mt-1">Recommended: 1920x1080px, JPG/PNG (Max 5MB). Will be overlaid with background color.</p>
            </div>
            {(bgImagePreview || theme.bgImage) && (
              <div className="flex flex-col gap-2">
                <div className="w-32 h-20 border border-gray-300 rounded-lg flex items-center justify-center bg-gray-100 p-2">
                  <img 
                    src={bgImagePreview || theme.bgImage} 
                    alt="Background Preview" 
                    className="max-w-full max-h-full object-cover rounded"
                  />
                </div>
                <button
                  onClick={() => handleRemoveLogo('bgImage')}
                  className="text-xs text-red-600 hover:text-red-700"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Color Scheme */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-4">Color Scheme</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Primary Color (Topbar)</label>
            <div className="flex gap-2">
              <input type="color" value={theme.primaryColor} onChange={(e) => handleThemeChange('primaryColor', e.target.value)} className="w-16 h-10 border border-gray-300 rounded cursor-pointer" />
              <input type="text" value={theme.primaryColor} onChange={(e) => handleThemeChange('primaryColor', e.target.value)} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg outline-none" />
              <div className="w-10 h-10 rounded border border-gray-300" style={{ backgroundColor: theme.primaryColor }}></div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Main Background Color</label>
            <div className="flex gap-2">
              <input type="color" value={theme.mainBgColor} onChange={(e) => handleThemeChange('mainBgColor', e.target.value)} className="w-16 h-10 border border-gray-300 rounded cursor-pointer" />
              <input type="text" value={theme.mainBgColor} onChange={(e) => handleThemeChange('mainBgColor', e.target.value)} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg outline-none" />
              <div className="w-10 h-10 rounded border border-gray-300" style={{ backgroundColor: theme.mainBgColor }}></div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Sidebar Background</label>
            <div className="flex gap-2">
              <input type="color" value={theme.sidebarBgColor} onChange={(e) => handleThemeChange('sidebarBgColor', e.target.value)} className="w-16 h-10 border border-gray-300 rounded cursor-pointer" />
              <input type="text" value={theme.sidebarBgColor} onChange={(e) => handleThemeChange('sidebarBgColor', e.target.value)} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg outline-none" />
              <div className="w-10 h-10 rounded border border-gray-300" style={{ backgroundColor: theme.sidebarBgColor }}></div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Sidebar Text Color</label>
            <div className="flex gap-2">
              <input type="color" value={theme.sidebarTextColor} onChange={(e) => handleThemeChange('sidebarTextColor', e.target.value)} className="w-16 h-10 border border-gray-300 rounded cursor-pointer" />
              <input type="text" value={theme.sidebarTextColor} onChange={(e) => handleThemeChange('sidebarTextColor', e.target.value)} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg outline-none" />
              <div className="w-10 h-10 rounded border border-gray-300" style={{ backgroundColor: theme.sidebarTextColor }}></div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Tab Text Color (Inactive)</label>
            <div className="flex gap-2">
              <input type="color" value={theme.tabTextColor} onChange={(e) => handleThemeChange('tabTextColor', e.target.value)} className="w-16 h-10 border border-gray-300 rounded cursor-pointer" />
              <input type="text" value={theme.tabTextColor} onChange={(e) => handleThemeChange('tabTextColor', e.target.value)} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg outline-none" />
              <div className="w-10 h-10 rounded border border-gray-300" style={{ backgroundColor: theme.tabTextColor }}></div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Tab Active Color</label>
            <div className="flex gap-2">
              <input type="color" value={theme.tabActiveColor} onChange={(e) => handleThemeChange('tabActiveColor', e.target.value)} className="w-16 h-10 border border-gray-300 rounded cursor-pointer" />
              <input type="text" value={theme.tabActiveColor} onChange={(e) => handleThemeChange('tabActiveColor', e.target.value)} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg outline-none" />
              <div className="w-10 h-10 rounded border border-gray-300" style={{ backgroundColor: theme.tabActiveColor }}></div>
            </div>
          </div>
        </div>
        <button onClick={handleResetTheme} className="mt-4 text-sm text-blue-600 hover:text-blue-700">Reset to Default</button>
      </div>

      {/* Typography */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-4">Typography</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Font Family</label>
            <select value={theme.fontFamily} onChange={(e) => handleThemeChange('fontFamily', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white">
              <option>Inter</option>
              <option>Roboto</option>
              <option>Open Sans</option>
              <option>Poppins</option>
            </select>
          </div>
        </div>
      </div>

      {/* Extended Color Palette */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-4">Extended Color Palette</h4>
        <div className="space-y-4">
          {/* Status Colors */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-3">Status Colors</label>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { key: 'successColor', label: 'Success' },
                { key: 'warningColor', label: 'Warning' },
                { key: 'errorColor', label: 'Error' },
                { key: 'infoColor', label: 'Info' }
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-xs text-gray-600 mb-2">{label}</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={theme[key]}
                      onChange={(e) => handleThemeChange(key, e.target.value)}
                      className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={theme[key]}
                      onChange={(e) => handleThemeChange(key, e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Text Colors */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-3">Text Colors</label>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { key: 'textPrimary', label: 'Primary Text' },
                { key: 'textSecondary', label: 'Secondary Text' },
                { key: 'textMuted', label: 'Muted Text' },
                { key: 'textDisabled', label: 'Disabled Text' }
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-xs text-gray-600 mb-2">{label}</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={theme[key]}
                      onChange={(e) => handleThemeChange(key, e.target.value)}
                      className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={theme[key]}
                      onChange={(e) => handleThemeChange(key, e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Border Colors */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-3">Border Colors</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { key: 'borderLight', label: 'Light Border' },
                { key: 'borderMedium', label: 'Medium Border' },
                { key: 'borderDark', label: 'Dark Border' }
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-xs text-gray-600 mb-2">{label}</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={theme[key]}
                      onChange={(e) => handleThemeChange(key, e.target.value)}
                      className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={theme[key]}
                      onChange={(e) => handleThemeChange(key, e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Background Colors */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-3">Background Variations</label>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { key: 'bgCard', label: 'Card Background' },
                { key: 'bgPanel', label: 'Panel Background' },
                { key: 'bgHover', label: 'Hover Background' },
                { key: 'bgSelected', label: 'Selected Background' }
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-xs text-gray-600 mb-2">{label}</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={theme[key]}
                      onChange={(e) => handleThemeChange(key, e.target.value)}
                      className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={theme[key]}
                      onChange={(e) => handleThemeChange(key, e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Button Styles */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-4">Button Styles</h4>
        <div className="space-y-4">
          {/* Primary Button */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-3">Primary Button</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { key: 'btnPrimaryBg', label: 'Background' },
                { key: 'btnPrimaryText', label: 'Text Color' },
                { key: 'btnPrimaryHover', label: 'Hover Color' }
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-xs text-gray-600 mb-2">{label}</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={theme[key]}
                      onChange={(e) => handleThemeChange(key, e.target.value)}
                      className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={theme[key]}
                      onChange={(e) => handleThemeChange(key, e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Secondary Button */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-3">Secondary Button</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { key: 'btnSecondaryBg', label: 'Background' },
                { key: 'btnSecondaryText', label: 'Text Color' },
                { key: 'btnSecondaryHover', label: 'Hover Color' }
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-xs text-gray-600 mb-2">{label}</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={theme[key]}
                      onChange={(e) => handleThemeChange(key, e.target.value)}
                      className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={theme[key]}
                      onChange={(e) => handleThemeChange(key, e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Danger Button */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-3">Danger/Destructive Button</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { key: 'btnDangerBg', label: 'Background' },
                { key: 'btnDangerText', label: 'Text Color' },
                { key: 'btnDangerHover', label: 'Hover Color' }
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-xs text-gray-600 mb-2">{label}</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={theme[key]}
                      onChange={(e) => handleThemeChange(key, e.target.value)}
                      className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={theme[key]}
                      onChange={(e) => handleThemeChange(key, e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* Content Formatting */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-4">Content Formatting</h4>
        <div className="space-y-4">
          {/* Table Styling */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-3">Table Styling</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-600 mb-2">Row Height</label>
                <input
                  type="text"
                  value={theme.tableRowHeight}
                  onChange={(e) => handleThemeChange('tableRowHeight', e.target.value)}
                  placeholder="3rem"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-2">Header Background</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={theme.tableHeaderBg}
                    onChange={(e) => handleThemeChange('tableHeaderBg', e.target.value)}
                    className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={theme.tableHeaderBg}
                    onChange={(e) => handleThemeChange('tableHeaderBg', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-2">Header Text</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={theme.tableHeaderText}
                    onChange={(e) => handleThemeChange('tableHeaderText', e.target.value)}
                    className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={theme.tableHeaderText}
                    onChange={(e) => handleThemeChange('tableHeaderText', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Badge Styling */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-3">Badge/Status Styling</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-600 mb-2">Padding X</label>
                <input
                  type="text"
                  value={theme.badgePaddingX}
                  onChange={(e) => handleThemeChange('badgePaddingX', e.target.value)}
                  placeholder="0.625rem"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-2">Padding Y</label>
                <input
                  type="text"
                  value={theme.badgePaddingY}
                  onChange={(e) => handleThemeChange('badgePaddingY', e.target.value)}
                  placeholder="0.25rem"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Landing Page Colors */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-4">Landing Page Colors (Pre-Login)</h4>
        <div className="space-y-4">
          {/* Navigation Bar */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-3">Navigation Bar</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-600 mb-2">Background Color</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={theme.landingNavBg}
                    onChange={(e) => handleThemeChange('landingNavBg', e.target.value)}
                    className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={theme.landingNavBg}
                    onChange={(e) => handleThemeChange('landingNavBg', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-2">Text Color</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={theme.landingNavText}
                    onChange={(e) => handleThemeChange('landingNavText', e.target.value)}
                    className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={theme.landingNavText}
                    onChange={(e) => handleThemeChange('landingNavText', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Hero Section */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-3">Hero Section Gradient</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-600 mb-2">Start Color (Left)</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={theme.landingHeroGradientStart}
                    onChange={(e) => handleThemeChange('landingHeroGradientStart', e.target.value)}
                    className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={theme.landingHeroGradientStart}
                    onChange={(e) => handleThemeChange('landingHeroGradientStart', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-2">Middle Color</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={theme.landingHeroGradientMid}
                    onChange={(e) => handleThemeChange('landingHeroGradientMid', e.target.value)}
                    className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={theme.landingHeroGradientMid}
                    onChange={(e) => handleThemeChange('landingHeroGradientMid', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-2">End Color (Right)</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={theme.landingHeroGradientEnd}
                    onChange={(e) => handleThemeChange('landingHeroGradientEnd', e.target.value)}
                    className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={theme.landingHeroGradientEnd}
                    onChange={(e) => handleThemeChange('landingHeroGradientEnd', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                  />
                </div>
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-xs text-gray-600 mb-2">Hero Text Color</label>
              <div className="flex gap-2 md:w-1/3">
                <input
                  type="color"
                  value={theme.landingHeroText}
                  onChange={(e) => handleThemeChange('landingHeroText', e.target.value)}
                  className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={theme.landingHeroText}
                  onChange={(e) => handleThemeChange('landingHeroText', e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                />
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-3">Landing Page Buttons</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-600 mb-2">Primary Button Background</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={theme.landingButtonPrimary}
                    onChange={(e) => handleThemeChange('landingButtonPrimary', e.target.value)}
                    className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={theme.landingButtonPrimary}
                    onChange={(e) => handleThemeChange('landingButtonPrimary', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-2">Primary Button Text</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={theme.landingButtonPrimaryText}
                    onChange={(e) => handleThemeChange('landingButtonPrimaryText', e.target.value)}
                    className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={theme.landingButtonPrimaryText}
                    onChange={(e) => handleThemeChange('landingButtonPrimaryText', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-2">Secondary Button Background</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={theme.landingButtonSecondary?.startsWith('#') ? theme.landingButtonSecondary : '#FFFFFF'}
                    onChange={(e) => handleThemeChange('landingButtonSecondary', e.target.value)}
                    className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={theme.landingButtonSecondary}
                    onChange={(e) => handleThemeChange('landingButtonSecondary', e.target.value)}
                    placeholder="transparent"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-2">Secondary Button Text</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={theme.landingButtonSecondaryText}
                    onChange={(e) => handleThemeChange('landingButtonSecondaryText', e.target.value)}
                    className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={theme.landingButtonSecondaryText}
                    onChange={(e) => handleThemeChange('landingButtonSecondaryText', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section Backgrounds */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-3">Section Backgrounds</label>
            <p className="text-xs text-gray-500 mb-3">Customize the background color or gradient for each landing page section</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-600 mb-2">What is DMS Section</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={theme.landingAboutBg?.startsWith('#') ? theme.landingAboutBg : '#F9FAFB'}
                    onChange={(e) => handleThemeChange('landingAboutBg', e.target.value)}
                    className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={theme.landingAboutBg || ''}
                    onChange={(e) => handleThemeChange('landingAboutBg', e.target.value)}
                    placeholder="#F9FAFB or linear-gradient(...)"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-2">Core Features Section</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={theme.landingCoreFeaturesBg?.startsWith('#') ? theme.landingCoreFeaturesBg : '#F9FAFB'}
                    onChange={(e) => handleThemeChange('landingCoreFeaturesBg', e.target.value)}
                    className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={theme.landingCoreFeaturesBg || ''}
                    onChange={(e) => handleThemeChange('landingCoreFeaturesBg', e.target.value)}
                    placeholder="#F9FAFB or linear-gradient(...)"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-2">System Features Section</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={theme.landingSystemFeaturesBg?.startsWith('#') ? theme.landingSystemFeaturesBg : '#EFF6FF'}
                    onChange={(e) => handleThemeChange('landingSystemFeaturesBg', e.target.value)}
                    className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={theme.landingSystemFeaturesBg || ''}
                    onChange={(e) => handleThemeChange('landingSystemFeaturesBg', e.target.value)}
                    placeholder="linear-gradient(to bottom right, #EFF6FF, #FAF5FF)"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-2">Who Uses This System Section</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={theme.landingRolesBg?.startsWith('#') ? theme.landingRolesBg : '#ECFEFF'}
                    onChange={(e) => handleThemeChange('landingRolesBg', e.target.value)}
                    className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={theme.landingRolesBg || ''}
                    onChange={(e) => handleThemeChange('landingRolesBg', e.target.value)}
                    placeholder="linear-gradient(to bottom right, #ECFEFF, #EFF6FF, #FAF5FF)"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-2">Workflow Section</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={theme.landingWorkflowBg?.startsWith('#') ? theme.landingWorkflowBg : '#F8FAFC'}
                    onChange={(e) => handleThemeChange('landingWorkflowBg', e.target.value)}
                    className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={theme.landingWorkflowBg || ''}
                    onChange={(e) => handleThemeChange('landingWorkflowBg', e.target.value)}
                    placeholder="linear-gradient(to bottom right, #F8FAFC, #EFF6FF)"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-2">Contact Section</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={theme.landingContactBg?.startsWith('#') ? theme.landingContactBg : '#F3F4F6'}
                    onChange={(e) => handleThemeChange('landingContactBg', e.target.value)}
                    className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={theme.landingContactBg || ''}
                    onChange={(e) => handleThemeChange('landingContactBg', e.target.value)}
                    placeholder="#F3F4F6"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Login Page Colors */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-4">Login Page Colors</h4>
        <div className="space-y-4">
          {/* Background Gradient */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-3">Background Gradient</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-600 mb-2">Gradient Start Color</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={theme.loginBgGradientStart}
                    onChange={(e) => handleThemeChange('loginBgGradientStart', e.target.value)}
                    className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={theme.loginBgGradientStart}
                    onChange={(e) => handleThemeChange('loginBgGradientStart', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-2">Gradient End Color</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={theme.loginBgGradientEnd}
                    onChange={(e) => handleThemeChange('loginBgGradientEnd', e.target.value)}
                    className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={theme.loginBgGradientEnd}
                    onChange={(e) => handleThemeChange('loginBgGradientEnd', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Card Styling */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-3">Login Card</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-600 mb-2">Card Background</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={theme.loginCardBg}
                    onChange={(e) => handleThemeChange('loginCardBg', e.target.value)}
                    className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={theme.loginCardBg}
                    onChange={(e) => handleThemeChange('loginCardBg', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-2">Card Shadow</label>
                <input
                  type="text"
                  value={theme.loginCardShadow}
                  onChange={(e) => handleThemeChange('loginCardShadow', e.target.value)}
                  placeholder="0 4px 6px -1px rgba(0, 0, 0, 0.1)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                />
              </div>
            </div>
          </div>

          {/* Button Colors */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-3">Login Button</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-600 mb-2">Button Background</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={theme.loginButtonBg}
                    onChange={(e) => handleThemeChange('loginButtonBg', e.target.value)}
                    className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={theme.loginButtonBg}
                    onChange={(e) => handleThemeChange('loginButtonBg', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-2">Button Text</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={theme.loginButtonText}
                    onChange={(e) => handleThemeChange('loginButtonText', e.target.value)}
                    className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={theme.loginButtonText}
                    onChange={(e) => handleThemeChange('loginButtonText', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-2">Button Hover</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={theme.loginButtonHover}
                    onChange={(e) => handleThemeChange('loginButtonHover', e.target.value)}
                    className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={theme.loginButtonHover}
                    onChange={(e) => handleThemeChange('loginButtonHover', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Accent/Icon Colors */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-3">Icon Accent</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-600 mb-2">Accent Background</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={theme.loginAccentBg}
                    onChange={(e) => handleThemeChange('loginAccentBg', e.target.value)}
                    className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={theme.loginAccentBg}
                    onChange={(e) => handleThemeChange('loginAccentBg', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-2">Icon Color</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={theme.loginAccentIcon}
                    onChange={(e) => handleThemeChange('loginAccentIcon', e.target.value)}
                    className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={theme.loginAccentIcon}
                    onChange={(e) => handleThemeChange('loginAccentIcon', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Welcome Message */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Welcome Message</label>
            <input
              type="text"
              value={theme.loginWelcomeMessage || 'Welcome to {companyName}'}
              onChange={(e) => handleThemeChange('loginWelcomeMessage', e.target.value)}
              placeholder="Welcome to {companyName}"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">Use {'{companyName}'} to dynamically insert company name</p>
          </div>
        </div>
      </div>

      {/* Layout */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-4">Layout</h4>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Sidebar Position</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={theme.sidebarPosition === 'left'} onChange={() => handleThemeChange('sidebarPosition', 'left')} className="w-4 h-4 text-blue-600" />
                <span className="text-sm">Left</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={theme.sidebarPosition === 'right'} onChange={() => handleThemeChange('sidebarPosition', 'right')} className="w-4 h-4 text-blue-600" />
                <span className="text-sm">Right</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
        <div className="flex items-start gap-2">
          <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm text-blue-800">
            <p className="font-medium">Live Preview Active</p>
            <p>Changes are applied instantly. A confirmation dialog will appear to save or revert your changes.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// Tab 4: Document Settings
function DocumentSettings() {
  const { t } = usePreferences()
  const [settings, setSettings] = useState({
    maxFileSize: 50,
    allowedTypes: {
      pdf: true,
      doc: true,
      docx: true,
      dotx: false,
      xls: false,
      xlsx: false,
      xltx: false,
      ppt: true,
      pptx: true,
      png: true,
      jpg: true,
      jpeg: true,
      gif: true,
      csv: false,
      txt: true,
      js: true,
      jsx: true,
      ts: true,
      tsx: true,
      json: true,
      html: true,
      css: true,
      scss: true,
      less: true,
      md: true,
      yml: true,
      yaml: true,
      xml: true,
      sql: true,
      py: true,
      java: true,
      c: true,
      cpp: true,
      h: true,
      hpp: true,
      cs: true,
      go: true,
      rb: true,
      rs: true,
      kt: true,
      swift: true,
      vue: true
    },
    bulkUploadLimit: 10,
    autoGenerateCode: true,
    documentCodeFormat: 'PREFIX/VERSION/YYMMDD/COUNTER',
    separator: '/',
    prefixPlaceholder: 'PFX',
    includeProjectCategoryCode: false,
    includeVersion: true,
    versionDigits: '2',
    dateFormat: 'YYMMDD',
    counterDigits: '3',
    startingNumber: '1',
    autoVersion: true,
    versionFormat: 'v1.0',
    maxVersions: 10,
    draftRetention: 30,
    archivedRetention: 365,
    deletedRetention: 90,
    rfidEpcRegistryEnabled: false
  })
  const [saving, setSaving] = useState(false)

  const allowedTypeKeys = Object.keys(settings.allowedTypes)
  const allowedTypeColumns = allowedTypeKeys.reduce((cols, key, idx) => {
    const colIndex = Math.floor(idx / 10)
    if (!cols[colIndex]) cols[colIndex] = []
    cols[colIndex].push(key)
    return cols
  }, [])

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      // Load all settings from backend
      const [numberingRes, fileUploadRes, versionRes, retentionRes, rfidRes] = await Promise.all([
        api.get('/system/config/document-numbering').catch(err => ({ data: { success: false } })),
        api.get('/system/config/file-upload').catch(err => ({ data: { success: false } })),
        api.get('/system/config/version-control').catch(err => ({ data: { success: false } })),
        api.get('/system/config/retention-policy').catch(err => ({ data: { success: false } })),
        api.get('/system/config/rfid-epc-registry').catch(err => ({ data: { success: false } }))
      ])

      const loadedSettings = { ...settings }

      // Merge document numbering settings
      if (numberingRes.data.success && numberingRes.data.data.settings) {
        Object.assign(loadedSettings, numberingRes.data.data.settings)
      }

      // Merge file upload settings
      if (fileUploadRes.data.success && fileUploadRes.data.data.settings) {
        const fileSettings = fileUploadRes.data.data.settings
        loadedSettings.maxFileSize = fileSettings.maxFileSize
        loadedSettings.bulkUploadLimit = fileSettings.bulkUploadLimit
        
        // Convert array of allowed types to checkbox object
        if (fileSettings.allowedTypes && Array.isArray(fileSettings.allowedTypes)) {
          const allowedTypesObj = {}
          fileSettings.allowedTypes.forEach(type => {
            allowedTypesObj[type.toLowerCase()] = true
          })
          loadedSettings.allowedTypes = { ...settings.allowedTypes, ...allowedTypesObj }
        }
      }

      // Merge version control settings
      if (versionRes.data.success && versionRes.data.data.settings) {
        const versionSettings = versionRes.data.data.settings
        loadedSettings.autoVersion = versionSettings.autoVersion
        loadedSettings.versionFormat = versionSettings.versionFormat
        loadedSettings.maxVersions = versionSettings.maxVersions
      }

      // Merge retention policy settings
      if (retentionRes.data.success && retentionRes.data.data.settings) {
        const retentionSettings = retentionRes.data.data.settings
        loadedSettings.draftRetention = retentionSettings.draftRetention
        loadedSettings.archivedRetention = retentionSettings.archivedRetention
        loadedSettings.deletedRetention = retentionSettings.deletedRetention
      }

      if (rfidRes.data.success && rfidRes.data.data.settings) {
        const rfidSettings = rfidRes.data.data.settings
        loadedSettings.rfidEpcRegistryEnabled = Boolean(rfidSettings.enabled)
      }

      setSettings(loadedSettings)
      // Also update localStorage for backward compatibility
      localStorage.setItem('dms_document_settings', JSON.stringify(loadedSettings))
      window.dispatchEvent(new Event('documentSettingsChanged'))
    } catch (error) {
      console.error('Failed to load settings from backend, using localStorage:', error)
      // Fallback to localStorage
      const saved = localStorage.getItem('dms_document_settings')
      if (saved) {
        try {
          const parsedSettings = JSON.parse(saved)
          setSettings(parsedSettings)
        } catch (error) {
          console.error('Failed to parse saved settings:', error)
        }
      }
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Validate settings
      if (settings.maxFileSize < 1 || settings.maxFileSize > 500) {
        alert('Max file size must be between 1 and 500 MB')
        setSaving(false)
        return
      }
      
      if (settings.bulkUploadLimit < 1 || settings.bulkUploadLimit > 100) {
        alert('Bulk upload limit must be between 1 and 100 files')
        setSaving(false)
        return
      }
      
      if (settings.maxVersions < 1 || settings.maxVersions > 50) {
        alert('Max versions must be between 1 and 50')
        setSaving(false)
        return
      }
      
      // Check if at least one file type is enabled
      const hasEnabledType = Object.values(settings.allowedTypes).some(enabled => enabled)
      if (!hasEnabledType) {
        alert('At least one file type must be enabled')
        setSaving(false)
        return
      }
      
      const saveErrors = []
      
      // Save file upload settings to backend
      try {
        const enabledTypes = Object.keys(settings.allowedTypes)
          .filter(type => settings.allowedTypes[type])
          .map(type => type.toUpperCase())
        
        const fileUploadSettings = {
          maxFileSize: settings.maxFileSize,
          allowedTypes: enabledTypes,
          bulkUploadLimit: settings.bulkUploadLimit
        }
        
        await api.put('/system/config/file-upload', fileUploadSettings)
      } catch (error) {
        console.error('Failed to save file upload settings:', error)
        saveErrors.push('file upload')
      }
      
      // Save document numbering settings to backend
      if (settings.autoGenerateCode) {
        try {
          const numberingSettings = {
            separator: settings.separator,
            prefixPlaceholder: settings.prefixPlaceholder,
            includeProjectCategoryCode: settings.includeProjectCategoryCode,
            includeVersion: settings.includeVersion,
            versionDigits: settings.versionDigits,
            dateFormat: settings.dateFormat,
            counterDigits: settings.counterDigits,
            startingNumber: settings.startingNumber
          }
          
          await api.put('/system/config/document-numbering', numberingSettings)
        } catch (error) {
          console.error('Failed to save document numbering settings:', error)
          saveErrors.push('document numbering')
        }
      }
      
      // Save version control settings to backend
      try {
        const versionSettings = {
          autoVersion: settings.autoVersion,
          versionFormat: settings.versionFormat,
          maxVersions: settings.maxVersions
        }
        
        await api.put('/system/config/version-control', versionSettings)
      } catch (error) {
        console.error('Failed to save version control settings:', error)
        saveErrors.push('version control')
      }
      
      // Save retention policy settings to backend
      try {
        const retentionSettings = {
          draftRetention: settings.draftRetention,
          archivedRetention: settings.archivedRetention,
          deletedRetention: settings.deletedRetention
        }
        
        await api.put('/system/config/retention-policy', retentionSettings)
      } catch (error) {
        console.error('Failed to save retention policy settings:', error)
        saveErrors.push('retention policy')
      }

      try {
        const payload = {
          enabled: Boolean(settings.rfidEpcRegistryEnabled)
        }
        await api.put('/system/config/rfid-epc-registry', payload)
      } catch (error) {
        console.error('Failed to save RFID EPC registry settings:', error)
        saveErrors.push('rfid epc registry')
      }
      
      // Always save to localStorage for backward compatibility and NDR preview
      localStorage.setItem('dms_document_settings', JSON.stringify(settings))
      window.dispatchEvent(new Event('documentSettingsChanged'))
      console.log('Saving document settings:', settings)
      
      if (saveErrors.length > 0) {
        alert(`Warning: Failed to save ${saveErrors.join(', ')} settings to server. Other settings were saved successfully.`)
      } else {
        alert('Document settings saved successfully!')
      }
    } catch (error) {
      console.error('Failed to save settings:', error)
      alert('Failed to save settings. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Document Management Preferences</h3>
        <p className="text-sm text-gray-600 mt-1">Configure document handling and storage settings</p>
      </div>

      {/* File Upload Settings */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-4">{t('gss_ds_file_upload')}</h4>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Max File Size (MB)</label>
            <input 
              type="number" 
              min="1" 
              max="500" 
              value={settings.maxFileSize} 
              onChange={(e) => setSettings(prev => ({ ...prev, maxFileSize: parseInt(e.target.value) || 1 }))} 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
            />
            <p className="text-xs text-gray-500 mt-1">Maximum file size for document uploads (1-500 MB)</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Allowed File Types</label>
            <div className="overflow-x-auto">
              <div className="flex flex-nowrap gap-x-10 gap-y-3 min-w-max">
                {allowedTypeColumns.map((col, colIdx) => (
                  <div key={colIdx} className="flex flex-col gap-3 min-w-[120px]">
                    {col.map((type) => (
                      <label key={type} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={settings.allowedTypes[type]} onChange={(e) => setSettings(prev => ({ ...prev, allowedTypes: { ...prev.allowedTypes, [type]: e.target.checked } }))} className="w-4 h-4 text-blue-600 rounded" />
                        <span className="text-sm text-gray-700 uppercase">{type}</span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Bulk Upload Limit (files)</label>
            <input 
              type="number" 
              min="1" 
              max="100" 
              value={settings.bulkUploadLimit} 
              onChange={(e) => setSettings(prev => ({ ...prev, bulkUploadLimit: parseInt(e.target.value) || 1 }))} 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
            />
            <p className="text-xs text-gray-500 mt-1">Maximum number of files that can be uploaded at once (1-100)</p>
          </div>
        </div>
      </div>

      {/* Document Numbering */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <h4 className="font-semibold text-gray-900 text-base">Document Numbering Configuration</h4>
          <p className="text-sm text-gray-600 mt-1">Configure automatic document code generation and formatting</p>
        </div>
        <div className="p-6 space-y-6">
          <label className="flex items-start gap-3 cursor-pointer">
            <input 
              type="checkbox" 
              checked={settings.autoGenerateCode} 
              onChange={(e) => setSettings(prev => ({ ...prev, autoGenerateCode: e.target.checked }))} 
              className="mt-1 w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500" 
            />
            <div>
              <span className="text-sm font-medium text-gray-900">Enable Auto-generate Document Code</span>
              <p className="text-sm text-gray-600 mt-0.5">Automatically generate unique document codes based on your format</p>
            </div>
          </label>
          {settings.autoGenerateCode && (
            <div className="space-y-6 pl-7">
              {/* Format Builder */}
              <div>
                <h5 className="text-sm font-semibold text-gray-900 mb-4">Format Builder</h5>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Prefix Placeholder */}
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">
                      Prefix Placeholder
                    </label>
                    <input 
                      type="text" 
                      value={settings.prefixPlaceholder} 
                      onChange={(e) => setSettings(prev => ({ ...prev, prefixPlaceholder: e.target.value }))} 
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm" 
                      placeholder="PFX"
                      maxLength="10"
                    />
                    <p className="text-xs text-gray-500 mt-1">e.g., PFX, PF, PREFIX (pulls actual prefix from Master Data)</p>
                  </div>

                  <div>
                    <label className="flex items-center gap-2 mb-1.5">
                      <input
                        type="checkbox"
                        checked={settings.includeProjectCategoryCode}
                        onChange={(e) => setSettings(prev => ({ ...prev, includeProjectCategoryCode: e.target.checked }))}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                      <span className="text-xs font-medium text-gray-700">Include Project Category Code</span>
                    </label>
                    <p className="text-xs text-gray-500 mt-1">
                      When enabled, the file code adds `project category code` as its own leading segment before the document type prefix.
                    </p>
                  </div>

                  {/* Separator */}
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">
                      Separator
                    </label>
                    <select 
                      value={settings.separator} 
                      onChange={(e) => setSettings(prev => ({ ...prev, separator: e.target.value }))} 
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono bg-white"
                    >
                      <option value="/">/ (Forward Slash)</option>
                      <option value="-">- (Dash)</option>
                      <option value="_">_ (Underscore)</option>
                      <option value=".">. (Dot)</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">Character that separates code parts</p>
                  </div>

                  {/* Version */}
                  <div>
                    <label className="flex items-center gap-2 mb-1.5">
                      <input 
                        type="checkbox" 
                        checked={settings.includeVersion} 
                        onChange={(e) => setSettings(prev => ({ ...prev, includeVersion: e.target.checked }))} 
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                      <span className="text-xs font-medium text-gray-700">Include Version Number</span>
                    </label>
                    {settings.includeVersion && (
                      <select 
                        value={settings.versionDigits} 
                        onChange={(e) => setSettings(prev => ({ ...prev, versionDigits: e.target.value }))} 
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm bg-white"
                      >
                        <option value="1">1 digit (1-9)</option>
                        <option value="2">2 digits (01-99)</option>
                        <option value="3">3 digits (001-999)</option>
                      </select>
                    )}
                    <p className="text-xs text-gray-500 mt-1">Version padding: 01, 001, etc.</p>
                  </div>

                  {/* Date Format */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Date Format</label>
                    <select 
                      value={settings.dateFormat} 
                      onChange={(e) => setSettings(prev => ({ ...prev, dateFormat: e.target.value }))} 
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm bg-white"
                    >
                      <option value="YYMMDD">YYMMDD (260105)</option>
                      <option value="YYYYMMDD">YYYYMMDD (20260105)</option>
                      <option value="YYYYMM">YYYYMM (202601)</option>
                      <option value="YYMM">YYMM (2601)</option>
                      <option value="YYYY">YYYY (2026)</option>
                      <option value="none">No Date</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">Date format in document code</p>
                  </div>

                  {/* Counter Digits */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Counter Digits</label>
                    <select 
                      value={settings.counterDigits} 
                      onChange={(e) => setSettings(prev => ({ ...prev, counterDigits: e.target.value }))} 
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm bg-white"
                    >
                      <option value="2">2 digits (01-99)</option>
                      <option value="3">3 digits (001-999)</option>
                      <option value="4">4 digits (0001-9999)</option>
                      <option value="5">5 digits (00001-99999)</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">Running number padding</p>
                  </div>

                  {/* Starting Number */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Starting Counter Value</label>
                    <input 
                      type="number" 
                      min="1"
                      value={settings.startingNumber} 
                      onChange={(e) => setSettings(prev => ({ ...prev, startingNumber: e.target.value }))} 
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm" 
                      placeholder="1"
                    />
                    <p className="text-xs text-gray-500 mt-1">Auto-increments with each document</p>
                  </div>
                </div>
              </div>

              {/* Live Preview */}
              <div className="bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 border-2 border-green-300 rounded-xl p-5 shadow-lg">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-base font-bold text-green-900">Live Preview</p>
                    <p className="text-xs text-green-700">Updates in real-time</p>
                  </div>
                  <span className="flex items-center gap-1.5 text-xs text-green-700 bg-green-100 px-3 py-1.5 rounded-full font-semibold border border-green-200">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                    Auto-updates
                  </span>
                </div>
                <div className="bg-white rounded-xl p-5 border-2 border-green-300 shadow-inner">
                  <p className="font-mono text-3xl text-green-700 font-bold tracking-wide text-center">{(() => {
                    const now = new Date();
                    const year = now.getFullYear();
                    const month = String(now.getMonth() + 1).padStart(2, '0');
                    const day = String(now.getDate()).padStart(2, '0');
                    const parts = [];
                    
                    // Add project category segment first when enabled, then the document prefix segment.
                    const prefixLength = Math.max(1, String(settings.prefixPlaceholder || 'PFX').length);
                    const docPrefix = 'DOC';
                    const projectCategoryCode = 'PC';
                    if (settings.includeProjectCategoryCode) {
                      parts.push(projectCategoryCode);
                    }
                    parts.push(docPrefix.slice(0, prefixLength));
                    
                    // Add version
                    if (settings.includeVersion) {
                      const versionDigits = parseInt(settings.versionDigits) || 2;
                      const version = '1'.padStart(versionDigits, '0');
                      parts.push(version);
                    }
                    
                    // Add date
                    if (settings.dateFormat && settings.dateFormat !== 'none') {
                      let datePart = '';
                      switch(settings.dateFormat) {
                        case 'YYMMDD':
                          datePart = String(year).slice(-2) + month + day;
                          break;
                        case 'YYYYMMDD':
                          datePart = String(year) + month + day;
                          break;
                        case 'YYYYMM':
                          datePart = String(year) + month;
                          break;
                        case 'YYMM':
                          datePart = String(year).slice(-2) + month;
                          break;
                        case 'YYYY':
                          datePart = String(year);
                          break;
                        default:
                          datePart = String(year).slice(-2) + month + day;
                      }
                      if (datePart) parts.push(datePart);
                    }
                    
                    // Add counter
                    const counterDigits = parseInt(settings.counterDigits) || 3;
                    const startNum = String(settings.startingNumber || '1');
                    const counter = startNum.padStart(counterDigits, '0');
                    parts.push(counter);
                    
                    const separator = settings.separator || '/';
                    return parts.join(separator);
                  })()}</p>
                </div>
                <div className="mt-3 flex items-start gap-2 text-xs text-green-800 bg-white/50 rounded-lg p-3 border border-green-200">
                  <svg className="w-5 h-5 mt-0.5 flex-shrink-0 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="leading-relaxed">This is how your document codes will be generated. <span className="font-semibold">Existing files stay unchanged</span>; only newly generated file codes follow the updated format.</p>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>

      {/* Version Control */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-4">{t('gss_ds_version_control')}</h4>
        <div className="space-y-4">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={settings.autoVersion} onChange={(e) => setSettings(prev => ({ ...prev, autoVersion: e.target.checked }))} className="w-4 h-4 text-blue-600 rounded" />
            <span className="text-sm font-medium text-gray-900">Enable Automatic Versioning</span>
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">Version Format</label>
              <select value={settings.versionFormat} onChange={(e) => setSettings(prev => ({ ...prev, versionFormat: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white">
                <option>v1.0</option>
                <option>v1.0.0</option>
                <option>1.0</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">Max Versions Kept</label>
              <input 
                type="number" 
                min="1" 
                max="50" 
                value={settings.maxVersions} 
                onChange={(e) => setSettings(prev => ({ ...prev, maxVersions: parseInt(e.target.value) || 1 }))} 
                className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
              />
              <p className="text-xs text-gray-500 mt-1">Number of versions to retain (1-50)</p>
            </div>
          </div>
        </div>
      </div>

      {/* Retention Policy */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-4">{t('gss_ds_retention')}</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Draft Retention (days)</label>
            <input 
              type="number" 
              min="0" 
              max="3650" 
              value={settings.draftRetention} 
              onChange={(e) => setSettings(prev => ({ ...prev, draftRetention: parseInt(e.target.value) || 0 }))} 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
            />
            <p className="text-xs text-gray-500 mt-1">Days to keep draft documents before cleanup</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Archived Retention (days)</label>
            <input 
              type="number" 
              min="0" 
              max="3650" 
              value={settings.archivedRetention} 
              onChange={(e) => setSettings(prev => ({ ...prev, archivedRetention: parseInt(e.target.value) || 0 }))} 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
            />
            <p className="text-xs text-gray-500 mt-1">Days to keep archived documents before permanent removal</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Deleted Retention (days)</label>
            <input 
              type="number" 
              min="0" 
              max="365" 
              value={settings.deletedRetention} 
              onChange={(e) => setSettings(prev => ({ ...prev, deletedRetention: parseInt(e.target.value) || 0 }))} 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
            />
            <p className="text-xs text-gray-500 mt-1">Days to keep deleted items in trash before permanent deletion</p>
          </div>
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <h4 className="font-semibold text-gray-900 text-base">EPC Registry</h4>
          <p className="text-sm text-gray-600 mt-1">Enable optional EPC registry generation after draft upload</p>
        </div>
        <div className="p-6 space-y-6">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.rfidEpcRegistryEnabled}
              onChange={(e) => setSettings((prev) => ({ ...prev, rfidEpcRegistryEnabled: e.target.checked }))}
              className="mt-1 w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-900">Enable EPC Registry</span>
              <p className="text-sm text-gray-600 mt-0.5">
                When enabled, the system generates a fixed-length 96-bit EPC value from the document file code and stores it for later RFID encoding.
              </p>
            </div>
          </label>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm font-medium text-blue-900">How it works</p>
            <p className="mt-1 text-sm text-blue-800">
              The system takes the generated document file code, creates a deterministic fixed-length EPC hex value, and saves the result in the EPC registry.
            </p>
            <p className="mt-2 text-xs text-blue-700">
              No GS1, SGTIN-96, company prefix, or item reference setup is required for this simplified flow. The EPC output is capped at 24 hex characters for better tag compatibility.
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button 
          onClick={handleSave} 
          disabled={saving}
          className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? t('gss_saving') : t('gss_save_changes')}
        </button>
      </div>
    </div>
  )
}

// Tab 5: Notification Settings
function NotificationSettings() {
  const { t } = usePreferences()
  const smtpUiRevision = 'smtp-ui-2026-04-20-c'
  const defaultNotificationSettings = {
    frontendUrl: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
    smtpHost: 'smtp.company.com',
    smtpPort: '587',
    smtpUsername: 'noreply@company.com',
    smtpPassword: '',
    fromName: 'DMS System',
    fromEmail: 'noreply@company.com',
    notifications: {
      acknowledgeRequired: { email: true, inApp: true },
      acknowledgeCompleted: { email: true, inApp: true },
      documentSubmitted: { email: true, inApp: true },
      reviewAssigned: { email: true, inApp: true },
      reviewCompleted: { email: true, inApp: true },
      approvalRequest: { email: true, inApp: true },
      documentApproved: { email: true, inApp: true },
      documentRejected: { email: true, inApp: true },
      documentReturned: { email: true, inApp: true },
      documentPublished: { email: true, inApp: true },
      documentSuperseded: { email: true, inApp: true },
      documentObsoleted: { email: true, inApp: true }
    },
    reviewReminder: 3,
    approvalReminder: 2,
    dailyDigest: true,
    digestTime: '09:00'
  }
  const [settings, setSettings] = useState(defaultNotificationSettings)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testingEmail, setTestingEmail] = useState(false)
  const [showPasswordField, setShowPasswordField] = useState(false)
  const [testEmail, setTestEmail] = useState('')

  const extractNotificationSettings = (body) => {
    const first = body?.data?.settings ?? body?.settings ?? body
    if (!first || typeof first !== 'object') return null
    // Backward compatibility for malformed payload: { settings: { ...actualValues } }
    if (first.settings && typeof first.settings === 'object') return first.settings
    return first
  }

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/system/config/notification-settings', {
        cache: 'no-store',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })
      if (response.ok) {
        const body = await response.json()
        const data = extractNotificationSettings(body)
        if (data && typeof data === 'object') {
          setSettings({
            ...defaultNotificationSettings,
            ...data,
            notifications: (data?.notifications && typeof data.notifications === 'object')
              ? { ...defaultNotificationSettings.notifications, ...data.notifications }
              : defaultNotificationSettings.notifications
          })
        }
      }
    } catch (error) {
      console.error('Error loading notification settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      const response = await fetch('/api/system/config/notification-settings', {
        method: 'PUT',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(settings)
      })
      if (response.ok) {
        const body = await response.json()
        const saved = extractNotificationSettings(body)
        if (saved && typeof saved === 'object') {
          setSettings({
            ...defaultNotificationSettings,
            ...saved,
            notifications: (saved?.notifications && typeof saved.notifications === 'object')
              ? { ...defaultNotificationSettings.notifications, ...saved.notifications }
              : defaultNotificationSettings.notifications
          })
        }
        alert('Notification settings saved successfully!')
        setShowPasswordField(false)
        await loadSettings() // Reload to get masked password
      } else {
        const error = await response.json()
        alert(`Error saving settings: ${error.message}`)
      }
    } catch (error) {
      console.error('Error saving notification settings:', error)
      alert('Error saving notification settings')
    } finally {
      setSaving(false)
    }
  }

  const handleTestEmail = async () => {
    try {
      setTestingEmail(true)
      const recipient = testEmail || window.prompt('Enter test email recipient')
      if (!recipient) return
      const response = await fetch('/api/system/config/notification-settings/test-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ testEmail: recipient })
      })
      const body = await response.json()
      if (response.ok) {
        const result = body?.data?.result || body?.result || body
        alert(`Test email sent successfully!\n\nSMTP Host: ${settings.smtpHost}\nSMTP Port: ${settings.smtpPort}\nFrom: ${settings.fromName} <${settings.fromEmail}>\n\nEmail sent to: ${recipient}\n\nMessage: ${result.message || 'OK'}`)
      } else {
        alert(`Test email failed: ${body.message}`)
      }
    } catch (error) {
      console.error('Error testing email:', error)
      alert('Error testing email connection')
    } finally {
      setTestingEmail(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading notification settings...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Email & Notification Preferences</h3>
        <p className="text-sm text-gray-600 mt-1">Configure email server and notification rules</p>
        <p className="text-xs text-gray-400 mt-1">UI: {smtpUiRevision}</p>
      </div>

      {/* Email Configuration */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-4">{t('gss_ns_smtp')}</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">SMTP Host</label>
            <input type="text" value={settings.smtpHost} onChange={(e) => setSettings(prev => ({ ...prev, smtpHost: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">SMTP Port</label>
            <input type="text" value={settings.smtpPort} onChange={(e) => setSettings(prev => ({ ...prev, smtpPort: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">SMTP Username</label>
            <input type="text" value={settings.smtpUsername} onChange={(e) => setSettings(prev => ({ ...prev, smtpUsername: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">SMTP Password</label>
            {showPasswordField ? (
              <div className="flex gap-2">
                <input 
                  type="password" 
                  value={settings.smtpPassword} 
                  onChange={(e) => setSettings(prev => ({ ...prev, smtpPassword: e.target.value }))} 
                  placeholder="Enter new password"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button 
                  onClick={() => setShowPasswordField(false)}
                  className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input 
                  type="password" 
                  value={settings.smtpPassword ? '••••••••' : ''} 
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg outline-none bg-gray-50" 
                  readOnly 
                  placeholder="No password set"
                />
                <button 
                  onClick={() => {
                    setSettings(prev => ({ ...prev, smtpPassword: '' }))
                    setShowPasswordField(true)
                  }}
                  className="px-3 py-2 text-sm text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50"
                >
                  Change
                </button>
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">From Name</label>
            <input type="text" value={settings.fromName} onChange={(e) => setSettings(prev => ({ ...prev, fromName: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">From Email</label>
            <input type="email" value={settings.fromEmail} onChange={(e) => setSettings(prev => ({ ...prev, fromEmail: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-900 mb-2">Frontend URL (for email buttons)</label>
            <input
              type="url"
              value={settings.frontendUrl || ''}
              onChange={(e) => setSettings(prev => ({ ...prev, frontendUrl: e.target.value }))}
              placeholder="e.g. https://dms.clbgroups.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-900 mb-2">Test Recipient Email</label>
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="e.g. you@company.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none"
            />
          </div>
        </div>
        <button 
          onClick={handleTestEmail} 
          disabled={testingEmail}
          className="mt-4 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {testingEmail ? 'Sending test email...' : 'Test Email Connection'}
        </button>
      </div>

      {/* Notification Events */}
      <div className="border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-medium text-gray-900">{t('gss_ns_events')}</h4>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setSettings(prev => ({
                  ...prev,
                  notifications: Object.keys(prev.notifications).reduce((acc, key) => {
                    acc[key] = { email: true, inApp: true };
                    return acc;
                  }, {})
                }));
              }}
              className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
            >
              ✓ {t('gss_ns_select_all')}
            </button>
            <button
              onClick={() => {
                setSettings(prev => ({
                  ...prev,
                  notifications: Object.keys(prev.notifications).reduce((acc, key) => {
                    acc[key] = { email: false, inApp: false };
                    return acc;
                  }, {})
                }));
              }}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              ✕ {t('gss_ns_deselect_all')}
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-2 font-medium text-gray-700">Event</th>
                <th className="text-center py-2 px-2 font-medium text-gray-700">Email</th>
                <th className="text-center py-2 px-2 font-medium text-gray-700">In-App</th>
              </tr>
            </thead>
            <tbody>
              {settings.notifications && Object.entries(settings.notifications).map(([key, value]) => (
                <tr key={key} className="border-b border-gray-100">
                  <td className="py-2 px-2 text-gray-700 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</td>
                  <td className="py-2 px-2 text-center">
                    <input type="checkbox" checked={value.email} onChange={(e) => setSettings(prev => ({ ...prev, notifications: { ...prev.notifications, [key]: { ...prev.notifications[key], email: e.target.checked } } }))} className="w-4 h-4 text-blue-600 rounded" />
                  </td>
                  <td className="py-2 px-2 text-center">
                    <input type="checkbox" checked={value.inApp} onChange={(e) => setSettings(prev => ({ ...prev, notifications: { ...prev.notifications, [key]: { ...prev.notifications[key], inApp: e.target.checked } } }))} className="w-4 h-4 text-blue-600 rounded" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reminder Settings */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-4">{t('gss_ns_reminder')}</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Review Reminder (days)</label>
            <input type="number" value={settings.reviewReminder} onChange={(e) => setSettings(prev => ({ ...prev, reviewReminder: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Approval Reminder (days)</label>
            <input type="number" value={settings.approvalReminder} onChange={(e) => setSettings(prev => ({ ...prev, approvalReminder: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Daily Digest</label>
            <div className="flex gap-2">
              <input type="checkbox" checked={settings.dailyDigest} onChange={(e) => setSettings(prev => ({ ...prev, dailyDigest: e.target.checked }))} className="w-4 h-4 mt-2 text-blue-600 rounded" />
              <input type="time" value={settings.digestTime} onChange={(e) => setSettings(prev => ({ ...prev, digestTime: e.target.value }))} disabled={!settings.dailyDigest} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg outline-none disabled:bg-gray-100" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button 
          onClick={handleSave} 
          disabled={saving}
          className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? t('gss_saving') : t('gss_save_changes')}
        </button>
      </div>
    </div>
  )
}

// Tab 6: Security Settings
function SecuritySettings() {
  const { t } = usePreferences()
  const [settings, setSettings] = useState({
    minPasswordLength: 8,
    requireUppercase: true,
    requireNumbers: true,
    requireSymbols: true,
    sessionTimeout: 30,
    maxLoginAttempts: 5,
    lockoutDuration: 15,
    enable2FA: true,
    twoFAMethods: { email: true, app: true },
    enableIPWhitelist: false,
    ipRanges: ['192.168.1.0/24'],
    enableAuditLog: true,
    logRetention: 365,
    logFailedLogins: true,
    encryptDocuments: true,
    encryptDatabase: true
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const token = localStorage.getItem('token')
        const response = await fetch('/api/system/config/security-settings', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        if (response.ok) {
          const body = await response.json()
          const data = body?.data?.settings || body?.settings || body
          setSettings(prev => ({
            ...prev,
            minPasswordLength: data.minLength || 8,
            requireUppercase: data.requireUppercase ?? true,
            requireNumbers: data.requireNumbers ?? true,
            requireSymbols: data.requireSymbols ?? true,
            maxLoginAttempts: data.maxLoginAttempts || 5,
            lockoutDuration: data.lockoutDuration || 15,
            sessionTimeout: data.sessionTimeout || 30,
            enable2FA: data.enable2FA ?? false,
            twoFAMethods: {
              email: data?.twoFAMethods?.email ?? true,
              app: data?.twoFAMethods?.app ?? false
            },
            encryptDocuments: data.encryptDocuments ?? false,
            encryptDatabase: data.encryptDatabase ?? false
          }))
        }
      } catch (error) {
        console.error('Failed to load security settings:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchSettings()
  }, [])

  const handleSave = async () => {
    if (settings.enable2FA && !settings.twoFAMethods.email && !settings.twoFAMethods.app) {
      alert('Please enable at least one 2FA method (Email or Authenticator App).')
      return
    }
    if (settings.enable2FA && settings.twoFAMethods.app && !settings.twoFAMethods.email) {
      const ok = window.confirm('Warning: Email verification is disabled. Users without authenticator setup may be locked out. Continue?')
      if (!ok) return
    }
    setSaving(true)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/system/config/security-settings', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          minLength: parseInt(settings.minPasswordLength),
          requireUppercase: settings.requireUppercase,
          requireNumbers: settings.requireNumbers,
          requireSymbols: settings.requireSymbols,
          maxLoginAttempts: parseInt(settings.maxLoginAttempts),
          lockoutDuration: parseInt(settings.lockoutDuration),
          sessionTimeout: parseInt(settings.sessionTimeout),
          enable2FA: settings.enable2FA,
          twoFAMethods: settings.twoFAMethods,
          encryptDocuments: settings.encryptDocuments,
          encryptDatabase: settings.encryptDatabase
        })
      })
      if (response.ok) {
        alert('Security settings saved successfully!')
      } else {
        const error = await response.json()
        alert(`Failed to save: ${error.message || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Failed to save security settings:', error)
      alert('Failed to save security settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">{t('gss_sec_loading')}</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">{t('gss_sec_title')}</h3>
        <p className="text-sm text-gray-600 mt-1">{t('gss_sec_desc')}</p>
      </div>

      {/* Password Policy */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-4">{t('gss_sec_password')}</h4>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Min Length (characters)</label>
            <input type="number" value={settings.minPasswordLength} onChange={(e) => setSettings(prev => ({ ...prev, minPasswordLength: e.target.value }))} className="w-32 px-3 py-2 border border-gray-300 rounded-lg outline-none" />
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={settings.requireUppercase} onChange={(e) => setSettings(prev => ({ ...prev, requireUppercase: e.target.checked }))} className="w-4 h-4 text-blue-600 rounded" />
              <span className="text-sm text-gray-700">Require uppercase letters</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={settings.requireNumbers} onChange={(e) => setSettings(prev => ({ ...prev, requireNumbers: e.target.checked }))} className="w-4 h-4 text-blue-600 rounded" />
              <span className="text-sm text-gray-700">Require numbers</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={settings.requireSymbols} onChange={(e) => setSettings(prev => ({ ...prev, requireSymbols: e.target.checked }))} className="w-4 h-4 text-blue-600 rounded" />
              <span className="text-sm text-gray-700">Require symbols</span>
            </label>
          </div>
        </div>
      </div>

      {/* Session Management */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-4">{t('gss_sec_session')}</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Session Timeout (minutes)</label>
            <input type="number" value={settings.sessionTimeout} onChange={(e) => setSettings(prev => ({ ...prev, sessionTimeout: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Max Login Attempts</label>
            <input type="number" value={settings.maxLoginAttempts} onChange={(e) => setSettings(prev => ({ ...prev, maxLoginAttempts: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Lockout Duration (minutes)</label>
            <input type="number" value={settings.lockoutDuration} onChange={(e) => setSettings(prev => ({ ...prev, lockoutDuration: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none" />
          </div>
        </div>
      </div>

      {/* 2FA */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-4">{t('gss_sec_2fa')}</h4>
        <label className="flex items-center gap-2 mb-4">
          <input type="checkbox" checked={settings.enable2FA} onChange={(e) => setSettings(prev => ({ ...prev, enable2FA: e.target.checked }))} className="w-4 h-4 text-blue-600 rounded" />
          <span className="text-sm font-medium text-gray-900">Enable 2FA for all users</span>
        </label>
        {settings.enable2FA && (
          <div className="space-y-2 pl-6">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={settings.twoFAMethods.email} onChange={(e) => setSettings(prev => ({ ...prev, twoFAMethods: { ...prev.twoFAMethods, email: e.target.checked } }))} className="w-4 h-4 text-blue-600 rounded" />
              <span className="text-sm text-gray-700">Email verification</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={settings.twoFAMethods.app} onChange={(e) => setSettings(prev => ({ ...prev, twoFAMethods: { ...prev.twoFAMethods, app: e.target.checked } }))} className="w-4 h-4 text-blue-600 rounded" />
              <span className="text-sm text-gray-700">Authenticator app</span>
            </label>
          </div>
        )}
      </div>

      {/* Audit Logging */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-4">{t('gss_sec_audit')}</h4>
        <div className="space-y-4">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={settings.enableAuditLog} onChange={(e) => setSettings(prev => ({ ...prev, enableAuditLog: e.target.checked }))} className="w-4 h-4 text-blue-600 rounded" />
            <span className="text-sm font-medium text-gray-900">Enable audit logging</span>
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">Log Retention (days)</label>
              <input type="number" value={settings.logRetention} onChange={(e) => setSettings(prev => ({ ...prev, logRetention: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none" />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={settings.logFailedLogins} onChange={(e) => setSettings(prev => ({ ...prev, logFailedLogins: e.target.checked }))} className="w-4 h-4 text-blue-600 rounded" />
                <span className="text-sm text-gray-700">Log failed login attempts</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Data Encryption */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-4">{t('gss_sec_encryption')}</h4>
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={settings.encryptDocuments} onChange={(e) => setSettings(prev => ({ ...prev, encryptDocuments: e.target.checked }))} className="w-4 h-4 text-blue-600 rounded" />
            <span className="text-sm text-gray-700">Encrypt documents (AES-256)</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={settings.encryptDatabase} onChange={(e) => setSettings(prev => ({ ...prev, encryptDatabase: e.target.checked }))} className="w-4 h-4 text-blue-600 rounded" />
            <span className="text-sm text-gray-700">Encrypt database</span>
          </label>
        </div>
      </div>

      <div className="flex justify-end">
        <button 
          onClick={handleSave} 
          disabled={saving}
          className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? t('gss_saving') : t('gss_save_changes')}
        </button>
      </div>
    </div>
  )
}

// Main Component
export default function GeneralSystemSettings() {
  const { t } = usePreferences()
  const [activeTab, setActiveTab] = useState('company')
  const [systemInfo, setSystemInfo] = useState({
    version: 'v1.0.5',
    totalUsers: 45,
    totalDocuments: 1234,
    storageUsed: '45 GB',
    databaseSize: '2.3 GB',
    capacityPercent: 45
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSystemInfo()
  }, [])

  const loadSystemInfo = async () => {
    setLoading(true)
    try {
      const res = await api.get('/system/info')
      // Backend returns: { success, message, data: { systemInfo: {...} } }
      const data = res.data.data?.systemInfo || res.data.systemInfo || {}
      
      setSystemInfo({
        version: data.version || 'v1.0.5',
        totalUsers: data.totalUsers || 0,
        totalDocuments: data.totalDocuments || 0,
        storageUsed: data.storageUsed || '0 GB',
        databaseSize: data.databaseSize || '0 GB',
        capacityPercent: data.capacityPercent || 0
      })
    } catch (error) {
      console.error('Failed to load system info:', error)
      // Show zeros when backend endpoint fails
      setSystemInfo({
        version: 'v1.0.5',
        totalUsers: 0,
        totalDocuments: 0,
        storageUsed: '0 KB',
        databaseSize: '0 KB',
        capacityPercent: 0
      })
    } finally {
      setLoading(false)
    }
  }

  const formatNumber = (num) => {
    return num?.toLocaleString() || '0'
  }

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h2 className="text-2xl font-bold text-gray-900">{t('gss_title')}</h2>
        <p className="text-sm text-gray-600 mt-1">{t('gss_title_desc')}</p>
        <p className="text-sm text-gray-600">{t('gss_title_desc2')}</p>
      </div>

      {/* System Info Panel */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">{t('gss_system_info')}</h3>
          <button
            onClick={loadSystemInfo}
            disabled={loading}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium disabled:text-gray-400 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {t('refresh')}
          </button>
        </div>
        
        {loading ? (
          <div className="text-center py-8 text-gray-500">{t('gss_loading_system')}</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{systemInfo.version}</div>
              <div className="text-xs text-gray-600 mt-1">{t('gss_version')}</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{formatNumber(systemInfo.totalUsers)}</div>
              <div className="text-xs text-gray-600 mt-1">{t('gss_total_users')}</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">{formatNumber(systemInfo.totalDocuments)}</div>
              <div className="text-xs text-gray-600 mt-1">{t('gss_documents')}</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">{systemInfo.storageUsed}</div>
              <div className="text-xs text-gray-600 mt-1">{t('gss_storage_used')}</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-red-600">{systemInfo.databaseSize}</div>
              <div className="text-xs text-gray-600 mt-1">{t('gss_database')}</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-cyan-600">{systemInfo.capacityPercent}%</div>
              <div className="text-xs text-gray-600 mt-1">{t('gss_capacity')}</div>
            </div>
          </div>
        )}
      </div>

      <div className="card p-6">
        <SubTabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
        
        {activeTab === 'company' && <CompanyInfo />}
        {activeTab === 'landing' && <LandingPageSettings />}
        {activeTab === 'theme' && <ThemeBranding />}
        {activeTab === 'document' && <DocumentSettings />}
        {activeTab === 'notification' && <NotificationSettings />}
        {activeTab === 'security' && <SecuritySettings />}
      </div>
    </div>
  )
}
