const express = require('express')
const { authenticate } = require('../middleware/auth')
const { divisionsController } = require('../controllers/divisionsController')

const router = express.Router()

router.use(authenticate)

router.get('/', divisionsController.listDivisions)
router.post('/', divisionsController.createDivision)
router.put('/:id', divisionsController.updateDivision)
router.delete('/:id', divisionsController.deleteDivision)

router.get('/users/:userId', divisionsController.getUserDivisions)
router.put('/users/:userId', divisionsController.setUserDivisions)

router.get('/folders/:folderId', divisionsController.getFolderDivisions)
router.put('/folders/:folderId', divisionsController.setFolderDivisions)

module.exports = router

