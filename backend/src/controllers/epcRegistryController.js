const ResponseFormatter = require('../utils/responseFormatter')
const asyncHandler = require('../utils/asyncHandler')
const epcRegistryService = require('../services/epcRegistryService')

class EpcRegistryController {
  getStatus = asyncHandler(async (_req, res) => {
    const enabled = await epcRegistryService.isEnabled()
    return ResponseFormatter.success(res, { enabled }, 'EPC registry status retrieved successfully')
  })

  listRecords = asyncHandler(async (req, res) => {
    const data = await epcRegistryService.listRecords(req.query)
    return ResponseFormatter.success(res, data, 'EPC registry records retrieved successfully')
  })

  searchRecords = asyncHandler(async (req, res) => {
    const query = req.query?.query ?? ''
    const projectCategoryId = req.query?.projectCategoryId ?? null

    if (!projectCategoryId) {
      return ResponseFormatter.validationError(res, [
        { field: 'projectCategoryId', message: 'projectCategoryId diperlukan' }
      ])
    }

    if (!String(query).trim()) {
      return ResponseFormatter.validationError(res, [
        { field: 'query', message: 'query diperlukan' }
      ])
    }

    const data = await epcRegistryService.searchRecords({
      query,
      projectCategoryId,
      limit: req.query?.limit
    })

    return ResponseFormatter.success(res, data, 'EPC registry search completed successfully')
  })

  lookupByEpcHexes = asyncHandler(async (req, res) => {
    const projectCategoryId = req.body?.projectCategoryId ?? null
    const epcHexes = req.body?.epcHexes ?? null

    if (!projectCategoryId) {
      return ResponseFormatter.validationError(res, [
        { field: 'projectCategoryId', message: 'projectCategoryId diperlukan' }
      ])
    }

    if (!Array.isArray(epcHexes) || epcHexes.length === 0) {
      return ResponseFormatter.validationError(res, [
        { field: 'epcHexes', message: 'epcHexes diperlukan' }
      ])
    }

    const data = await epcRegistryService.lookupByEpcHexes({
      epcHexes,
      projectCategoryId,
      limit: req.body?.limit
    })

    return ResponseFormatter.success(res, data, 'EPC registry lookup completed successfully')
  })

  exportRecords = asyncHandler(async (req, res) => {
    const { csv } = await epcRegistryService.exportRecords(req.query)
    const fileName = `epc_registry_${new Date().toISOString().split('T')[0]}.csv`
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    return res.status(200).send(csv)
  })

  checkIn = asyncHandler(async (req, res) => {
    const epcHex = req.body?.epcHex ?? null
    const fileCode = req.body?.fileCode ?? null

    if (!epcHex && !fileCode) {
      return ResponseFormatter.validationError(res, [
        { field: 'epcHex', message: 'epcHex atau fileCode diperlukan' }
      ])
    }

    const record = await epcRegistryService.updateTrackingStatus({
      epcHex,
      fileCode,
      trackingStatus: 'CHECK_IN',
      userId: req.user?.id || null,
      req
    })

    return ResponseFormatter.success(res, { record }, 'Document checked-in successfully')
  })

  checkOut = asyncHandler(async (req, res) => {
    const epcHex = req.body?.epcHex ?? null
    const fileCode = req.body?.fileCode ?? null

    if (!epcHex && !fileCode) {
      return ResponseFormatter.validationError(res, [
        { field: 'epcHex', message: 'epcHex atau fileCode diperlukan' }
      ])
    }

    const record = await epcRegistryService.updateTrackingStatus({
      epcHex,
      fileCode,
      trackingStatus: 'CHECK_OUT',
      userId: req.user?.id || null,
      req
    })

    return ResponseFormatter.success(res, { record }, 'Document checked-out successfully')
  })

  archive = asyncHandler(async (req, res) => {
    const epcHex = req.body?.epcHex ?? null
    const fileCode = req.body?.fileCode ?? null

    if (!epcHex && !fileCode) {
      return ResponseFormatter.validationError(res, [
        { field: 'epcHex', message: 'epcHex atau fileCode diperlukan' }
      ])
    }

    const record = await epcRegistryService.updateTrackingStatus({
      epcHex,
      fileCode,
      trackingStatus: 'ARCHIVE',
      userId: req.user?.id || null,
      req
    })

    return ResponseFormatter.success(res, { record }, 'Document archived successfully')
  })
}

module.exports = new EpcRegistryController()
