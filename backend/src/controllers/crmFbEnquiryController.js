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
      actorUserId: req.user?.id,
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

  export = asyncHandler(async (req, res) => {
    const format = String(req.query?.format || 'csv').toLowerCase()
    if (format === 'xlsx') {
      const { buffer } = await crmFbEnquiryService.exportXlsx(req.query)
      const fileName = `fb_enquiries_${new Date().toISOString().split('T')[0]}.xlsx`
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
      return res.status(200).send(Buffer.from(buffer))
    }

    const { csv } = await crmFbEnquiryService.exportCsv(req.query)
    const fileName = `fb_enquiries_${new Date().toISOString().split('T')[0]}.csv`
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    return res.status(200).send(csv)
  })

  importFile = asyncHandler(async (req, res) => {
    const data = await crmFbEnquiryService.importFile({
      userId: req.user?.id,
      filePath: req.file?.path,
      originalName: req.file?.originalname
    })
    return ResponseFormatter.success(res, data, 'FB enquiry entries imported successfully')
  })

  getAssignees = asyncHandler(async (req, res) => {
    const data = await crmFbEnquiryService.getAssignees({ id: req.params?.id })
    return ResponseFormatter.success(res, data, 'FB enquiry assignees retrieved successfully')
  })

  setAssignees = asyncHandler(async (req, res) => {
    const data = await crmFbEnquiryService.setAssignees({
      id: req.params?.id,
      actorUserId: req.user?.id,
      userIds: req.body?.userIds
    })
    return ResponseFormatter.success(res, data, 'FB enquiry assignees updated successfully')
  })

  listFollowUps = asyncHandler(async (req, res) => {
    const data = await crmFbEnquiryService.listFollowUps({ id: req.params?.id })
    return ResponseFormatter.success(res, data, 'FB enquiry follow-ups retrieved successfully')
  })

  addFollowUp = asyncHandler(async (req, res) => {
    const data = await crmFbEnquiryService.addFollowUp({
      id: req.params?.id,
      actorUserId: req.user?.id,
      payload: req.body
    })
    return ResponseFormatter.success(res, data, 'FB enquiry follow-up added successfully')
  })
}

module.exports = new CrmFbEnquiryController()
