const express = require('express')
const expiryTrackingController = require('../controllers/expiryTrackingController')
const { authenticate } = require('../middleware/auth')
const { uploadDocument } = require('../middleware/upload')
const { ForbiddenError } = require('../utils/errors')

const router = express.Router()

router.use(authenticate)

const requirePermission = (action) => {
  return (req, _res, next) => {
    if (req.user?.permissions?.all === true) return next()
    const allowed = Boolean(req.user?.permissions?.expiryTracking?.[action])
    if (!allowed) {
      return next(new ForbiddenError("You don't have permission to perform this action"))
    }
    next()
  }
}

const requireAnyPermission = (actions) => {
  return (req, _res, next) => {
    if (req.user?.permissions?.all === true) return next()
    const allowed = (actions || []).some((action) => Boolean(req.user?.permissions?.expiryTracking?.[action]))
    if (!allowed) {
      return next(new ForbiddenError("You don't have permission to perform this action"))
    }
    next()
  }
}

router.get('/', requirePermission('view'), expiryTrackingController.listProfiles)
router.get('/dashboard', requirePermission('view'), expiryTrackingController.getDashboard)
router.get('/export', requireAnyPermission(['view', 'export']), expiryTrackingController.exportRecords)
router.post('/from-document/:documentId', requirePermission('edit'), expiryTrackingController.syncFromDocument)
router.get('/:documentId', requirePermission('view'), expiryTrackingController.getProfile)
router.get('/:documentId/watchers', requirePermission('view'), expiryTrackingController.getWatchers)
router.put('/:documentId/watchers', requirePermission('edit'), expiryTrackingController.updateWatchers)
router.patch('/:documentId', requirePermission('edit'), expiryTrackingController.updateProfile)
router.post('/:documentId/renew/start', requirePermission('renew'), expiryTrackingController.startRenewal)
router.post('/:documentId/renew/reject', requirePermission('renew'), expiryTrackingController.rejectRenewal)
router.post('/:documentId/renew/complete', requirePermission('renew'), uploadDocument.single('file'), expiryTrackingController.completeRenewal)
router.post('/:documentId/disable', requirePermission('edit'), expiryTrackingController.disableTracking)
router.post('/:documentId/enable', requirePermission('edit'), expiryTrackingController.enableTracking)

module.exports = router
