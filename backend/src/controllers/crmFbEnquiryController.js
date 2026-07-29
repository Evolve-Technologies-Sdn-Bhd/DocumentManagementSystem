const ResponseFormatter = require('../utils/responseFormatter')
const asyncHandler = require('../utils/asyncHandler')
const crmFbEnquiryService = require('../services/crmFbEnquiryService')

class CrmFbEnquiryController {
  list = asyncHandler(async (req, res) => {
    const data = await crmFbEnquiryService.list(req.query)
    return ResponseFormatter.success(res, data, 'FB enquiry entries retrieved successfully')
  })

  summary = asyncHandler(async (req, res) => {
    const summary = await crmFbEnquiryService.summary(req.query)
    return ResponseFormatter.success(res, { summary }, 'FB enquiry summary retrieved successfully')
  })

  create = asyncHandler(async (req, res) => {
    const data = await crmFbEnquiryService.create({
      userId: req.user?.id,
      payload: req.body
    })
    return ResponseFormatter.success(res, data, 'FB enquiry entry created successfully')
  })

  update = asyncHandler(async (req, res) => {
    const data = await crmFbEnquiryService.update({
      id: req.params?.id,
      payload: req.body
    })
    return ResponseFormatter.success(res, data, 'FB enquiry entry updated successfully')
  })

  remove = asyncHandler(async (req, res) => {
    const data = await crmFbEnquiryService.remove({ id: req.params?.id })
    return ResponseFormatter.success(res, data, 'FB enquiry entry deleted successfully')
  })

  importEntries = asyncHandler(async (req, res) => {
    const data = await crmFbEnquiryService.importEntries({
      userId: req.user?.id,
      entries: req.body?.entries
    })
    return ResponseFormatter.success(res, data, 'FB enquiry entries imported successfully')
  })

  exportCsv = asyncHandler(async (req, res) => {
    const { csv } = await crmFbEnquiryService.exportCsv(req.query)
    const fileName = `fb_enquiries_${new Date().toISOString().split('T')[0]}.csv`
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    return res.status(200).send(csv)
  })
}

module.exports = new CrmFbEnquiryController()

