const prisma = require('../config/database')
const { ForbiddenError, BadRequestError, NotFoundError } = require('../utils/errors')
const divisionScopeService = require('./divisionScopeService')

class FolderPermissionService {
  isAdminRoleNames(roleNames) {
    const roles = Array.isArray(roleNames) ? roleNames : []
    return roles.some((r) => {
      const name = String(r || '').toLowerCase()
      if (!name) return false
      if (['admin', 'administrator', 'system administrator', 'system_admin', 'system-admin'].includes(name)) return true
      return name.includes('administrator') || name.includes('admin')
    })
  }

  async getRoleIdsByNames(roleNames) {
    const names = (Array.isArray(roleNames) ? roleNames : []).map((r) => String(r || '')).filter(Boolean)
    if (names.length === 0) return []
    const roles = await prisma.role.findMany({
      where: { name: { in: names } },
      select: { id: true }
    })
    return roles.map((r) => r.id)
  }

  async getFolderById(folderId) {
    const id = parseInt(folderId, 10)
    const folder = await prisma.folder.findUnique({
      where: { id },
      select: {
        id: true,
        parentId: true,
        createdById: true,
        accessMode: true,
        inheritPermissions: true
      }
    })
    if (!folder) throw new NotFoundError('Folder')
    return folder
  }

  async getEffectivePermissionsMap(folderIds, userId, roleIds) {
    const ids = Array.isArray(folderIds) ? folderIds.map((x) => parseInt(x, 10)).filter((x) => Number.isFinite(x)) : []
    if (ids.length === 0) return new Map()
    const uid = userId ? parseInt(userId, 10) : null
    const rids = Array.isArray(roleIds) ? roleIds.map((x) => parseInt(x, 10)).filter((x) => Number.isFinite(x)) : []
    const perms = await prisma.folderPermission.findMany({
      where: {
        folderId: { in: ids },
        OR: [
          uid ? { userId: uid } : null,
          rids.length > 0 ? { roleId: { in: rids } } : null
        ].filter(Boolean)
      }
    })
    const byFolder = new Map()
    for (const p of perms) {
      if (!byFolder.has(p.folderId)) byFolder.set(p.folderId, [])
      byFolder.get(p.folderId).push(p)
    }
    return byFolder
  }

  hasActionFromPermRows(rows, action) {
    const a = String(action || '').toLowerCase()
    for (const r of rows || []) {
      if (a === 'view' && r.canView) return true
      if (a === 'create' && r.canCreate) return true
      if (a === 'edit' && r.canEdit) return true
      if (a === 'delete' && r.canDelete) return true
      if (a === 'download' && r.canDownload) return true
    }
    return false
  }

  async canUser(folderId, user, action) {
    const folder = await this.getFolderById(folderId)
    const roleNames = user?.roles || []

    if (user?.permissions?.all === true) return true
    if (this.isAdminRoleNames(roleNames)) return true

    const isPublic = await this._isFolderOrAncestorPublic(folder)
    if (isPublic) return true

    const withinDivisionScope = await divisionScopeService.canUserAccessFolder(user, folder.id)
    if (!withinDivisionScope) return false

    const roleIds = await this.getRoleIdsByNames(roleNames)
    const folderIds = []
    const parentById = new Map()
    let cur = folder
    while (cur) {
      folderIds.push(cur.id)
      if (!cur.inheritPermissions) break
      if (!cur.parentId) break
      const parent = await this.getFolderById(cur.parentId)
      parentById.set(cur.id, parent.id)
      cur = parent
    }

    const permMap = await this.getEffectivePermissionsMap(folderIds, user?.id, roleIds)
    for (const id of folderIds) {
      const rows = permMap.get(id) || []
      if (rows.length > 0) {
        return this.hasActionFromPermRows(rows, action)
      }
    }
    return false
  }

  async _isFolderOrAncestorPublic(startFolder) {
    let cur = startFolder
    while (cur) {
      if (divisionScopeService.isPublicAccessMode(cur.accessMode)) return true
      if (!cur.inheritPermissions) break
      if (!cur.parentId) break
      cur = await this.getFolderById(cur.parentId).catch(() => null)
    }
    return false
  }

  async assertCan(folderId, user, action) {
    const ok = await this.canUser(folderId, user, action)
    if (!ok) throw new ForbiddenError(`You don't have permission to ${action} in this folder`)
    return true
  }

  async assertCanManage(folderId, user) {
    const folder = await this.getFolderById(folderId)
    if (user?.permissions?.all === true) return true
    const withinDivisionScope = await divisionScopeService.canUserAccessFolder(user, folder.id)
    if (!withinDivisionScope) throw new ForbiddenError(`You don't have permission to manage this folder`)
    if (this.isAdminRoleNames(user?.roles || [])) return true
    if (folder.createdById === user?.id) return true
    throw new ForbiddenError(`You don't have permission to manage this folder`)
  }

  async getFolderAccessConfig(folderId) {
    const folder = await prisma.folder.findUnique({
      where: { id: parseInt(folderId, 10) },
      select: { id: true, accessMode: true, inheritPermissions: true, createdById: true }
    })
    if (!folder) throw new NotFoundError('Folder')
    const permissions = await prisma.folderPermission.findMany({
      where: { folderId: folder.id },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        role: { select: { id: true, name: true, displayName: true } }
      },
      orderBy: { id: 'asc' }
    })
    return { folder, permissions }
  }

  normalizeAccessPayload(payload) {
    const mode = String(payload?.accessMode || 'PUBLIC').toUpperCase()
    if (!['PUBLIC', 'RESTRICTED'].includes(mode)) {
      const err = new BadRequestError('Invalid accessMode')
      err.code = 'INVALID_ACCESS_MODE'
      throw err
    }
    const inheritPermissions = payload?.inheritPermissions === undefined ? true : Boolean(payload.inheritPermissions)
    const entries = Array.isArray(payload?.entries) ? payload.entries : []
    const normalized = []
    for (const e of entries) {
      const subjectType = String(e?.subjectType || '').toUpperCase()
      const subjectId = e?.subjectId ? parseInt(e.subjectId, 10) : null
      if (!subjectId || !['USER', 'ROLE'].includes(subjectType)) continue
      normalized.push({
        subjectType,
        subjectId,
        canView: Boolean(e?.canView),
        canCreate: Boolean(e?.canCreate),
        canEdit: Boolean(e?.canEdit),
        canDelete: Boolean(e?.canDelete),
        canDownload: Boolean(e?.canDownload)
      })
    }
    return { accessMode: mode, inheritPermissions, entries: normalized }
  }

  async setFolderAccessConfig(folderId, actor, payload) {
    const folder = await prisma.folder.findUnique({
      where: { id: parseInt(folderId, 10) },
      select: { id: true, createdById: true }
    })
    if (!folder) throw new NotFoundError('Folder')

    const normalized = this.normalizeAccessPayload(payload)

    await prisma.$transaction(async (tx) => {
      await tx.folder.update({
        where: { id: folder.id },
        data: {
          accessMode: normalized.accessMode,
          inheritPermissions: normalized.inheritPermissions
        }
      })

      if (normalized.accessMode === 'PUBLIC') {
        await tx.folderPermission.deleteMany({ where: { folderId: folder.id } })
        return
      }

      await tx.folderPermission.deleteMany({ where: { folderId: folder.id } })
      for (const e of normalized.entries) {
        await tx.folderPermission.create({
          data: {
            folderId: folder.id,
            userId: e.subjectType === 'USER' ? e.subjectId : null,
            roleId: e.subjectType === 'ROLE' ? e.subjectId : null,
            canView: e.canView,
            canCreate: e.canCreate,
            canEdit: e.canEdit,
            canDelete: e.canDelete,
            canDownload: e.canDownload
          }
        })
      }
    })
    return this.getFolderAccessConfig(folder.id)
  }

  async listSubjects(query = '') {
    const q = String(query || '').trim()
    const whereUser = q ? {
      OR: [
        { email: { contains: q } },
        { firstName: { contains: q } },
        { lastName: { contains: q } }
      ],
      status: 'ACTIVE'
    } : { status: 'ACTIVE' }

    const [users, roles] = await Promise.all([
      prisma.user.findMany({
        where: whereUser,
        select: { id: true, firstName: true, lastName: true, email: true },
        take: 50,
        orderBy: { email: 'asc' }
      }),
      prisma.role.findMany({
        where: q ? {
          OR: [
            { name: { contains: q } },
            { displayName: { contains: q } }
          ]
        } : undefined,
        select: { id: true, name: true, displayName: true },
        take: 50,
        orderBy: { name: 'asc' }
      })
    ])

    return { users, roles }
  }
}

module.exports = new FolderPermissionService()
