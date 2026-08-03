const express = require('express')
const { authenticate } = require('../middleware/auth')
const { ForbiddenError } = require('../utils/errors')
const { createUploadMiddleware } = require('../middleware/upload')
const crmTenderController = require('../controllers/crmTenderController')
const crmFbEnquiryController = require('../controllers/crmFbEnquiryController')

const router = express.Router()

router.use(authenticate)

const requirePermission = (moduleKey, action) => {
  return (req, _res, next) => {
    if (req.user?.permissions?.all === true) return next()
    const allowed = !!req.user?.permissions?.[moduleKey]?.[action]
    if (!allowed) {
      return next(new ForbiddenError("You don't have permission to perform this action"))
    }
    next()
  }
}

const requireAnyPermission = (moduleKey, actions) => {
  return (req, _res, next) => {
    if (req.user?.permissions?.all === true) return next()
    const allowed = (actions || []).some((action) => !!req.user?.permissions?.[moduleKey]?.[action])
    if (!allowed) {
      return next(new ForbiddenError("You don't have permission to perform this action"))
    }
    next()
  }
}

router.get('/tender-book', requireAnyPermission('crm.tenderBook', ['view', 'create', 'update', 'delete', 'import', 'export']), crmTenderController.list)
router.get('/tender-book/summary', requireAnyPermission('crm.tenderBook', ['view', 'create', 'update', 'delete', 'import', 'export']), crmTenderController.summary)
router.post('/tender-book', requirePermission('crm.tenderBook', 'create'), crmTenderController.create)
router.put('/tender-book/:id', requirePermission('crm.tenderBook', 'update'), crmTenderController.update)
router.delete('/tender-book/:id', requirePermission('crm.tenderBook', 'delete'), crmTenderController.remove)
router.get('/tender-book/:id/assignees', requireAnyPermission('crm.tenderBook', ['view', 'update']), crmTenderController.getAssignees)
router.put('/tender-book/:id/assignees', requirePermission('crm.tenderBook', 'update'), crmTenderController.setAssignees)
router.get('/tender-book/:id/follow-ups', requireAnyPermission('crm.tenderBook', ['view', 'update']), crmTenderController.listFollowUps)
router.post('/tender-book/:id/follow-ups', requirePermission('crm.tenderBook', 'update'), crmTenderController.addFollowUp)
router.post('/tender-book/import', requirePermission('crm.tenderBook', 'import'), crmTenderController.importEntries)
router.post('/tender-book/import-file', requirePermission('crm.tenderBook', 'import'), createUploadMiddleware('file'), crmTenderController.importFile)
router.get('/tender-book/template', requirePermission('crm.tenderBook', 'import'), crmTenderController.template)
router.get('/tender-book/export', requirePermission('crm.tenderBook', 'export'), crmTenderController.exportCsv)

router.get('/fb-enquiries', requireAnyPermission('crm.fbEnquiry', ['view', 'create', 'update', 'delete', 'import', 'export']), crmFbEnquiryController.list)
router.get('/fb-enquiries/summary', requireAnyPermission('crm.fbEnquiry', ['view', 'create', 'update', 'delete', 'import', 'export']), crmFbEnquiryController.summary)
router.post('/fb-enquiries', requirePermission('crm.fbEnquiry', 'create'), crmFbEnquiryController.create)
router.put('/fb-enquiries/:id', requirePermission('crm.fbEnquiry', 'update'), crmFbEnquiryController.update)
router.delete('/fb-enquiries/:id', requirePermission('crm.fbEnquiry', 'delete'), crmFbEnquiryController.remove)
router.get('/fb-enquiries/:id/assignees', requireAnyPermission('crm.fbEnquiry', ['view', 'update']), crmFbEnquiryController.getAssignees)
router.put('/fb-enquiries/:id/assignees', requirePermission('crm.fbEnquiry', 'update'), crmFbEnquiryController.setAssignees)
router.get('/fb-enquiries/:id/follow-ups', requireAnyPermission('crm.fbEnquiry', ['view', 'update']), crmFbEnquiryController.listFollowUps)
router.post('/fb-enquiries/:id/follow-ups', requirePermission('crm.fbEnquiry', 'update'), crmFbEnquiryController.addFollowUp)
router.post('/fb-enquiries/import', requirePermission('crm.fbEnquiry', 'import'), crmFbEnquiryController.importEntries)
router.post('/fb-enquiries/import-file', requirePermission('crm.fbEnquiry', 'import'), createUploadMiddleware('file'), crmFbEnquiryController.importFile)
router.get('/fb-enquiries/template', requirePermission('crm.fbEnquiry', 'import'), crmFbEnquiryController.template)
router.get('/fb-enquiries/export', requirePermission('crm.fbEnquiry', 'export'), crmFbEnquiryController.export)

module.exports = router
