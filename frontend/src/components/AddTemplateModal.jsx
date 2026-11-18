import React, { useState, useRef, useMemo, useEffect } from 'react'
import Modal, { ModalHeader, ModalBody, ModalFooter } from './ui/Modal'
import api from '../api/axios'

export default function AddTemplateModal({ onClose, onSubmit, initialData, documentTypes = [] }) {
  const [formData, setFormData] = useState({
    documentType: initialData?.documentType || '',
    templateName: initialData?.templateName || '',
    version: initialData?.version || '',
    prefixCode: initialData?.prefixCode || ''
  })
  const [templateNameTouched, setTemplateNameTouched] = useState(!!initialData?.templateName)
  const [files, setFiles] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const [documentTypesData, setDocumentTypesData] = useState([])
  const fileInputRef = useRef(null)

  // Fetch document types with prefix data from master data
  useEffect(() => {
    const fetchDocumentTypes = async () => {
      try {
        const res = await api.get('/system/config/document-types')
        setDocumentTypesData(res.data.data.documentTypes || [])
      } catch (error) {
        console.error('Failed to load document types:', error)
        // Fallback to props data if API fails
        if (documentTypes.length > 0) {
          setDocumentTypesData(documentTypes.map(name => ({ name, prefix: '' })))
        }
      }
    }
    fetchDocumentTypes()
  }, [])

  const docTypeOptions = useMemo(() => {
    const types = documentTypesData.map(dt => dt.name) || []
    const currentType = formData.documentType ? [formData.documentType] : []
    const unique = Array.from(new Set([...types, ...currentType].filter(Boolean)))
    return unique
  }, [documentTypesData, formData.documentType])

  const handleInputChange = (e) => {
    const { name, value } = e.target
    if (name === 'templateName') setTemplateNameTouched(true)
    
    // If document type is changed, auto-populate prefix code
    if (name === 'documentType') {
      const selectedDocType = documentTypesData.find(dt => dt.name === value)
      setFormData(prev => ({ 
        ...prev, 
        [name]: value,
        prefixCode: selectedDocType?.prefix || prev.prefixCode
      }))
    } else {
      setFormData(prev => ({ ...prev, [name]: value }))
    }
  }

  const fileNameToTemplateName = (fileName) => {
    const dot = fileName.lastIndexOf('.')
    const base = dot > 0 ? fileName.slice(0, dot) : fileName
    return base.trim()
  }

  const allowedTemplateExtensions = ['.docx', '.dotx', '.xlsx', '.xltx', '.csv', '.pptx']

  const validateAndSetFile = (selectedFiles) => {
    if (!selectedFiles.length) return

    if (selectedFiles.length > 1) {
      alert('Please select only one template file.')
      return
    }

    const selectedFile = selectedFiles[0]
    const ext = selectedFile.name.toLowerCase().substring(selectedFile.name.lastIndexOf('.'))

    if (!allowedTemplateExtensions.includes(ext)) {
      alert('Invalid file type. Only DOCX, DOTX, XLSX, XLTX, CSV, and PPTX files are allowed.')
      return
    }

    if (!templateNameTouched) {
      const derived = fileNameToTemplateName(selectedFile.name)
      if (derived) {
        setFormData(prev => ({ ...prev, templateName: derived }))
      }
    }

    // Backend accepts one file; replace any previously selected file.
    setFiles([selectedFile])
  }

  const handleFileSelect = (e) => {
    validateAndSetFile(Array.from(e.target.files || []))
    e.target.value = ''
  }

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true) }
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false) }
  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    validateAndSetFile(Array.from(e.dataTransfer.files || []))
  }

  const handleRemoveFile = (index) => { setFiles(prev => prev.filter((_, i) => i !== index)) }
  const handleBrowseClick = () => { fileInputRef.current?.click() }

  const handleSubmit = () => {
    if (!formData.documentType || !formData.templateName || !formData.version || !formData.prefixCode || files.length === 0) {
      alert('Please fill in all fields and upload at least one file')
      return
    }
    onSubmit({ ...formData, files })
  }

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const modal = (
    <Modal isOpen size="xl" onClose={onClose}>
        <ModalHeader
          title="Add / Reupload New Template"
          subtitle="These templates ensure consistency in formatting and file naming when users create new documents via the NDR (New Document Request) flow."
          onClose={onClose}
        />

        {/* Form Content */}
        <ModalBody className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">Document Type <span className="text-red-500">*</span></label>
              <select
                name="documentType"
                value={formData.documentType}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
              >
                <option value="">Select document type</option>
                {docTypeOptions.map((dt) => (
                  <option key={dt} value={dt}>{dt}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">Template Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                name="templateName"
                value={formData.templateName}
                onChange={handleInputChange}
                placeholder="Enter template name"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">Template Version <span className="text-red-500">*</span></label>
              <input
                type="text"
                name="version"
                value={formData.version}
                onChange={handleInputChange}
                placeholder="Enter version (e.g., 1.0)"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">Prefix Code <span className="text-red-500">*</span></label>
              <input
                type="text"
                name="prefixCode"
                value={formData.prefixCode}
                onChange={handleInputChange}
                placeholder="Enter prefix code (e.g., PP, PRA)"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-gray-50"
                readOnly={!!formData.documentType && documentTypesData.find(dt => dt.name === formData.documentType)?.prefix}
              />
              {formData.documentType && (
                <p className="mt-1.5 text-xs text-gray-500">
                  {documentTypesData.find(dt => dt.name === formData.documentType)?.prefix 
                    ? 'Auto-populated from document type master data' 
                    : 'Please enter prefix code manually'}
                </p>
              )}
            </div>
          </div>

          {/* Upload Area */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Upload File(s) <span className="text-red-500">*</span></label>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50'}`}
            >
              <div className="flex flex-col items-center">
                <div className="text-gray-400 mb-4">
                  <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <p className="text-gray-700 font-medium mb-1">Drop files here</p>
                <p className="text-sm text-gray-500 mb-3">Supported formats: DOCX, DOTX, XLSX, XLTX, CSV, PPTX</p>
                <div className="text-sm text-gray-500 mb-3">OR</div>
                <button type="button" onClick={handleBrowseClick} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors">Browse files</button>
                <input ref={fileInputRef} type="file" accept=".docx,.dotx,.xlsx,.xltx,.csv,.pptx" onChange={handleFileSelect} className="hidden" />
              </div>
            </div>

            {files.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium text-gray-700">Selected Files ({files.length})</p>
                {files.map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="text-blue-600 flex-shrink-0">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                        <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                      </div>
                    </div>
                    <button onClick={() => handleRemoveFile(index)} className="ml-3 p-1 rounded transition-colors text-gray-400 hover:text-gray-600 flex-shrink-0" title="Remove file">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ModalBody>

        {/* Footer */}
        <ModalFooter>
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors">Cancel</button>
          <button onClick={handleSubmit} className="px-4 py-2 text-sm font-medium text-white bg-[#003366] rounded-lg hover:bg-[#002244] transition-colors">Submit</button>
        </ModalFooter>
    </Modal>
  )

  return modal
}
