const express = require('express');
const projectTrackingController = require('../controllers/projectTrackingController');
const { authenticate } = require('../middleware/auth');
const { ForbiddenError } = require('../utils/errors');

const router = express.Router();

router.use(authenticate);

const requirePermission = (moduleKey, action) => {
  return (req, res, next) => {
    const allowed = !!req.user?.permissions?.[moduleKey]?.[action];
    if (!allowed) {
      return next(new ForbiddenError("You don't have permission to perform this action"));
    }
    next();
  };
};

router.get('/projects', requirePermission('projectTracking', 'view'), projectTrackingController.listProjects);
router.post('/projects', requirePermission('projectTracking', 'create'), projectTrackingController.createProject);
router.get('/projects/:projectId', requirePermission('projectTracking', 'view'), projectTrackingController.getProject);
router.post('/projects/:projectId/iterations', requirePermission('projectTracking', 'create'), projectTrackingController.createIteration);
router.put('/projects/:projectId', requirePermission('projectTracking', 'edit'), projectTrackingController.updateProject);
router.delete('/projects/:projectId', requirePermission('projectTracking', 'delete'), projectTrackingController.deleteProject);

router.get('/iterations/:iterationId/items', requirePermission('projectTracking', 'view'), projectTrackingController.listIterationItems);
router.get('/iterations/:iterationId/stage-documents', requirePermission('projectTracking', 'view'), projectTrackingController.listIterationStageDocuments);
router.post('/items/:itemId/link-document', requirePermission('projectTracking', 'linkDocument'), projectTrackingController.linkDocumentToItem);
router.post('/items/:itemId/create-document', requirePermission('projectTracking', 'create'), projectTrackingController.createDocumentFromItem);
router.post('/iterations/:iterationId/advance-stage', requirePermission('projectTracking', 'advanceStage'), projectTrackingController.advanceIterationStage);
router.post('/iterations/:iterationId/stages/:stageId/link-document', requirePermission('projectTracking', 'linkDocument'), projectTrackingController.linkDocumentToStage);
router.post('/iterations/:iterationId/stages/:stageId/create-document', requirePermission('projectTracking', 'create'), projectTrackingController.createDocumentForStage);

router.get('/documents/search', requirePermission('projectTracking', 'view'), projectTrackingController.searchDocuments);

router.get('/categories/:projectCategoryId/stages', requirePermission('projectTracking', 'manageTemplates'), projectTrackingController.getCategoryStages);
router.post('/categories/:projectCategoryId/stages', requirePermission('projectTracking', 'manageTemplates'), projectTrackingController.createCategoryStage);
router.put('/categories/:projectCategoryId/stages', requirePermission('projectTracking', 'manageTemplates'), projectTrackingController.updateCategoryStages);

router.get('/categories/:projectCategoryId/requirements', requirePermission('projectTracking', 'manageTemplates'), projectTrackingController.listCategoryRequirements);
router.post('/categories/:projectCategoryId/requirements', requirePermission('projectTracking', 'manageTemplates'), projectTrackingController.createCategoryRequirement);
router.put('/requirements/:requirementId', requirePermission('projectTracking', 'manageTemplates'), projectTrackingController.updateRequirement);
router.delete('/requirements/:requirementId', requirePermission('projectTracking', 'manageTemplates'), projectTrackingController.deleteRequirement);

module.exports = router;
