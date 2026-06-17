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
router.get('/projects/:projectId/activity-logs', requirePermission('projectTracking', 'view'), projectTrackingController.getProjectActivityLogs);
router.post('/projects/:projectId/iterations', requirePermission('projectTracking', 'create'), projectTrackingController.createIteration);
router.put('/iterations/:iterationId', requirePermission('projectTracking', 'edit'), projectTrackingController.updateIteration);
router.put('/projects/:projectId', requirePermission('projectTracking', 'edit'), projectTrackingController.updateProject);
router.delete('/projects/:projectId', requirePermission('projectTracking', 'delete'), projectTrackingController.deleteProject);

router.get('/iterations/:iterationId/items', requirePermission('projectTracking', 'view'), projectTrackingController.listIterationItems);
router.get('/iterations/:iterationId/stage-documents', requirePermission('projectTracking', 'view'), projectTrackingController.listIterationStageDocuments);
router.post('/items/:itemId/link-document', requirePermission('projectTracking', 'linkDocument'), projectTrackingController.linkDocumentToItem);
router.delete('/items/:itemId/links/:linkId', requirePermission('projectTracking', 'linkDocument'), projectTrackingController.unlinkDocumentFromItem);
router.post('/items/:itemId/create-document', requirePermission('projectTracking', 'create'), projectTrackingController.createDocumentFromItem);
router.post('/iterations/:iterationId/advance-stage', requirePermission('projectTracking', 'advanceStage'), projectTrackingController.advanceIterationStage);
router.post('/iterations/:iterationId/stages/:stageId/link-document', requirePermission('projectTracking', 'linkDocument'), projectTrackingController.linkDocumentToStage);
router.delete('/iterations/:iterationId/stages/:stageId/links/:linkId', requirePermission('projectTracking', 'linkDocument'), projectTrackingController.unlinkDocumentFromStage);
router.post('/iterations/:iterationId/stages/:stageId/create-document', requirePermission('projectTracking', 'create'), projectTrackingController.createDocumentForStage);

router.get('/documents/search', requirePermission('projectTracking', 'view'), projectTrackingController.searchDocuments);

router.get('/setup/stages', requirePermission('projectTracking', 'manageTemplates'), projectTrackingController.getSetupStages);
router.post('/setup/stages', requirePermission('projectTracking', 'manageTemplates'), projectTrackingController.createSetupStage);
router.put('/setup/stages', requirePermission('projectTracking', 'manageTemplates'), projectTrackingController.updateSetupStages);

router.get('/setup/requirements', requirePermission('projectTracking', 'manageTemplates'), projectTrackingController.listSetupRequirements);
router.post('/setup/requirements', requirePermission('projectTracking', 'manageTemplates'), projectTrackingController.createSetupRequirement);
router.delete('/setup/requirements/:requirementId', requirePermission('projectTracking', 'manageTemplates'), projectTrackingController.deleteSetupRequirement);
router.get('/setup/requirements/:requirementId/confidential-access', requirePermission('projectTracking', 'manageTemplates'), projectTrackingController.getSetupRequirementConfidentialAccess);
router.put('/setup/requirements/:requirementId/confidential-access', requirePermission('projectTracking', 'manageTemplates'), projectTrackingController.updateSetupRequirementConfidentialAccess);

router.get('/projects/:projectId/setup/stages', requirePermission('projectTracking', 'manageTemplates'), projectTrackingController.getProjectSetupStages);
router.post('/projects/:projectId/setup/stages', requirePermission('projectTracking', 'manageTemplates'), projectTrackingController.createProjectSetupStage);
router.put('/projects/:projectId/setup/stages', requirePermission('projectTracking', 'manageTemplates'), projectTrackingController.updateProjectSetupStages);

router.get('/projects/:projectId/setup/requirements', requirePermission('projectTracking', 'manageTemplates'), projectTrackingController.listProjectSetupRequirements);
router.post('/projects/:projectId/setup/requirements', requirePermission('projectTracking', 'manageTemplates'), projectTrackingController.createProjectSetupRequirement);
router.delete('/projects/:projectId/setup/requirements/:requirementId', requirePermission('projectTracking', 'manageTemplates'), projectTrackingController.deleteProjectSetupRequirement);
router.get('/projects/:projectId/setup/requirements/:requirementId/confidential-access', requirePermission('projectTracking', 'manageTemplates'), projectTrackingController.getProjectSetupRequirementConfidentialAccess);
router.put('/projects/:projectId/setup/requirements/:requirementId/confidential-access', requirePermission('projectTracking', 'manageTemplates'), projectTrackingController.updateProjectSetupRequirementConfidentialAccess);

router.get('/categories/:projectCategoryId/stages', requirePermission('projectTracking', 'manageTemplates'), projectTrackingController.getCategoryStages);
router.post('/categories/:projectCategoryId/stages', requirePermission('projectTracking', 'manageTemplates'), projectTrackingController.createCategoryStage);
router.put('/categories/:projectCategoryId/stages', requirePermission('projectTracking', 'manageTemplates'), projectTrackingController.updateCategoryStages);

router.get('/categories/:projectCategoryId/requirements', requirePermission('projectTracking', 'manageTemplates'), projectTrackingController.listCategoryRequirements);
router.post('/categories/:projectCategoryId/requirements', requirePermission('projectTracking', 'manageTemplates'), projectTrackingController.createCategoryRequirement);
router.put('/requirements/:requirementId', requirePermission('projectTracking', 'manageTemplates'), projectTrackingController.updateRequirement);
router.get('/requirements/:requirementId/confidential-access', requirePermission('projectTracking', 'manageTemplates'), projectTrackingController.getRequirementConfidentialAccess);
router.put('/requirements/:requirementId/confidential-access', requirePermission('projectTracking', 'manageTemplates'), projectTrackingController.updateRequirementConfidentialAccess);
router.delete('/requirements/:requirementId', requirePermission('projectTracking', 'manageTemplates'), projectTrackingController.deleteRequirement);

module.exports = router;
