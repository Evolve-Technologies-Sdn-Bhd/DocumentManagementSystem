const asyncHandler = require('../utils/asyncHandler')
const documentShareLinkService = require('../services/documentShareLinkService')
const auditLogService = require('../services/auditLogService')
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
  previewSharedDocument = asyncHandler(async (req, res) => {
    const token = String(req.params.token || '').trim()
    const { link, document, version } = await documentShareLinkService.resolvePublicToken({ token })

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

    res.setHeader('Content-Type', version.mimeType)
    const rawFileName = String(version.fileName || 'document')
    const asciiFileName = rawFileName.replace(/[^A-Za-z0-9._-]/g, '_') || 'document'
    const encodedFileName = encodeURIComponent(rawFileName)
    res.setHeader('Content-Disposition', `inline; filename="${asciiFileName}"; filename*=UTF-8''${encodedFileName}`)

    if (version.isEncrypted) {
      const encryptionService = require('../services/encryptionService')
      const decryptedBuffer = await encryptionService.getDecryptedBuffer(absolutePath)
      return res.send(decryptedBuffer)
    }

    return res.sendFile(absolutePath)
  })
}

module.exports = new PublicShareController()

