const crypto = require('crypto')
const prisma = require('../config/database')
const { BadRequestError, NotFoundError } = require('../utils/errors')

class DocumentShareLinkService {
  generateToken() {
    return crypto.randomBytes(32).toString('base64url')
  }

  hashToken(token) {
    const raw = String(token || '')
    if (!raw) throw new BadRequestError('Invalid share token')
    return crypto.createHash('sha256').update(raw).digest('hex')
  }

  normalizeExpiresAt(expiresAt, defaultDays = 7) {
    if (!expiresAt) {
      return new Date(Date.now() + defaultDays * 24 * 60 * 60 * 1000)
    }

    const parsed = new Date(expiresAt)
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestError('Invalid expiresAt')
    }
    if (parsed.getTime() <= Date.now()) {
      throw new BadRequestError('Expiry must be in the future')
    }
    return parsed
  }

  async createLink({ documentId, createdById, expiresAt }) {
    const token = this.generateToken()
    const tokenHash = this.hashToken(token)
    const normalizedExpiresAt = this.normalizeExpiresAt(expiresAt, 7)

    const link = await prisma.documentShareLink.create({
      data: {
        documentId,
        createdById,
        tokenHash,
        expiresAt: normalizedExpiresAt
      }
    })

    return { link, token }
  }

  async listLinks({ documentId }) {
    return prisma.documentShareLink.findMany({
      where: { documentId },
      orderBy: [{ revokedAt: 'asc' }, { expiresAt: 'desc' }, { id: 'desc' }]
    })
  }

  async revokeLink({ documentId, linkId }) {
    const id = parseInt(linkId, 10)
    if (!Number.isFinite(id)) throw new BadRequestError('Invalid linkId')

    const link = await prisma.documentShareLink.findFirst({
      where: { id, documentId }
    })
    if (!link) throw new NotFoundError('Share link')

    if (link.revokedAt) return link

    return prisma.documentShareLink.update({
      where: { id: link.id },
      data: { revokedAt: new Date() }
    })
  }

  async resolvePublicToken({ token, trackAccess = true }) {
    const tokenHash = this.hashToken(token)
    const now = new Date()

    const link = await prisma.documentShareLink.findUnique({
      where: { tokenHash },
      include: {
        document: {
          select: {
            id: true,
            fileCode: true,
            title: true,
            status: true,
            stage: true,
            isConfidential: true
          }
        }
      }
    })

    if (!link || !link.document) throw new NotFoundError('Share link')
    if (link.revokedAt) throw new NotFoundError('Share link')
    if (link.expiresAt && link.expiresAt.getTime() <= now.getTime()) throw new NotFoundError('Share link')

    const status = String(link.document.status || '').toUpperCase()
    const stage = String(link.document.stage || '').toUpperCase()
    if (status !== 'PUBLISHED' && stage !== 'PUBLISHED') {
      throw new NotFoundError('Share link')
    }
    if (link.document.isConfidential) {
      throw new NotFoundError('Share link')
    }

    const version = await prisma.documentVersion.findFirst({
      where: { documentId: link.document.id },
      orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }]
    })
    if (!version) throw new NotFoundError('Document version')

    if (trackAccess) {
      await prisma.documentShareLink.update({
        where: { id: link.id },
        data: {
          accessCount: { increment: 1 },
          lastAccessedAt: now
        }
      })
    }

    return { link, document: link.document, version }
  }
}

module.exports = new DocumentShareLinkService()
