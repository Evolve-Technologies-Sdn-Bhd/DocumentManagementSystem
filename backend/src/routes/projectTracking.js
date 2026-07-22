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

const requireAnyPermission = (moduleKey, actions) => {
  return (req, res, next) => {
    const allowed = (actions || []).some((action) => !!req.user?.permissions?.[moduleKey]?.[action])
    if (!allowed) {
      return next(new ForbiddenError("You don't have permission to perform this action"))
    }
    next()
  }
}

router.get('/projects', requireAnyPermission('projectTracking', ['searchProject', 'projectSetup']), projectTrackingController.listProjects);
router.post('/projects', requirePermission('projectTracking', 'create'), projectTrackingController.createProject);
router.get('/projects/:projectId', requirePermission('projectTracking', 'view'), projectTrackingController.getProject);
router.get('/projects/:projectId/required-documents', requirePermission('projectTracking', 'view'), projectTrackingController.listProjectRequiredDocuments)
router.post('/projects/:projectId/required-documents/pic', requirePermission('projectTracking', 'view'), projectTrackingController.setProjectRequiredDocumentPic)
router.get('/projects/:projectId/activity-logs', requireAnyPermission('projectTracking', ['view', 'activityLogs']), projectTrackingController.getProjectActivityLogs);
router.get('/projects/:projectId/change-requests', requireAnyPermission('projectTracking', ['view', 'keyInChangeRequest']), projectTrackingController.listProjectChangeRequests);
router.post('/projects/:projectId/change-requests', requireAnyPermission('projectTracking', ['create', 'keyInChangeRequest']), projectTrackingController.createProjectChangeRequest);
router.post('/projects/:projectId/iterations', requireAnyPermission('projectTracking', ['create', 'addNextPhase']), projectTrackingController.createIteration);
router.put('/iterations/:iterationId', requirePermission('projectTracking', 'edit'), projectTrackingController.updateIteration);
router.put('/projects/:projectId', requireAnyPermission('projectTracking', ['edit', 'editProject']), projectTrackingController.updateProject);
router.delete('/projects/:projectId', requirePermission('projectTracking', 'delete'), projectTrackingController.deleteProject);
router.put('/change-requests/:changeRequestId', requireAnyPermission('projectTracking', ['edit', 'keyInChangeRequest']), projectTrackingController.updateProjectChangeRequest);
router.delete('/change-requests/:changeRequestId', requireAnyPermission('projectTracking', ['delete', 'keyInChangeRequest']), projectTrackingController.deleteProjectChangeRequest);

router.get('/iterations/:iterationId/items', requirePermission('projectTracking', 'view'), projectTrackingController.listIterationItems);
router.get('/iterations/:iterationId/stage-documents', requirePermission('projectTracking', 'view'), projectTrackingController.listIterationStageDocuments);
router.put('/items/:itemId/status', requirePermission('projectTracking', 'edit'), projectTrackingController.updateIterationItemStatus);
router.post('/items/:itemId/link-document', requirePermission('projectTracking', 'linkDocument'), projectTrackingController.linkDocumentToItem);
router.delete('/items/:itemId/links/:linkId', requirePermission('projectTracking', 'linkDocument'), projectTrackingController.unlinkDocumentFromItem);
router.post('/items/:itemId/create-document', requirePermission('projectTracking', 'create'), projectTrackingController.createDocumentFromItem);
router.post('/iterations/:iterationId/advance-stage', requireAnyPermission('projectTracking', ['advanceStage', 'moveToNextStage']), projectTrackingController.advanceIterationStage);
router.post('/iterations/:iterationId/stages/:stageId/link-document', requirePermission('projectTracking', 'linkDocument'), projectTrackingController.linkDocumentToStage);
router.delete('/iterations/:iterationId/stages/:stageId/links/:linkId', requirePermission('projectTracking', 'linkDocument'), projectTrackingController.unlinkDocumentFromStage);
router.post('/iterations/:iterationId/stages/:stageId/create-document', requirePermission('projectTracking', 'create'), projectTrackingController.createDocumentForStage);

router.get('/documents/search', requirePermission('projectTracking', 'searchProject'), projectTrackingController.searchDocuments);

router.get('/setup/stages', requirePermission('projectTracking', 'projectSetup'), projectTrackingController.getSetupStages);
router.post('/setup/stages', requirePermission('projectTracking', 'projectSetup'), projectTrackingController.createSetupStage);
router.put('/setup/stages', requirePermission('projectTracking', 'projectSetup'), projectTrackingController.updateSetupStages);

router.get('/setup/requirements', requirePermission('projectTracking', 'projectSetup'), projectTrackingController.listSetupRequirements);
router.post('/setup/requirements', requirePermission('projectTracking', 'projectSetup'), projectTrackingController.createSetupRequirement);
router.delete('/setup/requirements/:requirementId', requirePermission('projectTracking', 'projectSetup'), projectTrackingController.deleteSetupRequirement);
router.get('/setup/requirements/:requirementId/confidential-access', requirePermission('projectTracking', 'projectSetup'), projectTrackingController.getSetupRequirementConfidentialAccess);
router.put('/setup/requirements/:requirementId/confidential-access', requirePermission('projectTracking', 'projectSetup'), projectTrackingController.updateSetupRequirementConfidentialAccess);

router.get('/projects/:projectId/setup/stages', requirePermission('projectTracking', 'projectSetup'), projectTrackingController.getProjectSetupStages);
router.post('/projects/:projectId/setup/stages', requirePermission('projectTracking', 'projectSetup'), projectTrackingController.createProjectSetupStage);
router.put('/projects/:projectId/setup/stages', requirePermission('projectTracking', 'projectSetup'), projectTrackingController.updateProjectSetupStages);

router.get('/projects/:projectId/setup/requirements', requirePermission('projectTracking', 'projectSetup'), projectTrackingController.listProjectSetupRequirements);
router.post('/projects/:projectId/setup/requirements', requirePermission('projectTracking', 'projectSetup'), projectTrackingController.createProjectSetupRequirement);
router.delete('/projects/:projectId/setup/requirements/:requirementId', requirePermission('projectTracking', 'projectSetup'), projectTrackingController.deleteProjectSetupRequirement);
router.get('/projects/:projectId/setup/requirements/:requirementId/confidential-access', requirePermission('projectTracking', 'projectSetup'), projectTrackingController.getProjectSetupRequirementConfidentialAccess);
router.put('/projects/:projectId/setup/requirements/:requirementId/confidential-access', requirePermission('projectTracking', 'projectSetup'), projectTrackingController.updateProjectSetupRequirementConfidentialAccess);

router.get('/categories/:projectCategoryId/stages', requirePermission('projectTracking', 'projectSetup'), projectTrackingController.getCategoryStages);
router.post('/categories/:projectCategoryId/stages', requirePermission('projectTracking', 'projectSetup'), projectTrackingController.createCategoryStage);
router.put('/categories/:projectCategoryId/stages', requirePermission('projectTracking', 'projectSetup'), projectTrackingController.updateCategoryStages);

router.get('/categories/:projectCategoryId/requirements', requirePermission('projectTracking', 'projectSetup'), projectTrackingController.listCategoryRequirements);
router.post('/categories/:projectCategoryId/requirements', requirePermission('projectTracking', 'projectSetup'), projectTrackingController.createCategoryRequirement);
router.put('/requirements/:requirementId', requirePermission('projectTracking', 'projectSetup'), projectTrackingController.updateRequirement);
router.get('/requirements/:requirementId/confidential-access', requirePermission('projectTracking', 'projectSetup'), projectTrackingController.getRequirementConfidentialAccess);
router.put('/requirements/:requirementId/confidential-access', requirePermission('projectTracking', 'projectSetup'), projectTrackingController.updateRequirementConfidentialAccess);
router.delete('/requirements/:requirementId', requirePermission('projectTracking', 'projectSetup'), projectTrackingController.deleteRequirement);

module.exports = router;
