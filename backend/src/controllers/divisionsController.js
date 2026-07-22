const prisma = require('../config/database')
const ResponseFormatter = require('../utils/responseFormatter')
const asyncHandler = require('../utils/asyncHandler')

class DivisionsController {
  listDivisions = asyncHandler(async (req, res) => {
    const divisions = await prisma.division.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }, { id: 'asc' }]
    })

    return ResponseFormatter.success(res, { divisions }, 'Divisions retrieved successfully')
  })

  createDivision = asyncHandler(async (req, res) => {
    const code = String(req.body?.code || '').trim()
    const name = String(req.body?.name || '').trim()
    const isActive = req.body?.isActive === undefined ? true : Boolean(req.body.isActive)

    if (!code || !name) {
      return ResponseFormatter.error(res, 'Missing required fields: code and name are required', 400)
    }

    const existing = await prisma.division.findUnique({ where: { code } })
    if (existing) {
      return ResponseFormatter.error(res, 'Division code already exists', 409)
    }

    const division = await prisma.division.create({
      data: { code, name, isActive }
    })

    return ResponseFormatter.success(res, { division }, 'Division created successfully')
  })

  updateDivision = asyncHandler(async (req, res) => {
    const divisionId = Number.parseInt(req.params.id, 10)
    if (Number.isNaN(divisionId)) {
      return ResponseFormatter.error(res, 'Invalid division id', 400)
    }

    const data = {}
    if (req.body?.code !== undefined) data.code = String(req.body.code || '').trim()
    if (req.body?.name !== undefined) data.name = String(req.body.name || '').trim()
    if (req.body?.isActive !== undefined) data.isActive = Boolean(req.body.isActive)

    if (data.code === '' || data.name === '') {
      return ResponseFormatter.error(res, 'code/name cannot be empty', 400)
    }

    const division = await prisma.division.update({
      where: { id: divisionId },
      data
    })

    return ResponseFormatter.success(res, { division }, 'Division updated successfully')
  })

  deleteDivision = asyncHandler(async (req, res) => {
    const divisionId = Number.parseInt(req.params.id, 10)
    if (Number.isNaN(divisionId)) {
      return ResponseFormatter.error(res, 'Invalid division id', 400)
    }

    const usage = await prisma.userDivision.count({ where: { divisionId } })
    const folderUsage = await prisma.folderDivision.count({ where: { divisionId } })

    if (usage > 0 || folderUsage > 0) {
      return ResponseFormatter.error(
        res,
        'Division is in use by users/folders. Remove mappings first before deleting.',
        409
      )
    }

    await prisma.division.delete({ where: { id: divisionId } })
    return ResponseFormatter.success(res, {}, 'Division deleted successfully')
  })

  getUserDivisions = asyncHandler(async (req, res) => {
    const userId = Number.parseInt(req.params.userId, 10)
    if (Number.isNaN(userId)) {
      return ResponseFormatter.error(res, 'Invalid user id', 400)
    }

    const rows = await prisma.userDivision.findMany({
      where: { userId },
      include: { division: true },
      orderBy: [{ divisionId: 'asc' }]
    })

    return ResponseFormatter.success(
      res,
      { divisions: rows.map((r) => r.division) },
      'User divisions retrieved successfully'
    )
  })

  setUserDivisions = asyncHandler(async (req, res) => {
    const userId = Number.parseInt(req.params.userId, 10)
    if (Number.isNaN(userId)) {
      return ResponseFormatter.error(res, 'Invalid user id', 400)
    }

    const divisionIds = Array.isArray(req.body?.divisionIds) ? req.body.divisionIds : null
    if (!divisionIds) {
      return ResponseFormatter.error(res, 'divisionIds must be an array', 400)
    }

    const normalizedDivisionIds = [...new Set(divisionIds.map((v) => Number.parseInt(v, 10)).filter((v) => Number.isFinite(v)))]

    await prisma.$transaction(async (tx) => {
      await tx.userDivision.deleteMany({ where: { userId } })
      if (normalizedDivisionIds.length > 0) {
        await tx.userDivision.createMany({
          data: normalizedDivisionIds.map((divisionId) => ({ userId, divisionId })),
          skipDuplicates: true
        })
      }
    })

    const rows = await prisma.userDivision.findMany({
      where: { userId },
      include: { division: true },
      orderBy: [{ divisionId: 'asc' }]
    })

    return ResponseFormatter.success(
      res,
      { divisions: rows.map((r) => r.division) },
      'User divisions updated successfully'
    )
  })

  getFolderDivisions = asyncHandler(async (req, res) => {
    const folderId = Number.parseInt(req.params.folderId, 10)
    if (Number.isNaN(folderId)) {
      return ResponseFormatter.error(res, 'Invalid folder id', 400)
    }

    const rows = await prisma.folderDivision.findMany({
      where: { folderId },
      include: { division: true },
      orderBy: [{ divisionId: 'asc' }]
    })

    return ResponseFormatter.success(
      res,
      { divisions: rows.map((r) => r.division) },
      'Folder divisions retrieved successfully'
    )
  })

  setFolderDivisions = asyncHandler(async (req, res) => {
    const folderId = Number.parseInt(req.params.folderId, 10)
    if (Number.isNaN(folderId)) {
      return ResponseFormatter.error(res, 'Invalid folder id', 400)
    }

    const divisionIds = Array.isArray(req.body?.divisionIds) ? req.body.divisionIds : null
    if (!divisionIds) {
      return ResponseFormatter.error(res, 'divisionIds must be an array', 400)
    }

    const normalizedDivisionIds = [...new Set(divisionIds.map((v) => Number.parseInt(v, 10)).filter((v) => Number.isFinite(v)))]

    await prisma.$transaction(async (tx) => {
      await tx.folderDivision.deleteMany({ where: { folderId } })
      if (normalizedDivisionIds.length > 0) {
        await tx.folderDivision.createMany({
          data: normalizedDivisionIds.map((divisionId) => ({ folderId, divisionId })),
          skipDuplicates: true
        })
      }
    })

    const rows = await prisma.folderDivision.findMany({
      where: { folderId },
      include: { division: true },
      orderBy: [{ divisionId: 'asc' }]
    })

    return ResponseFormatter.success(
      res,
      { divisions: rows.map((r) => r.division) },
      'Folder divisions updated successfully'
    )
  })
}

module.exports = {
  divisionsController: new DivisionsController()
}

