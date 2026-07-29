const express = require('express')
const { authenticate } = require('../middleware/auth')
const { ForbiddenError } = require('../utils/errors')
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
router.post('/tender-book/import', requirePermission('crm.tenderBook', 'import'), crmTenderController.importEntries)
router.get('/tender-book/export', requirePermission('crm.tenderBook', 'export'), crmTenderController.exportCsv)

router.get('/fb-enquiries', requireAnyPermission('crm.fbEnquiry', ['view', 'create', 'update', 'delete', 'import', 'export']), crmFbEnquiryController.list)
router.get('/fb-enquiries/summary', requireAnyPermission('crm.fbEnquiry', ['view', 'create', 'update', 'delete', 'import', 'export']), crmFbEnquiryController.summary)
router.post('/fb-enquiries', requirePermission('crm.fbEnquiry', 'create'), crmFbEnquiryController.create)
router.put('/fb-enquiries/:id', requirePermission('crm.fbEnquiry', 'update'), crmFbEnquiryController.update)
router.delete('/fb-enquiries/:id', requirePermission('crm.fbEnquiry', 'delete'), crmFbEnquiryController.remove)
router.post('/fb-enquiries/import', requirePermission('crm.fbEnquiry', 'import'), crmFbEnquiryController.importEntries)
router.get('/fb-enquiries/export', requirePermission('crm.fbEnquiry', 'export'), crmFbEnquiryController.exportCsv)

module.exports = router

