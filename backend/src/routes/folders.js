const express = require('express');
const folderController = require('../controllers/folderController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Folder CRUD operations
router.get('/', folderController.listFolders);
router.get('/access/subjects', folderController.listAccessSubjects);
router.post('/', folderController.createFolder);
router.post('/bulk-move', folderController.bulkMoveFolders);
router.put('/:id', folderController.updateFolder);
router.delete('/:id/purge', authorize('admin', 'Admin', 'Administrator', 'ADMIN'), folderController.purgeFolder);
router.delete('/:id', folderController.deleteFolder);

// Get documents in a folder
router.get('/:id/documents', folderController.getFolderDocuments);
router.get('/:id/download', folderController.downloadFolder);
router.get('/:id/access', folderController.getFolderAccess);
router.put('/:id/access', folderController.updateFolderAccess);

module.exports = router;
