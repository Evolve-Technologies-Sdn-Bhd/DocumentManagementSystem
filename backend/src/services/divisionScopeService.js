const prisma = require('../config/database')
const { ForbiddenError } = require('../utils/errors')

class DivisionScopeService {
  isAdminUser(user) {
    if (!user) return false
    if (user.permissions?.all === true) return true
    const roles = Array.isArray(user.roles) ? user.roles : []
    return roles.some((r) => {
      const name = String(r || '').toLowerCase()
      if (!name) return false
      if ([
        'admin', 'administrator', 'system administrator', 'system_admin', 'system-admin',
        'document_controller', 'reviewer', 'approver'
      ].includes(name)) return true
      return name.includes('administrator') || name.includes('admin')
        || name.includes('document_controller') || name.includes('controller')
    })
  }

  isPublicAccessMode(accessMode) {
    return String(accessMode || 'PUBLIC').toUpperCase() === 'PUBLIC'
  }

  normalizeDivisionIds(divisionIds = []) {
    return Array.from(new Set((Array.isArray(divisionIds) ? divisionIds : []).map((id) => Number.parseInt(id, 10)).filter((id) => Number.isFinite(id))))
  }

  async getUserDivisionIds(userId) {
    const normalizedUserId = Number.parseInt(userId, 10)
    if (!Number.isFinite(normalizedUserId)) return []

    const rows = await prisma.userDivision.findMany({
      where: { userId: normalizedUserId },
      select: { divisionId: true }
    })

    return this.normalizeDivisionIds(rows.map((row) => row.divisionId))
  }

  async getPrimaryDivisionIdForUser(user) {
    const divisionIds = Array.isArray(user?.divisionIds) && user.divisionIds.length > 0
      ? this.normalizeDivisionIds(user.divisionIds)
      : await this.getUserDivisionIds(user?.id)

    return divisionIds[0] || null
  }

  // Only Administrator and Document Controller may move items across companies.
  isCrossCompanyMovePrivileged(user) {
    const roles = Array.isArray(user?.roles) ? user.roles : []
    const privilegedRoles = new Set([
      'admin',
      'administrator',
      'system_administrator',
      'system_admin',
      'document_controller'
    ])

    return roles.some((role) => {
      const normalized = String(role || '')
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_')

      return privilegedRoles.has(normalized)
    })
  }

  sameDivisionScope(sourceIds, destinationIds) {
    const source = this.normalizeDivisionIds(sourceIds).sort((a, b) => a - b)
    const destination = this.normalizeDivisionIds(destinationIds).sort((a, b) => a - b)

    return source.length > 0
      && source.length === destination.length
      && source.every((id, index) => id === destination[index])
  }

  async assertFolderMoveWithinCompany(sourceFolderIds, destinationFolderId, user) {
    if (this.isCrossCompanyMovePrivileged(user)) return true

    const folderGraph = await this.getFolderGraph()
    const destinationId = Number.parseInt(destinationFolderId, 10)
    const destination = Number.isFinite(destinationId)
      ? folderGraph.get(destinationId)
      : null

    if (!destination) {
      throw new ForbiddenError('You can only move folders within the same company. The destination company could not be verified.')
    }

    const cache = new Map()
    const destinationDivisionIds = this.resolveEffectiveFolderDivisionIds(
      destinationId,
      folderGraph,
      cache
    )

    if (destinationDivisionIds.length === 0) {
      throw new ForbiddenError('You can only move folders within the same company. The destination company could not be verified.')
    }

    const childrenByParent = new Map()
    for (const folder of folderGraph.values()) {
      if (!folder.parentId) continue
      if (!childrenByParent.has(folder.parentId)) {
        childrenByParent.set(folder.parentId, [])
      }
      childrenByParent.get(folder.parentId).push(folder.id)
    }

    const visited = new Set()
    const pending = (Array.isArray(sourceFolderIds) ? sourceFolderIds : [])
      .map((id) => Number.parseInt(id, 10))
      .filter(Number.isFinite)

    while (pending.length > 0) {
      const folderId = pending.pop()
      if (visited.has(folderId)) continue
      visited.add(folderId)

      const folder = folderGraph.get(folderId)
      if (!folder) {
        throw new ForbiddenError('One or more source folders could not be verified.')
      }

      const sourceDivisionIds = this.resolveEffectiveFolderDivisionIds(
        folderId,
        folderGraph,
        cache
      )

      if (!this.sameDivisionScope(sourceDivisionIds, destinationDivisionIds)) {
        throw new ForbiddenError('You can only move folders within the same company. Contact an Administrator or Document Controller for cross-company movement.')
      }

      pending.push(...(childrenByParent.get(folderId) || []))
    }

    return true
  }

  async assertDocumentMoveWithinCompany(documents, destinationFolderId, user) {
    if (this.isCrossCompanyMovePrivileged(user)) return true

    const folderGraph = await this.getFolderGraph()
    const destinationId = Number.parseInt(destinationFolderId, 10)
    const destination = Number.isFinite(destinationId)
      ? folderGraph.get(destinationId)
      : null

    if (!destination) {
      throw new ForbiddenError('You can only move documents within the same company. The destination company could not be verified.')
    }

    const cache = new Map()
    const destinationDivisionIds = this.resolveEffectiveFolderDivisionIds(
      destinationId,
      folderGraph,
      cache
    )

    if (destinationDivisionIds.length === 0) {
      throw new ForbiddenError('You can only move documents within the same company. The destination company could not be verified.')
    }

    for (const document of documents || []) {
      let sourceDivisionIds = document.folderId
        ? this.resolveEffectiveFolderDivisionIds(document.folderId, folderGraph, cache)
        : []

      if (document.divisionId !== null && document.divisionId !== undefined) {
        const documentDivisionId = Number.parseInt(document.divisionId, 10)

        if (!Number.isFinite(documentDivisionId)) {
          throw new ForbiddenError('The document company could not be verified.')
        }

        if (
          sourceDivisionIds.length > 0
          && !sourceDivisionIds.includes(documentDivisionId)
        ) {
          throw new ForbiddenError('The document company does not match its source folder.')
        }

        if (sourceDivisionIds.length === 0) {
          sourceDivisionIds = [documentDivisionId]
        }
      }

      if (!this.sameDivisionScope(sourceDivisionIds, destinationDivisionIds)) {
        throw new ForbiddenError('You can only move documents within the same company. Contact an Administrator or Document Controller for cross-company movement.')
      }
    }

    return true
  }

  async getFolderGraph() {
    const folders = await prisma.folder.findMany({
      select: {
        id: true,
        parentId: true,
        accessMode: true,
        inheritPermissions: true,
        divisions: {
          select: { divisionId: true }
        }
      }
    })

    const byId = new Map()
    for (const folder of folders) {
      byId.set(folder.id, {
        id: folder.id,
        parentId: folder.parentId,
        accessMode: folder.accessMode,
        inheritPermissions: Boolean(folder.inheritPermissions),
        divisionIds: Array.from(new Set((folder.divisions || []).map((entry) => entry.divisionId).filter((id) => Number.isFinite(id))))
      })
    }

    return byId
  }

  isFolderPubliclyAccessible(folderId, folderGraph, cache = new Map()) {
    const normalizedFolderId = Number.parseInt(folderId, 10)
    if (!Number.isFinite(normalizedFolderId)) return false
    if (cache.has(normalizedFolderId)) return cache.get(normalizedFolderId)

    const folder = folderGraph.get(normalizedFolderId)
    if (!folder) {
      cache.set(normalizedFolderId, false)
      return false
    }

    if (this.isPublicAccessMode(folder.accessMode)) {
      cache.set(normalizedFolderId, true)
      return true
    }

    if (folder.inheritPermissions && folder.parentId) {
      const parentPublic = this.isFolderPubliclyAccessible(folder.parentId, folderGraph, cache)
      cache.set(normalizedFolderId, parentPublic)
      return parentPublic
    }

    cache.set(normalizedFolderId, false)
    return false
  }

  resolveEffectiveFolderDivisionIds(folderId, folderGraph, cache = new Map()) {
    const normalizedFolderId = Number.parseInt(folderId, 10)
    if (!Number.isFinite(normalizedFolderId)) return []
    if (cache.has(normalizedFolderId)) return cache.get(normalizedFolderId)

    const folder = folderGraph.get(normalizedFolderId)
    if (!folder) {
      cache.set(normalizedFolderId, [])
      return []
    }

    if (folder.divisionIds.length > 0) {
      cache.set(normalizedFolderId, folder.divisionIds)
      return folder.divisionIds
    }

    if (!folder.inheritPermissions || !folder.parentId) {
      cache.set(normalizedFolderId, [])
      return []
    }

    const resolved = this.resolveEffectiveFolderDivisionIds(folder.parentId, folderGraph, cache)
    cache.set(normalizedFolderId, resolved)
    return resolved
  }

  async getEffectiveFolderDivisionIds(folderId) {
    const folderGraph = await this.getFolderGraph()
    return this.resolveEffectiveFolderDivisionIds(folderId, folderGraph, new Map())
  }

  async getAccessibleFolderIdsForDivisionIds(divisionIds = []) {
    const normalizedDivisionIds = this.normalizeDivisionIds(divisionIds)
    const targetDivisions = new Set(normalizedDivisionIds)
    const folderGraph = await this.getFolderGraph()
    const effectiveCache = new Map()
    const publicCache = new Map()
    const accessibleIds = []

    for (const folder of folderGraph.values()) {
      if (this.isFolderPubliclyAccessible(folder.id, folderGraph, publicCache)) {
        accessibleIds.push(folder.id)
        continue
      }
      if (targetDivisions.size === 0) continue
      const effectiveDivisionIds = this.resolveEffectiveFolderDivisionIds(folder.id, folderGraph, effectiveCache)
      if (effectiveDivisionIds.some((divisionId) => targetDivisions.has(divisionId))) {
        accessibleIds.push(folder.id)
      }
    }

    return accessibleIds
  }

  async getAccessibleFolderIdsForUser(user) {
    if (this.isAdminUser(user)) {
      const rows = await prisma.folder.findMany({ select: { id: true } })
      return rows.map((r) => r.id)
    }

    const divisionIds = Array.isArray(user?.divisionIds) && user.divisionIds.length > 0
      ? this.normalizeDivisionIds(user.divisionIds)
      : await this.getUserDivisionIds(user?.id)

    return this.getAccessibleFolderIdsForDivisionIds(divisionIds)
  }

  async canUserAccessFolder(user, folderId) {
    if (this.isAdminUser(user)) return true

    const normalizedFolderId = Number.parseInt(folderId, 10)
    if (!Number.isFinite(normalizedFolderId)) return false

    const folderGraph = await this.getFolderGraph()

    if (this.isFolderPubliclyAccessible(normalizedFolderId, folderGraph, new Map())) {
      return true
    }

    const userDivisionIds = Array.isArray(user?.divisionIds) && user.divisionIds.length > 0
      ? this.normalizeDivisionIds(user.divisionIds)
      : await this.getUserDivisionIds(user?.id)

    if (userDivisionIds.length === 0) return false

    const effectiveDivisionIds = this.resolveEffectiveFolderDivisionIds(normalizedFolderId, folderGraph, new Map())
    if (effectiveDivisionIds.length === 0) return false

    const allowed = new Set(userDivisionIds)
    return effectiveDivisionIds.some((divisionId) => allowed.has(divisionId))
  }

  async canUserManageFolder(user, folderId, suppliedFolderGraph = null) {
    if (user?.permissions?.all === true) return true
    if (this.isCrossCompanyMovePrivileged(user)) return true

    if (user?.permissions?.documents?.published?.manageAccess !== true) {
      return false
    }

    const normalizedFolderId = Number.parseInt(folderId, 10)
    if (!Number.isFinite(normalizedFolderId)) return false

    const folderGraph = suppliedFolderGraph || await this.getFolderGraph()
    if (!folderGraph.has(normalizedFolderId)) return false

    const userDivisionIds = Array.isArray(user?.divisionIds) && user.divisionIds.length > 0
      ? this.normalizeDivisionIds(user.divisionIds)
      : await this.getUserDivisionIds(user?.id)

    if (userDivisionIds.length === 0) return false

    const folderDivisionIds = this.resolveEffectiveFolderDivisionIds(
      normalizedFolderId,
      folderGraph,
      new Map()
    )

    if (folderDivisionIds.length === 0) return false

    const allowed = new Set(userDivisionIds)
    return folderDivisionIds.some((divisionId) => allowed.has(divisionId))
  }

  async buildAccessibleDocumentWhere(user, extraWhere = {}) {
    if (this.isAdminUser(user)) return extraWhere

    const folderGraph = await this.getFolderGraph()
    const publicCache = new Map()
    const publicFolderIds = []
    for (const folder of folderGraph.values()) {
      if (this.isFolderPubliclyAccessible(folder.id, folderGraph, publicCache)) {
        publicFolderIds.push(folder.id)
      }
    }

    const divisionIds = Array.isArray(user?.divisionIds) && user.divisionIds.length > 0
      ? this.normalizeDivisionIds(user.divisionIds)
      : await this.getUserDivisionIds(user?.id)

    const accessibleFolderIds = await this.getAccessibleFolderIdsForUser(user)

    if (accessibleFolderIds.length === 0 && divisionIds.length === 0 && publicFolderIds.length === 0) {
      return {
        AND: [
          extraWhere,
          { id: { in: [] } }
        ]
      }
    }

    return {
      AND: [
        extraWhere,
        {
          OR: [
            { folderId: { in: accessibleFolderIds } },
            publicFolderIds.length > 0 ? { folderId: { in: publicFolderIds } } : null,
            {
              AND: [
                { folderId: null },
                { divisionId: { in: divisionIds } }
              ]
            }
          ].filter(Boolean)
        }
      ]
    }
  }
}

module.exports = new DivisionScopeService()
