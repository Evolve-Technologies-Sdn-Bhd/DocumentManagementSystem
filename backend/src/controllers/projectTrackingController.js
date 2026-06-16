const asyncHandler = require('../utils/asyncHandler');
const ResponseFormatter = require('../utils/responseFormatter');
const projectTrackingService = require('../services/projectTrackingService');
const { ValidationError } = require('../utils/errors');

exports.listProjects = asyncHandler(async (req, res) => {
  const projectCategoryId = req.query.projectCategoryId ? Number(req.query.projectCategoryId) : undefined;
  const search = req.query.search ? String(req.query.search) : undefined;

  const projects = await projectTrackingService.listProjects({
    projectCategoryId,
    search
  });

  return ResponseFormatter.success(res, { projects }, 'Projects retrieved successfully');
});

exports.createProject = asyncHandler(async (req, res) => {
  const { code, name, description, projectCategoryId, managerId } = req.body;

  if (!code || !name || !projectCategoryId || !managerId) {
    throw new ValidationError('code, name, projectCategoryId and managerId are required');
  }

  const project = await projectTrackingService.createProject({
    code: String(code).trim(),
    name: String(name).trim(),
    description: description ? String(description) : null,
    projectCategoryId: Number(projectCategoryId),
    managerId: Number(managerId),
    createdById: req.user.id
  });

  return ResponseFormatter.success(res, { project }, 'Project created successfully');
});

exports.updateProject = asyncHandler(async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!projectId) throw new ValidationError('Invalid projectId');

  const { name, description, managerId } = req.body || {};
  if (!name || !managerId) {
    throw new ValidationError('name and managerId are required');
  }

  const project = await projectTrackingService.updateProject(projectId, {
    name: String(name).trim(),
    description: description ? String(description) : null,
    managerId: Number(managerId),
    updatedById: req.user.id
  });

  return ResponseFormatter.success(res, { project }, 'Project updated successfully');
});

exports.deleteProject = asyncHandler(async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!projectId) throw new ValidationError('Invalid projectId');

  await projectTrackingService.deleteProject(projectId, { deletedById: req.user.id });
  return ResponseFormatter.success(res, {}, 'Project deleted successfully');
});

exports.getProject = asyncHandler(async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!projectId) throw new ValidationError('Invalid projectId');

  const canViewConfidential = !!req.user?.permissions?.projectTracking?.viewConfidential;

  const project = await projectTrackingService.getProject(projectId, { canViewConfidential });
  return ResponseFormatter.success(res, { project }, 'Project retrieved successfully');
});

exports.createIteration = asyncHandler(async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!projectId) throw new ValidationError('Invalid projectId');

  const { name } = req.body || {};

  const iteration = await projectTrackingService.createIteration(projectId, {
    name: name ? String(name) : null,
    createdById: req.user.id
  });

  return ResponseFormatter.success(res, { iteration }, 'Iteration created successfully');
});

exports.listIterationItems = asyncHandler(async (req, res) => {
  const iterationId = Number(req.params.iterationId);
  if (!iterationId) throw new ValidationError('Invalid iterationId');

  const canViewConfidential = !!req.user?.permissions?.projectTracking?.viewConfidential;

  const items = await projectTrackingService.listIterationItems(iterationId, { canViewConfidential });
  return ResponseFormatter.success(res, { items }, 'Iteration items retrieved successfully');
});

exports.listIterationStageDocuments = asyncHandler(async (req, res) => {
  const iterationId = Number(req.params.iterationId);
  if (!iterationId) throw new ValidationError('Invalid iterationId');

  const canViewConfidential = !!req.user?.permissions?.projectTracking?.viewConfidential;
  const documents = await projectTrackingService.listIterationStageDocuments(iterationId, { canViewConfidential });
  return ResponseFormatter.success(res, { documents }, 'Stage documents retrieved successfully');
});

exports.linkDocumentToItem = asyncHandler(async (req, res) => {
  const itemId = Number(req.params.itemId);
  if (!itemId) throw new ValidationError('Invalid itemId');

  const { documentId } = req.body;
  if (!documentId) throw new ValidationError('documentId is required');

  const result = await projectTrackingService.linkDocumentToItem(itemId, {
    documentId: Number(documentId),
    linkedById: req.user.id
  });

  return ResponseFormatter.success(res, result, 'Document linked successfully');
});

exports.linkDocumentToStage = asyncHandler(async (req, res) => {
  const iterationId = Number(req.params.iterationId);
  const stageId = Number(req.params.stageId);
  if (!iterationId) throw new ValidationError('Invalid iterationId');
  if (!stageId) throw new ValidationError('Invalid stageId');

  const { documentId } = req.body || {};
  if (!documentId) throw new ValidationError('documentId is required');

  const result = await projectTrackingService.linkDocumentToStage(iterationId, stageId, {
    documentId: Number(documentId),
    linkedById: req.user.id
  });

  return ResponseFormatter.success(res, result, 'Document linked successfully');
});

exports.createDocumentFromItem = asyncHandler(async (req, res) => {
  const itemId = Number(req.params.itemId);
  if (!itemId) throw new ValidationError('Invalid itemId');

  const { title, description } = req.body || {};
  if (!title) throw new ValidationError('title is required');

  const result = await projectTrackingService.createDocumentFromItem(itemId, {
    title: String(title).trim(),
    description: description ? String(description) : null,
    createdById: req.user.id
  });

  return ResponseFormatter.success(res, result, 'Document created successfully');
});

exports.createDocumentForStage = asyncHandler(async (req, res) => {
  const iterationId = Number(req.params.iterationId);
  const stageId = Number(req.params.stageId);
  if (!iterationId) throw new ValidationError('Invalid iterationId');
  if (!stageId) throw new ValidationError('Invalid stageId');

  const { documentTypeId, title, description } = req.body || {};
  if (!documentTypeId) throw new ValidationError('documentTypeId is required');
  if (!title) throw new ValidationError('title is required');

  const result = await projectTrackingService.createDocumentForStage(iterationId, stageId, {
    documentTypeId: Number(documentTypeId),
    title: String(title).trim(),
    description: description ? String(description) : null,
    createdById: req.user.id
  });

  return ResponseFormatter.success(res, result, 'Document created successfully');
});

exports.advanceIterationStage = asyncHandler(async (req, res) => {
  const iterationId = Number(req.params.iterationId);
  if (!iterationId) throw new ValidationError('Invalid iterationId');

  const result = await projectTrackingService.advanceIterationStage(iterationId, {
    advancedById: req.user.id
  });

  return ResponseFormatter.success(res, result, 'Stage advanced successfully');
});

exports.searchDocuments = asyncHandler(async (req, res) => {
  const projectId = req.query.projectId ? Number(req.query.projectId) : undefined;
  const q = req.query.q ? String(req.query.q) : undefined;

  const canViewConfidential = !!req.user?.permissions?.projectTracking?.viewConfidential;

  const documents = await projectTrackingService.searchDocuments({ projectId, q }, { canViewConfidential });
  return ResponseFormatter.success(res, { documents }, 'Documents retrieved successfully');
});

exports.getCategoryStages = asyncHandler(async (req, res) => {
  const projectCategoryId = Number(req.params.projectCategoryId);
  if (!projectCategoryId) throw new ValidationError('Invalid projectCategoryId');

  const stages = await projectTrackingService.getCategoryStages(projectCategoryId);
  return ResponseFormatter.success(res, { stages }, 'Category stages retrieved successfully');
});

exports.createCategoryStage = asyncHandler(async (req, res) => {
  const projectCategoryId = Number(req.params.projectCategoryId);
  if (!projectCategoryId) throw new ValidationError('Invalid projectCategoryId');

  const { name, displayName } = req.body || {};
  if (!name) throw new ValidationError('name is required');

  const stage = await projectTrackingService.createCategoryStage(projectCategoryId, {
    name: String(name).trim(),
    displayName: displayName ? String(displayName).trim() : null,
    createdById: req.user.id
  });

  return ResponseFormatter.success(res, { stage }, 'Category stage created successfully');
});

exports.updateCategoryStages = asyncHandler(async (req, res) => {
  const projectCategoryId = Number(req.params.projectCategoryId);
  if (!projectCategoryId) throw new ValidationError('Invalid projectCategoryId');

  const { stages } = req.body || {};
  if (!Array.isArray(stages)) throw new ValidationError('stages must be an array');

  const updated = await projectTrackingService.updateCategoryStages(projectCategoryId, stages, { updatedById: req.user.id });
  return ResponseFormatter.success(res, { stages: updated }, 'Category stages updated successfully');
});

exports.listCategoryRequirements = asyncHandler(async (req, res) => {
  const projectCategoryId = Number(req.params.projectCategoryId);
  if (!projectCategoryId) throw new ValidationError('Invalid projectCategoryId');

  const requirements = await projectTrackingService.listCategoryRequirements(projectCategoryId);
  return ResponseFormatter.success(res, { requirements }, 'Category requirements retrieved successfully');
});

exports.createCategoryRequirement = asyncHandler(async (req, res) => {
  const projectCategoryId = Number(req.params.projectCategoryId);
  if (!projectCategoryId) throw new ValidationError('Invalid projectCategoryId');

  const { stageId, documentTypeId, isRequired, isConfidentialDefault } = req.body || {};
  if (!stageId || !documentTypeId) {
    throw new ValidationError('stageId and documentTypeId are required');
  }

  const requirement = await projectTrackingService.createCategoryRequirement(projectCategoryId, {
    stageId: Number(stageId),
    documentTypeId: Number(documentTypeId),
    isRequired: isRequired !== undefined ? Boolean(isRequired) : true,
    isConfidentialDefault: Boolean(isConfidentialDefault),
    createdById: req.user.id
  });

  return ResponseFormatter.success(res, { requirement }, 'Requirement created successfully');
});

exports.updateRequirement = asyncHandler(async (req, res) => {
  const requirementId = Number(req.params.requirementId);
  if (!requirementId) throw new ValidationError('Invalid requirementId');

  const { isRequired, isConfidentialDefault } = req.body || {};
  const requirement = await projectTrackingService.updateRequirement(requirementId, {
    isRequired: isRequired !== undefined ? Boolean(isRequired) : undefined,
    isConfidentialDefault: isConfidentialDefault !== undefined ? Boolean(isConfidentialDefault) : undefined,
    updatedById: req.user.id
  });

  return ResponseFormatter.success(res, { requirement }, 'Requirement updated successfully');
});

exports.deleteRequirement = asyncHandler(async (req, res) => {
  const requirementId = Number(req.params.requirementId);
  if (!requirementId) throw new ValidationError('Invalid requirementId');

  await projectTrackingService.deleteRequirement(requirementId, { deletedById: req.user.id });
  return ResponseFormatter.success(res, {}, 'Requirement deleted successfully');
});
