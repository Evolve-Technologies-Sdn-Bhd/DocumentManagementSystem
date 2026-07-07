const fs = require('fs').promises
const fsSync = require('fs')
const path = require('path')
const os = require('os')
const config = require('../config/app')
const libreOfficeConvertService = require('./libreOfficeConvertService')
const encryptionService = require('./encryptionService')
const { NotFoundError } = require('../utils/errors')

class PublicSharePreviewService {
  ensureSafeFileName(name) {
    return String(name || 'file')
      .replace(/[^A-Za-z0-9._-]/g, '_')
      .slice(0, 120) || 'file'
  }

  async fileExists(fp) {
    try {
      await fs.access(fp)
      return true
    } catch {
      return false
    }
  }

  resolveCachePaths({ documentId, versionId }) {
    const baseDir = path.join(config.uploadDir, 'public-previews')
    const safeDoc = this.ensureSafeFileName(`doc_${documentId}`)
    const safeVer = this.ensureSafeFileName(`ver_${versionId}`)
    const outDir = path.join(baseDir, safeDoc)
    const pdfPath = path.join(outDir, `${safeVer}.pdf`)
    return { outDir, pdfPath }
  }

  isPdfLike(version) {
    const mime = String(version?.mimeType || '').toLowerCase()
    const fileName = String(version?.fileName || '').toLowerCase()
    return mime.includes('pdf') || fileName.endsWith('.pdf')
  }

  isImageLike(version) {
    const mime = String(version?.mimeType || '').toLowerCase()
    const fileName = String(version?.fileName || '').toLowerCase()
    if (mime.startsWith('image/')) return true
    return ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'].some((ext) => fileName.endsWith(ext))
  }

  async writeTempInput({ version, absolutePath }) {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dms-public-share-'))
    const fileName = this.ensureSafeFileName(version?.fileName || `version_${version?.id || 'file'}`)
    const tempPath = path.join(tempDir, fileName)

    if (version?.isEncrypted) {
      const buf = await encryptionService.getDecryptedBuffer(absolutePath)
      await fs.writeFile(tempPath, buf)
      return { tempDir, tempPath }
    }

    const src = String(absolutePath || '').trim()
    await fs.copyFile(src, tempPath)
    return { tempDir, tempPath }
  }

  async cleanupTempDir(dir) {
    const d = String(dir || '').trim()
    if (!d) return
    try {
      await fs.rm(d, { recursive: true, force: true })
    } catch {}
  }

  async getPreview({ documentId, version, absolutePath }) {
    if (!absolutePath) throw new NotFoundError('File')

    if (this.isPdfLike(version)) {
      if (version?.isEncrypted) {
        const buf = await encryptionService.getDecryptedBuffer(absolutePath)
        return { mimeType: 'application/pdf', buffer: buf }
      }
      return { mimeType: 'application/pdf', absolutePath }
    }

    if (this.isImageLike(version)) {
      const mimeType = String(version?.mimeType || 'application/octet-stream')
      if (version?.isEncrypted) {
        const buf = await encryptionService.getDecryptedBuffer(absolutePath)
        return { mimeType, buffer: buf }
      }
      return { mimeType, absolutePath }
    }

    const { outDir, pdfPath } = this.resolveCachePaths({ documentId, versionId: version?.id })
    if (await this.fileExists(pdfPath)) {
      return { mimeType: 'application/pdf', absolutePath: pdfPath }
    }

    let temp = null
    try {
      temp = await this.writeTempInput({ version, absolutePath })

      const convertedCandidate = await libreOfficeConvertService.convertToPdf({
        inputPath: temp.tempPath,
        outputDir: outDir
      })

      if (convertedCandidate !== pdfPath) {
        if (await this.fileExists(convertedCandidate)) {
          await fs.mkdir(path.dirname(pdfPath), { recursive: true })
          await fs.rename(convertedCandidate, pdfPath)
        }
      }

      if (!fsSync.existsSync(pdfPath)) {
        throw new NotFoundError('Preview')
      }

      return { mimeType: 'application/pdf', absolutePath: pdfPath }
    } finally {
      await this.cleanupTempDir(temp?.tempDir)
    }
  }
}

module.exports = new PublicSharePreviewService()
