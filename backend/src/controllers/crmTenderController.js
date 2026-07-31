const ResponseFormatter = require('../utils/responseFormatter')
const asyncHandler = require('../utils/asyncHandler')
const crmTenderService = require('../services/crmTenderService')

class CrmTenderController {
  list = asyncHandler(async (req, res) => {
    const data = await crmTenderService.list(req.query)
    return ResponseFormatter.success(res, data, 'Tender entries retrieved successfully')
  })

  summary = asyncHandler(async (req, res) => {
    const summary = await crmTenderService.summary(req.query)
    return ResponseFormatter.success(res, { summary }, 'Tender summary retrieved successfully')
  })

  create = asyncHandler(async (req, res) => {
    const data = await crmTenderService.create({
      userId: req.user?.id,
      payload: req.body
    })
    return ResponseFormatter.success(res, data, 'Tender entry created successfully')
  })

  update = asyncHandler(async (req, res) => {
    const data = await crmTenderService.update({
      id: req.params?.id,
      payload: req.body
    })
    return ResponseFormatter.success(res, data, 'Tender entry updated successfully')
  })

  remove = asyncHandler(async (req, res) => {
    const data = await crmTenderService.remove({ id: req.params?.id })
    return ResponseFormatter.success(res, data, 'Tender entry deleted successfully')
  })

  importEntries = asyncHandler(async (req, res) => {
    const data = await crmTenderService.importEntries({
      userId: req.user?.id,
      entries: req.body?.entries
    })
    return ResponseFormatter.success(res, data, 'Tender entries imported successfully')
  })

  importFile = asyncHandler(async (req, res) => {
    const data = await crmTenderService.importFile({
      userId: req.user?.id,
      filePath: req.file?.path,
      originalName: req.file?.originalname
    })
    return ResponseFormatter.success(res, data, 'Tender entries imported successfully')
  })

  template = asyncHandler(async (_req, res) => {
    const { buffer } = await crmTenderService.exportTemplateXlsx()
    const fileName = 'tender_book_template.xlsx'
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    return res.status(200).send(Buffer.from(buffer))
  })

  exportCsv = asyncHandler(async (req, res) => {
    const format = String(req.query?.format || 'csv').toLowerCase()
    if (format === 'xlsx') {
      const { buffer } = await crmTenderService.exportXlsx(req.query)
      const fileName = `tender_book_${new Date().toISOString().split('T')[0]}.xlsx`
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
      return res.status(200).send(Buffer.from(buffer))
    }

    const { csv } = await crmTenderService.exportCsv(req.query)
    const fileName = `tender_book_${new Date().toISOString().split('T')[0]}.csv`
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    return res.status(200).send(csv)
  })
}

module.exports = new CrmTenderController()
