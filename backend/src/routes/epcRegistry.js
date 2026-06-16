const express = require('express')
const epcRegistryController = require('../controllers/epcRegistryController')
const { authenticate } = require('../middleware/auth')
const { ForbiddenError } = require('../utils/errors')

const router = express.Router()

router.use(authenticate)

const requirePermission = (moduleKey, action) => {
  return (req, _res, next) => {
    const allowed = !!req.user?.permissions?.[moduleKey]?.[action]
    if (!allowed) {
      return next(new ForbiddenError("You don't have permission to perform this action"))
    }
    next()
  }
}

router.get('/status', epcRegistryController.getStatus)
router.get('/', epcRegistryController.listRecords)
router.get('/search', epcRegistryController.searchRecords)
router.post('/lookup', epcRegistryController.lookupByEpcHexes)
router.get('/export', epcRegistryController.exportRecords)
router.post('/tracking/check-in', requirePermission('documents.rfidRegistry', 'manage'), epcRegistryController.checkIn)
router.post('/tracking/check-out', requirePermission('documents.rfidRegistry', 'manage'), epcRegistryController.checkOut)
router.post('/tracking/archive', requirePermission('documents.rfidRegistry', 'manage'), epcRegistryController.archive)

module.exports = router
