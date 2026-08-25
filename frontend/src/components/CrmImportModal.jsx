import React, { useMemo, useRef, useState } from 'react'
import Modal, { ModalBody, ModalFooter, ModalHeader } from './ui/Modal'
import AppSurface from './ui/AppSurface'
import Button from './ui/Button'
import api from '../api/axios'

export default function CrmImportModal({
  open,
  title,
  subtitle,
  templateDownloadUrl,
  templateDownloadFileName,
  templateHeaders = [],
  templateSampleRow = [],
  accept = '.csv,text/csv',
  chooseButtonLabel = 'Choose File',
  dropLabel = 'Drag & drop file here',
  onClose,
  onImportFile
}) {
  const fileInputRef = useRef(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [importing, setImporting] = useState(false)
  const [dragActive, setDragActive] = useState(false)

  const templatePreview = useMemo(() => {
    const headers = Array.isArray(templateHeaders) ? templateHeaders : []
    const sample = Array.isArray(templateSampleRow) ? templateSampleRow : []
    return [headers.join(','), sample.join(',')].filter(Boolean).join('\n')
  }, [templateHeaders, templateSampleRow])

  if (!open) return null

  const handlePickFile = () => {
    if (!fileInputRef.current) return
    fileInputRef.current.value = ''
    fileInputRef.current.click()
  }

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] || null
    setSelectedFile(file)
  }

  const handleDrop = (event) => {
    event.preventDefault()
    event.stopPropagation()
    setDragActive(false)
    const file = event.dataTransfer?.files?.[0] || null
    if (file) setSelectedFile(file)
  }

  const handleDownloadTemplate = async () => {
    if (templateDownloadUrl) {
      const res = await api.get(templateDownloadUrl, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', templateDownloadFileName || 'import_template.xlsx')
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      return
    }
    const blob = new Blob([templatePreview], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', templateDownloadFileName || 'import_template.csv')
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  }

  const handleImport = async () => {
    if (!selectedFile || !onImportFile) return
    setImporting(true)
    try {
      await onImportFile(selectedFile)
      setSelectedFile(null)
    } finally {
      setImporting(false)
    }
  }

  return (
    <Modal onClose={onClose} closeOnBackdrop size="md">
      <ModalHeader
        title={title}
        subtitle={subtitle}
        onClose={onClose}
      />

      <ModalBody className="space-y-4">
        <AppSurface variant="panel" padding="md" className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={handleFileChange}
          />
          <div className="text-sm font-semibold text-gray-900">Selected file</div>

          <div
            onDragEnter={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setDragActive(true)
            }}
            onDragOver={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setDragActive(true)
            }}
            onDragLeave={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setDragActive(false)
            }}
            onDrop={handleDrop}
            className={[
              'rounded-lg border border-dashed px-4 py-6 text-center text-sm',
              dragActive ? 'border-blue-500 bg-blue-50 text-gray-900' : 'border-gray-300 bg-gray-50 text-gray-500'
            ].join(' ')}
          >
            <div className="font-medium text-gray-900">{selectedFile ? selectedFile.name : dropLabel}</div>
            <div className="mt-1 text-xs text-gray-500">or select a file from your computer</div>
            <div className="mt-4 flex justify-center">
              <Button variant="secondary" onClick={handlePickFile}>
                {chooseButtonLabel}
              </Button>
            </div>
          </div>
        </AppSurface>
      </ModalBody>

      <ModalFooter className="justify-between">
        <Button variant="secondary" onClick={handleDownloadTemplate}>
          Download Template
        </Button>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={onClose} disabled={importing}>
            Cancel
          </Button>
          <Button onClick={handleImport} loading={importing} disabled={!selectedFile} loadingText="Importing...">
            Import Records
          </Button>
        </div>
      </ModalFooter>
    </Modal>
  )
}
