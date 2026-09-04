import React, { useState } from 'react'
import { usePreferences } from '../contexts/PreferencesContext'
import Modal, { ModalBody, ModalFooter, ModalHeader } from './ui/Modal'
import Button from './ui/Button'
import TextInput from './ui/TextInput'
import TextArea from './ui/TextArea'

export default function AcknowledgeDocumentModal({ document, onClose, onSubmit }) {
  const { t } = usePreferences()
  const [formData, setFormData] = useState({
    fileCode: document?.fileCode || '',
    documentTitle: document?.title || '',
    versionNo: document?.version || '',
    documentType: '',
    comments: '',
    acknowledgementDate: new Date().toISOString().split('T')[0] // Current date
  })

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }


  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit(formData)
  }

  return (
    <Modal onClose={onClose} size="md">
      <form onSubmit={handleSubmit}>
        <ModalHeader
          title={t('acknowledged_document')}
          subtitle={t('modal_draft_desc')}
          onClose={onClose}
        />

        <ModalBody className="space-y-4">
            {/* File Code */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                {t('file_code')}
              </label>
              <TextInput
                type="text"
                name="fileCode"
                value={formData.fileCode}
                className="bg-gray-50 text-gray-700"
                readOnly
              />
            </div>

            {/* Document Title & Version */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  {t('document_title_col')}
                </label>
                <TextInput
                  type="text"
                  name="documentTitle"
                  value={formData.documentTitle}
                  onChange={handleInputChange}
                  placeholder="Input text"
                  className="bg-gray-50 text-gray-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  {t('version_revision')}
                </label>
                <TextInput
                  type="text"
                  name="versionNo"
                  value={formData.versionNo}
                  onChange={handleInputChange}
                  placeholder="Input text"
                  className="bg-gray-50 text-gray-700"
                />
              </div>
            </div>

            {/* Document Type & Comments */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  {t('doc_type')}
                </label>
                <TextInput
                  type="text"
                  name="documentType"
                  value={formData.documentType}
                  onChange={handleInputChange}
                  placeholder="Input text"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  {t('comments_notes')}
                </label>
                <TextArea
                  name="comments"
                  value={formData.comments}
                  onChange={handleInputChange}
                  placeholder="Input text"
                  rows="1"
                  className="resize-none"
                />
              </div>
            </div>

            {/* Acknowledgement Date */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                {t('acknowledgement_date')}
              </label>
              <TextInput
                type="date"
                name="acknowledgementDate"
                value={formData.acknowledgementDate}
                onChange={handleInputChange}
                className="bg-gray-50 text-gray-700"
              />
            </div>
        </ModalBody>

        <ModalFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit">
            {t('acknowledged_btn')}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
