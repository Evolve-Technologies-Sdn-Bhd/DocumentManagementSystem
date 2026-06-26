const asyncHandler = require('../utils/asyncHandler');
const ResponseFormatter = require('../utils/responseFormatter');
const projectTrackingService = require('../services/projectTrackingService');
const confidentialAccessService = require('../services/confidentialAccessService')
const { ValidationError } = require('../utils/errors');

const normalizeOptionalText = (value) => {
  if (value === undefined || value === null) return null
  const text = String(value).trim()
  return text || null
}

const normalizeOptionalDate = (value, fieldName) => {
  if (value === undefined || value === null || value === '') return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`${fieldName} must be a valid date`)
  }
  return date
}

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
  const {
    code,
    name,
    description,
    clientName,
    clientPic,
    teamMembers,
    startDate,
    plannedCompletionDate,
    actualCompletionDate,
    scope,
    objective,
    deliverables,
    projectCategoryId,
    managerId
  } = req.body;

  if (!code || !name || !projectCategoryId || !managerId) {
    throw new ValidationError('code, name, projectCategoryId and managerId are required');
  }

  const project = await projectTrackingService.createProject({
    code: String(code).trim(),
    name: String(name).trim(),
    description: normalizeOptionalText(description),
    clientName: normalizeOptionalText(clientName),
    clientPic: normalizeOptionalText(clientPic),
    teamMembers: normalizeOptionalText(teamMembers),
    startDate: normalizeOptionalDate(startDate, 'startDate'),
    plannedCompletionDate: normalizeOptionalDate(plannedCompletionDate, 'plannedCompletionDate'),
    actualCompletionDate: normalizeOptionalDate(actualCompletionDate, 'actualCompletionDate'),
    scope: normalizeOptionalText(scope),
    objective: normalizeOptionalText(objective),
    deliverables: normalizeOptionalText(deliverables),
    projectCategoryId: Number(projectCategoryId),
    managerId: Number(managerId),
    createdById: req.user.id
  });

  return ResponseFormatter.success(res, { project }, 'Project created successfully');
});

exports.updateProject = asyncHandler(async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!projectId) throw new ValidationError('Invalid projectId');

  const {
    name,
    description,
    clientName,
    clientPic,
    teamMembers,
    startDate,
    plannedCompletionDate,
    actualCompletionDate,
    scope,
    objective,
    deliverables,
    managerId,
    status
  } = req.body || {};
  if (
    name === undefined &&
    description === undefined &&
    clientName === undefined &&
    clientPic === undefined &&
    teamMembers === undefined &&
    startDate === undefined &&
    plannedCompletionDate === undefined &&
    actualCompletionDate === undefined &&
    scope === undefined &&
    objective === undefined &&
    deliverables === undefined &&
    managerId === undefined &&
    status === undefined
  ) {
    throw new ValidationError('At least one project field must be provided');
  }

  if (name !== undefined && !String(name).trim()) {
    throw new ValidationError('name is required');
  }

  if (managerId !== undefined && !Number(managerId)) {
    throw new ValidationError('managerId must be a valid number');
  }

  const project = await projectTrackingService.updateProject(projectId, {
    name: name !== undefined ? String(name).trim() : undefined,
    description: description !== undefined ? normalizeOptionalText(description) : undefined,
    clientName: clientName !== undefined ? normalizeOptionalText(clientName) : undefined,
    clientPic: clientPic !== undefined ? normalizeOptionalText(clientPic) : undefined,
    teamMembers: teamMembers !== undefined ? normalizeOptionalText(teamMembers) : undefined,
    startDate: startDate !== undefined ? normalizeOptionalDate(startDate, 'startDate') : undefined,
    plannedCompletionDate: plannedCompletionDate !== undefined ? normalizeOptionalDate(plannedCompletionDate, 'plannedCompletionDate') : undefined,
    actualCompletionDate: actualCompletionDate !== undefined ? normalizeOptionalDate(actualCompletionDate, 'actualCompletionDate') : undefined,
    scope: scope !== undefined ? normalizeOptionalText(scope) : undefined,
    objective: objective !== undefined ? normalizeOptionalText(objective) : undefined,
    deliverables: deliverables !== undefined ? normalizeOptionalText(deliverables) : undefined,
    managerId: managerId !== undefined ? Number(managerId) : undefined,
    status: status !== undefined ? String(status) : undefined,
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

  const project = await projectTrackingService.getProject(projectId, { user: req.user });
  return ResponseFormatter.success(res, { project }, 'Project retrieved successfully');
});

exports.getProjectActivityLogs = asyncHandler(async (req, res) => {
  const projectId = Number(req.params.projectId)
  if (!projectId) throw new ValidationError('Invalid projectId')

  const page = req.query?.page ? Number(req.query.page) : 1
  const limit = req.query?.limit ? Number(req.query.limit) : 20

  const result = await projectTrackingService.getProjectActivityLogs(projectId, { page, limit })
  return ResponseFormatter.success(res, result, 'Project activity logs retrieved successfully')
})

exports.listProjectChangeRequests = asyncHandler(async (req, res) => {
  const projectId = Number(req.params.projectId)
  if (!projectId) throw new ValidationError('Invalid projectId')

  const iterationId = req.query?.iterationId ? Number(req.query.iterationId) : undefined
  if (req.query?.iterationId && !iterationId) throw new ValidationError('Invalid iterationId')

  const changeRequests = await projectTrackingService.listProjectChangeRequests(projectId, { iterationId })
  return ResponseFormatter.success(res, { changeRequests }, 'Project change requests retrieved successfully')
})

exports.createProjectChangeRequest = asyncHandler(async (req, res) => {
  const projectId = Number(req.params.projectId)
  if (!projectId) throw new ValidationError('Invalid projectId')

  const {
    projectIterationId,
    changeId,
    phaseRef,
    description,
    impact,
    authorizedBy,
    complianceSignOff,
    dateApproved
  } = req.body || {}

  if (!changeId || !String(changeId).trim()) throw new ValidationError('changeId is required')
  if (!description || !String(description).trim()) throw new ValidationError('description is required')

  const changeRequest = await projectTrackingService.createProjectChangeRequest(projectId, {
    projectIterationId: projectIterationId ? Number(projectIterationId) : null,
    changeId: String(changeId).trim(),
    phaseRef: normalizeOptionalText(phaseRef),
    description: String(description).trim(),
    impact: normalizeOptionalText(impact),
    authorizedBy: normalizeOptionalText(authorizedBy),
    complianceSignOff: normalizeOptionalText(complianceSignOff),
    dateApproved: normalizeOptionalDate(dateApproved, 'dateApproved'),
    createdById: req.user.id
  })

  return ResponseFormatter.success(res, { changeRequest }, 'Project change request created successfully')
})

exports.updateProjectChangeRequest = asyncHandler(async (req, res) => {
  const changeRequestId = Number(req.params.changeRequestId)
  if (!changeRequestId) throw new ValidationError('Invalid changeRequestId')

  const {
    projectIterationId,
    changeId,
    phaseRef,
    description,
    impact,
    authorizedBy,
    complianceSignOff,
    dateApproved
  } = req.body || {}

  if (
    projectIterationId === undefined &&
    changeId === undefined &&
    phaseRef === undefined &&
    description === undefined &&
    impact === undefined &&
    authorizedBy === undefined &&
    complianceSignOff === undefined &&
    dateApproved === undefined
  ) {
    throw new ValidationError('At least one field must be provided')
  }

  if (changeId !== undefined && !String(changeId).trim()) throw new ValidationError('changeId is required')
  if (description !== undefined && !String(description).trim()) throw new ValidationError('description is required')

  const changeRequest = await projectTrackingService.updateProjectChangeRequest(changeRequestId, {
    projectIterationId: projectIterationId !== undefined ? (projectIterationId ? Number(projectIterationId) : null) : undefined,
    changeId: changeId !== undefined ? String(changeId).trim() : undefined,
    phaseRef: phaseRef !== undefined ? normalizeOptionalText(phaseRef) : undefined,
    description: description !== undefined ? String(description).trim() : undefined,
    impact: impact !== undefined ? normalizeOptionalText(impact) : undefined,
    authorizedBy: authorizedBy !== undefined ? normalizeOptionalText(authorizedBy) : undefined,
    complianceSignOff: complianceSignOff !== undefined ? normalizeOptionalText(complianceSignOff) : undefined,
    dateApproved: dateApproved !== undefined ? normalizeOptionalDate(dateApproved, 'dateApproved') : undefined,
    updatedById: req.user.id
  })

  return ResponseFormatter.success(res, { changeRequest }, 'Project change request updated successfully')
})

exports.deleteProjectChangeRequest = asyncHandler(async (req, res) => {
  const changeRequestId = Number(req.params.changeRequestId)
  if (!changeRequestId) throw new ValidationError('Invalid changeRequestId')

  await projectTrackingService.deleteProjectChangeRequest(changeRequestId, { deletedById: req.user.id })
  return ResponseFormatter.success(res, {}, 'Project change request deleted successfully')
})

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

exports.updateIteration = asyncHandler(async (req, res) => {
  const iterationId = Number(req.params.iterationId);
  if (!iterationId) throw new ValidationError('Invalid iterationId');

  const { name } = req.body || {};
  if (!name) throw new ValidationError('Phase name is required');

  const iteration = await projectTrackingService.updateIteration(iterationId, {
    name: String(name),
    updatedById: req.user.id
  });

  return ResponseFormatter.success(res, { iteration }, 'Iteration updated successfully');
});

exports.listIterationItems = asyncHandler(async (req, res) => {
  const iterationId = Number(req.params.iterationId);
  if (!iterationId) throw new ValidationError('Invalid iterationId');

  const items = await projectTrackingService.listIterationItems(iterationId, { user: req.user });
  return ResponseFormatter.success(res, { items }, 'Iteration items retrieved successfully');
});

exports.listIterationStageDocuments = asyncHandler(async (req, res) => {
  const iterationId = Number(req.params.iterationId);
  if (!iterationId) throw new ValidationError('Invalid iterationId');

  const documents = await projectTrackingService.listIterationStageDocuments(iterationId, { user: req.user });
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

exports.unlinkDocumentFromItem = asyncHandler(async (req, res) => {
  const itemId = Number(req.params.itemId);
  const linkId = Number(req.params.linkId);
  if (!itemId) throw new ValidationError('Invalid itemId');
  if (!linkId) throw new ValidationError('Invalid linkId');

  const result = await projectTrackingService.unlinkDocumentFromItem(itemId, linkId, { user: req.user });
  return ResponseFormatter.success(res, result, 'Document unlinked successfully');
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

exports.unlinkDocumentFromStage = asyncHandler(async (req, res) => {
  const iterationId = Number(req.params.iterationId);
  const stageId = Number(req.params.stageId);
  const linkId = Number(req.params.linkId);
  if (!iterationId) throw new ValidationError('Invalid iterationId');
  if (!stageId) throw new ValidationError('Invalid stageId');
  if (!linkId) throw new ValidationError('Invalid linkId');

  const result = await projectTrackingService.unlinkDocumentFromStage(iterationId, stageId, linkId, { user: req.user });
  return ResponseFormatter.success(res, result, 'Document unlinked successfully');
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
  const attachedOnlyRaw = String(req.query.attachedOnly || '').trim().toLowerCase()
  const attachedOnly = attachedOnlyRaw === 'true' || attachedOnlyRaw === '1'

  const documents = await projectTrackingService.searchDocuments({ projectId, q, attachedOnly }, { user: req.user });
  return ResponseFormatter.success(res, { documents }, 'Documents retrieved successfully');
});

exports.getSetupStages = asyncHandler(async (req, res) => {
  const stages = await projectTrackingService.getSetupStages()
  return ResponseFormatter.success(res, { stages }, 'Project setup stages retrieved successfully')
})

exports.createSetupStage = asyncHandler(async (req, res) => {
  const { name, displayName } = req.body || {}
  if (!name) throw new ValidationError('name is required')

  const stage = await projectTrackingService.createSetupStage({
    name: String(name).trim(),
    displayName: displayName ? String(displayName).trim() : null,
    createdById: req.user.id
  })

  return ResponseFormatter.success(res, { stage }, 'Project setup stage created successfully')
})

exports.updateSetupStages = asyncHandler(async (req, res) => {
  const { stages } = req.body || {}
  if (!Array.isArray(stages)) throw new ValidationError('stages must be an array')

  const updated = await projectTrackingService.updateSetupStages(stages, { updatedById: req.user.id })
  return ResponseFormatter.success(res, { stages: updated }, 'Project setup stages updated successfully')
})

exports.listSetupRequirements = asyncHandler(async (req, res) => {
  const requirements = await projectTrackingService.listSetupRequirements()
  return ResponseFormatter.success(res, { requirements }, 'Project setup requirements retrieved successfully')
})

exports.createSetupRequirement = asyncHandler(async (req, res) => {
  const { stageId, documentTypeId, isRequired, isConfidentialDefault } = req.body || {}
  if (!stageId || !documentTypeId) {
    throw new ValidationError('stageId and documentTypeId are required')
  }

  const requirement = await projectTrackingService.createSetupRequirement({
    stageId: Number(stageId),
    documentTypeId: Number(documentTypeId),
    isRequired: isRequired !== undefined ? Boolean(isRequired) : true,
    isConfidentialDefault: Boolean(isConfidentialDefault),
    createdById: req.user.id
  })

  return ResponseFormatter.success(res, { requirement }, 'Requirement created successfully')
})

exports.deleteSetupRequirement = asyncHandler(async (req, res) => {
  const requirementId = Number(req.params.requirementId)
  if (!requirementId) throw new ValidationError('Invalid requirementId')

  await projectTrackingService.deleteSetupRequirement(requirementId, { deletedById: req.user.id })
  return ResponseFormatter.success(res, {}, 'Requirement deleted successfully')
})

exports.getSetupRequirementConfidentialAccess = asyncHandler(async (req, res) => {
  const requirementId = Number(req.params.requirementId)
  if (!requirementId) throw new ValidationError('Invalid requirementId')
  const data = await projectTrackingService.getSetupRequirementConfidentialAccess(requirementId)
  return ResponseFormatter.success(res, data, 'Requirement confidential access retrieved successfully')
})

exports.updateSetupRequirementConfidentialAccess = asyncHandler(async (req, res) => {
  const requirementId = Number(req.params.requirementId)
  if (!requirementId) throw new ValidationError('Invalid requirementId')
  const data = await projectTrackingService.updateSetupRequirementConfidentialAccess(requirementId, req.user, req.body || {})
  return ResponseFormatter.success(res, data, 'Requirement confidential access updated successfully')
})

exports.getProjectSetupStages = asyncHandler(async (req, res) => {
  const projectId = Number(req.params.projectId)
  if (!projectId) throw new ValidationError('Invalid projectId')

  const stages = await projectTrackingService.getProjectSetupStages(projectId)
  return ResponseFormatter.success(res, { stages }, 'Project setup stages retrieved successfully')
})

exports.createProjectSetupStage = asyncHandler(async (req, res) => {
  const projectId = Number(req.params.projectId)
  if (!projectId) throw new ValidationError('Invalid projectId')

  const { name, displayName } = req.body || {}
  if (!name) throw new ValidationError('name is required')

  const stage = await projectTrackingService.createProjectSetupStage(projectId, {
    name: String(name).trim(),
    displayName: displayName ? String(displayName).trim() : null,
    createdById: req.user.id
  })

  return ResponseFormatter.success(res, { stage }, 'Project setup stage created successfully')
})

exports.updateProjectSetupStages = asyncHandler(async (req, res) => {
  const projectId = Number(req.params.projectId)
  if (!projectId) throw new ValidationError('Invalid projectId')

  const { stages } = req.body || {}
  if (!Array.isArray(stages)) throw new ValidationError('stages must be an array')

  const updated = await projectTrackingService.updateProjectSetupStages(projectId, stages, { updatedById: req.user.id })
  return ResponseFormatter.success(res, { stages: updated }, 'Project setup stages updated successfully')
})

exports.listProjectSetupRequirements = asyncHandler(async (req, res) => {
  const projectId = Number(req.params.projectId)
  if (!projectId) throw new ValidationError('Invalid projectId')

  const requirements = await projectTrackingService.listProjectSetupRequirements(projectId)
  return ResponseFormatter.success(res, { requirements }, 'Project setup requirements retrieved successfully')
})

exports.createProjectSetupRequirement = asyncHandler(async (req, res) => {
  const projectId = Number(req.params.projectId)
  if (!projectId) throw new ValidationError('Invalid projectId')

  const { stageId, documentTypeId, isRequired, isConfidentialDefault } = req.body || {}
  if (!stageId || !documentTypeId) {
    throw new ValidationError('stageId and documentTypeId are required')
  }

  const requirement = await projectTrackingService.createProjectSetupRequirement(projectId, {
    stageId: Number(stageId),
    documentTypeId: Number(documentTypeId),
    isRequired: isRequired !== undefined ? Boolean(isRequired) : true,
    isConfidentialDefault: Boolean(isConfidentialDefault),
    createdById: req.user.id
  })

  return ResponseFormatter.success(res, { requirement }, 'Requirement created successfully')
})

exports.deleteProjectSetupRequirement = asyncHandler(async (req, res) => {
  const projectId = Number(req.params.projectId)
  const requirementId = Number(req.params.requirementId)
  if (!projectId) throw new ValidationError('Invalid projectId')
  if (!requirementId) throw new ValidationError('Invalid requirementId')

  await projectTrackingService.deleteProjectSetupRequirement(projectId, requirementId, { deletedById: req.user.id })
  return ResponseFormatter.success(res, {}, 'Requirement deleted successfully')
})

exports.getProjectSetupRequirementConfidentialAccess = asyncHandler(async (req, res) => {
  const projectId = Number(req.params.projectId)
  const requirementId = Number(req.params.requirementId)
  if (!projectId) throw new ValidationError('Invalid projectId')
  if (!requirementId) throw new ValidationError('Invalid requirementId')
  const data = await projectTrackingService.getProjectSetupRequirementConfidentialAccess(projectId, requirementId)
  return ResponseFormatter.success(res, data, 'Requirement confidential access retrieved successfully')
})

exports.updateProjectSetupRequirementConfidentialAccess = asyncHandler(async (req, res) => {
  const projectId = Number(req.params.projectId)
  const requirementId = Number(req.params.requirementId)
  if (!projectId) throw new ValidationError('Invalid projectId')
  if (!requirementId) throw new ValidationError('Invalid requirementId')
  const data = await projectTrackingService.updateProjectSetupRequirementConfidentialAccess(projectId, requirementId, req.user, req.body || {})
  return ResponseFormatter.success(res, data, 'Requirement confidential access updated successfully')
})

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

exports.getRequirementConfidentialAccess = asyncHandler(async (req, res) => {
  const requirementId = Number(req.params.requirementId)
  if (!requirementId) throw new ValidationError('Invalid requirementId')
  const data = await confidentialAccessService.getRequirementAccess(requirementId)
  return ResponseFormatter.success(res, data, 'Requirement confidential access retrieved successfully')
})

exports.updateRequirementConfidentialAccess = asyncHandler(async (req, res) => {
  const requirementId = Number(req.params.requirementId)
  if (!requirementId) throw new ValidationError('Invalid requirementId')
  const data = await confidentialAccessService.setRequirementAccess(requirementId, req.user, req.body || {})
  return ResponseFormatter.success(res, data, 'Requirement confidential access updated successfully')
})
