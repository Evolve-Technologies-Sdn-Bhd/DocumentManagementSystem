const asyncHandler = require('../utils/asyncHandler')
const documentShareLinkService = require('../services/documentShareLinkService')
const auditLogService = require('../services/auditLogService')
const publicSharePreviewService = require('../services/publicSharePreviewService')
const path = require('path')
const fs = require('fs')
const config = require('../config/app')

const resolveExistingFilePath = (storedPath) => {
  const raw = String(storedPath || '').trim()
  if (!raw) return null

  const forward = raw.replace(/\\/g, '/')
  const normalized = path.normalize(forward)

  const candidates = []

  if (path.isAbsolute(normalized)) {
    candidates.push(normalized)
  } else {
    candidates.push(path.resolve(process.cwd(), normalized))

    const srcDir = path.resolve(__dirname, '..')
    const backendDir = path.resolve(__dirname, '..', '..')
    candidates.push(path.resolve(srcDir, normalized))
    candidates.push(path.resolve(backendDir, normalized))

    if (String(config?.uploadDir || '').trim()) {
      candidates.push(path.resolve(config.uploadDir, normalized))
    }
  }

  const uploadMarker = '/uploads/'
  const uploadIdx = forward.lastIndexOf(uploadMarker)
  if (uploadIdx >= 0 && String(config?.uploadDir || '').trim()) {
    const suffix = forward.slice(uploadIdx + uploadMarker.length).replace(/^\/+/, '')
    candidates.push(path.join(config.uploadDir, suffix))
  }

  const leadingUploads = forward.replace(/^\.\//, '')
  if ((leadingUploads.startsWith('uploads/') || leadingUploads.startsWith('uploads\\')) && String(config?.uploadDir || '').trim()) {
    const suffix = leadingUploads.replace(/^uploads[\\/]/, '').replace(/^\/+/, '')
    candidates.push(path.join(config.uploadDir, suffix))
  }

  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) return p
    } catch {}
  }

  return null
}

class PublicShareController {
  getSharedDocumentMeta = asyncHandler(async (req, res) => {
    const token = String(req.params.token || '').trim()
    const { link, document, version } = await documentShareLinkService.resolvePublicToken({ token, trackAccess: false })

    return res.json({
      success: true,
      message: 'Share link resolved successfully',
      data: {
        link: {
          id: link.id,
          documentId: link.documentId,
          expiresAt: link.expiresAt,
          revokedAt: link.revokedAt,
          lastAccessedAt: link.lastAccessedAt,
          accessCount: link.accessCount
        },
        document: {
          id: document.id,
          fileCode: document.fileCode,
          title: document.title
        },
        version: {
          id: version.id,
          fileName: version.fileName,
          mimeType: version.mimeType
        }
      }
    })
  })

  previewSharedDocument = asyncHandler(async (req, res) => {
    const token = String(req.params.token || '').trim()
    const { link, document, version } = await documentShareLinkService.resolvePublicToken({ token, trackAccess: true })

    const absolutePath = resolveExistingFilePath(version.filePath)
    if (!absolutePath) {
      const { NotFoundError } = require('../utils/errors')
      throw new NotFoundError('File')
    }

    await auditLogService.log({
      userId: null,
      action: 'PUBLIC_SHARE_PREVIEW',
      entity: 'Document',
      entityId: document.id,
      description: `public preview via share linkId=${link.id}`,
      metadata: {
        documentId: document.id,
        shareLinkId: link.id
      },
      ipAddress: auditLogService.getClientIP(req),
      userAgent: req?.headers?.['user-agent']
    })

    res.setHeader('Cache-Control', 'no-store')
    const resolved = await publicSharePreviewService.getPreview({
      documentId: document.id,
      version,
      absolutePath
    })

    res.setHeader('Content-Type', resolved.mimeType)
    const rawFileName = resolved.mimeType === 'application/pdf'
      ? `${String(version.fileName || 'document').replace(/\.[^/.]+$/, '') || 'document'}.pdf`
      : String(version.fileName || 'document')
    const asciiFileName = rawFileName.replace(/[^A-Za-z0-9._-]/g, '_') || 'document'
    const encodedFileName = encodeURIComponent(rawFileName)
    res.setHeader('Content-Disposition', `inline; filename="${asciiFileName}"; filename*=UTF-8''${encodedFileName}`)

    if (resolved?.buffer) {
      return res.send(resolved.buffer)
    }

    return res.sendFile(resolved.absolutePath)
  })
}

module.exports = new PublicShareController()
