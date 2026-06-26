const prisma = require('../config/database');
const { ConflictError, ForbiddenError, NotFoundError, ValidationError } = require('../utils/errors');
const documentService = require('./documentService');
const documentAssignmentService = require('./documentAssignmentService')
const folderPermissionService = require('./folderPermissionService')
const confidentialAccessService = require('./confidentialAccessService')

const PROJECT_STATUSES = new Set(['ACTIVE', 'ON_HOLD', 'CLOSED', 'ARCHIVED'])

const normalizeProjectStatus = (value) => {
  const normalized = String(value || '').trim().toUpperCase()
  return PROJECT_STATUSES.has(normalized) ? normalized : null
}

const assertProjectCanProgress = (project, actionLabel) => {
  const status = normalizeProjectStatus(project?.status) || 'ACTIVE'
  if (status === 'ACTIVE') return

  if (status === 'ON_HOLD') {
    throw new ValidationError(`This project is currently on hold. Resume the project before you can ${actionLabel}.`)
  }

  if (status === 'CLOSED') {
    throw new ValidationError(`This project is closed. Reopen the project before you can ${actionLabel}.`)
  }

  throw new ValidationError(`This project is ${status.toLowerCase()}. Update the project status before you can ${actionLabel}.`)
}

const buildLinkedDocumentAccessSelect = (user, roleIds = [], extraSelect = {}) => {
  const userId = Number.isFinite(Number(user?.id)) ? Number(user.id) : null
  const normalizedRoleIds = Array.isArray(roleIds) ? roleIds.filter((id) => Number.isFinite(id)) : []
  const accessMatch = []

  if (userId) accessMatch.push({ userId, canView: true })
  if (normalizedRoleIds.length > 0) {
    accessMatch.push({ roleId: { in: normalizedRoleIds }, canView: true })
  }

  return {
    id: true,
    fileCode: true,
    title: true,
    status: true,
    stage: true,
    isConfidential: true,
    updatedAt: true,
    ownerId: true,
    createdById: true,
    confidentialAccess: {
      where: accessMatch.length > 0 ? { OR: accessMatch } : { id: -1 },
      select: { id: true, userId: true, roleId: true }
    },
    ...extraSelect
  }
}

const canInteractWithLinkedDocument = (document, user, userRoleIds = []) => {
  if (!document) return false
  if (!document.isConfidential) return true
  if (!user) return false

  const userId = Number.isFinite(Number(user.id)) ? Number(user.id) : null
  if (userId && (document.ownerId === userId || document.createdById === userId)) return true

  // Verify user actually has an access entry matching them (userId or roleId)
  if (Array.isArray(document.confidentialAccess) && document.confidentialAccess.length > 0) {
    const normalizedRoleIds = Array.isArray(userRoleIds) ? userRoleIds.filter((id) => Number.isFinite(id)) : []
    const hasMatchingEntry = document.confidentialAccess.some((entry) => {
      if (userId && entry.userId === userId) return true
      if (normalizedRoleIds.length > 0 && entry.roleId && normalizedRoleIds.includes(entry.roleId)) return true
      return false
    })
    if (hasMatchingEntry) return true
  }

  return false
}

const serializeLinkedDocumentForUser = (document, user, userRoleIds = []) => {
  if (!document) return document
  const canAccess = canInteractWithLinkedDocument(document, user, userRoleIds)
  const { ownerId, createdById, confidentialAccess, ...safeDocument } = document
  return {
    ...safeDocument,
    canAccess
  }
}

const getActiveStageDefinitions = async () => {
  return prisma.projectStageDefinition.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' }
  });
};

const getActiveSystemStageDefinitions = async () => {
  return prisma.projectStageDefinition.findMany({
    where: { isActive: true, isSystem: true },
    orderBy: { sortOrder: 'asc' }
  })
}

const ensureCategoryStages = async (projectCategoryId) => {
  const existing = await prisma.projectCategoryStage.findMany({
    where: { projectCategoryId },
    include: { stage: true },
    orderBy: [{ sortOrder: 'asc' }, { stage: { sortOrder: 'asc' } }]
  });

  if (existing.length > 0) return existing;

  const stages = await getActiveStageDefinitions();
  if (stages.length === 0) return [];

  await prisma.projectCategoryStage.createMany({
    data: stages.map((s) => ({
      projectCategoryId,
      stageId: s.id,
      sortOrder: s.sortOrder,
      isEnabled: true
    }))
  });

  return prisma.projectCategoryStage.findMany({
    where: { projectCategoryId },
    include: { stage: true },
    orderBy: [{ sortOrder: 'asc' }, { stage: { sortOrder: 'asc' } }]
  });
};

const ensureDefaultSetupStages = async (db = prisma) => {
  const existing = await db.projectSetupStageDefault.findMany({
    include: { stage: true },
    orderBy: [{ sortOrder: 'asc' }, { stage: { sortOrder: 'asc' } }]
  })
  if (existing.length > 0) return existing

  const systemStages = await getActiveSystemStageDefinitions()
  if (systemStages.length === 0) return []

  await db.projectSetupStageDefault.createMany({
    data: systemStages.map((s) => ({
      stageId: s.id,
      sortOrder: s.sortOrder,
      isEnabled: true
    }))
  })

  return db.projectSetupStageDefault.findMany({
    include: { stage: true },
    orderBy: [{ sortOrder: 'asc' }, { stage: { sortOrder: 'asc' } }]
  })
}

const slugifyStageKey = (value) => {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

const getEnabledStagesForCategory = async (projectCategoryId) => {
  const categoryStages = await ensureCategoryStages(projectCategoryId);
  return categoryStages
    .filter((cs) => cs.isEnabled && cs.stage?.isActive)
    .sort((a, b) => (a.sortOrder ?? a.stage.sortOrder) - (b.sortOrder ?? b.stage.sortOrder));
};

const getEffectiveStagesForProject = async (projectId, db = prisma) => {
  const pid = parseInt(projectId, 10)
  if (!pid) throw new ValidationError('Invalid projectId')

  const defaultRows = await ensureDefaultSetupStages(db)
  const overrideRows = await db.projectSetupStageOverride.findMany({
    where: { projectId: pid },
    include: { stage: true }
  })

  const overridesByStage = new Map(overrideRows.map((r) => [r.stageId, r]))
  const defaultStageIds = new Set(defaultRows.map((r) => r.stageId))

  const merged = defaultRows.map((d) => {
    const o = overridesByStage.get(d.stageId)
    return {
      id: o?.id || d.id,
      stageId: d.stageId,
      displayName: o?.displayName !== undefined ? o.displayName : d.displayName,
      sortOrder: o?.sortOrder !== undefined && o?.sortOrder !== null ? o.sortOrder : d.sortOrder,
      isEnabled: o?.isEnabled !== undefined ? o.isEnabled : d.isEnabled,
      stage: d.stage
    }
  })

  const projectOnly = overrideRows
    .filter((o) => !defaultStageIds.has(o.stageId))
    .map((o) => ({
      id: o.id,
      stageId: o.stageId,
      displayName: o.displayName,
      sortOrder: o.sortOrder,
      isEnabled: o.isEnabled,
      stage: o.stage
    }))

  return merged
    .concat(projectOnly)
    .filter((row) => row.stage?.isActive)
    .sort((a, b) => {
      const aSort = a.sortOrder ?? a.stage?.sortOrder ?? 0
      const bSort = b.sortOrder ?? b.stage?.sortOrder ?? 0
      return aSort - bSort
    })
}

const getEnabledStagesForProject = async (projectId, db = prisma) => {
  const rows = await getEffectiveStagesForProject(projectId, db)
  return rows.filter((r) => r.isEnabled && r.stage?.isActive)
}

const mapEnabledStagesForView = (categoryStages) => {
  return categoryStages.map((cs) => ({
    id: cs.stageId,
    stageId: cs.stageId,
    key: cs.stage?.key,
    name: cs.displayName || cs.stage?.name || `Stage ${cs.stageId}`,
    baseName: cs.stage?.name || null,
    sortOrder: cs.sortOrder ?? cs.stage?.sortOrder ?? 0
  }));
};

const createChecklistItemsFromRequirements = async (projectId, iterationId, db = prisma) => {
  const enabledStages = await getEnabledStagesForProject(projectId, db)
  if (enabledStages.length === 0) return []

  const stageIds = enabledStages.map((s) => s.stageId)

  const defaultRequired = await db.projectSetupDocumentRequirementDefault.findMany({
    where: {
      stageId: { in: stageIds },
      isRequired: true
    },
    select: { stageId: true, documentTypeId: true }
  })

  const overrides = await db.projectSetupDocumentRequirementOverride.findMany({
    where: {
      projectId: parseInt(projectId, 10),
      stageId: { in: stageIds }
    },
    select: { stageId: true, documentTypeId: true, isRequired: true, isExcluded: true }
  })

  const requiredKeys = new Map()
  for (const r of defaultRequired) {
    requiredKeys.set(`${r.stageId}:${r.documentTypeId}`, r)
  }

  for (const o of overrides) {
    const key = `${o.stageId}:${o.documentTypeId}`
    if (o.isExcluded || !o.isRequired) {
      requiredKeys.delete(key)
      continue
    }
    requiredKeys.set(key, { stageId: o.stageId, documentTypeId: o.documentTypeId })
  }

  const requirements = Array.from(requiredKeys.values())
  if (requirements.length === 0) return []

  await db.projectIterationDocumentItem.createMany({
    data: requirements.map((r) => ({
      projectIterationId: iterationId,
      stageId: r.stageId,
      documentTypeId: r.documentTypeId
    })),
    skipDuplicates: true
  })

  return db.projectIterationDocumentItem.findMany({
    where: { projectIterationId: iterationId },
    include: {
      stage: true,
      documentType: true
    },
    orderBy: [{ stageId: 'asc' }, { documentTypeId: 'asc' }]
  })
}

exports.listProjects = async ({ projectCategoryId, search }) => {
  const where = {};
  if (projectCategoryId) where.projectCategoryId = projectCategoryId;
  if (search) {
    where.OR = [
      { code: { contains: search } },
      { name: { contains: search } }
    ];
  }

  return prisma.project.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      projectCategory: true,
      manager: { select: { id: true, email: true, firstName: true, lastName: true } },
      iterations: {
        take: 1,
        orderBy: { iterationNo: 'desc' },
        include: { currentStage: true }
      }
    }
  });
};

exports.updateProject = async (
  projectId,
  {
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
    status,
    updatedById
  }
) => {
  const existing = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      description: true,
      clientName: true,
      clientPic: true,
      teamMembers: true,
      startDate: true,
      plannedCompletionDate: true,
      actualCompletionDate: true,
      scope: true,
      objective: true,
      deliverables: true,
      managerId: true,
      status: true,
      code: true
    }
  })
  if (!existing) throw new NotFoundError('Project')

  const nextData = {}
  if (name !== undefined) {
    const trimmedName = String(name || '').trim()
    if (!trimmedName) {
      throw new ValidationError('Project name is required', [{ field: 'name', message: 'Project name is required' }])
    }
    nextData.name = trimmedName
  }

  if (description !== undefined) {
    nextData.description = description ? String(description) : null
  }

  if (clientName !== undefined) {
    nextData.clientName = clientName ? String(clientName) : null
  }

  if (clientPic !== undefined) {
    nextData.clientPic = clientPic ? String(clientPic) : null
  }

  if (teamMembers !== undefined) {
    nextData.teamMembers = teamMembers ? String(teamMembers) : null
  }

  if (startDate !== undefined) {
    nextData.startDate = startDate || null
  }

  if (plannedCompletionDate !== undefined) {
    nextData.plannedCompletionDate = plannedCompletionDate || null
  }

  if (actualCompletionDate !== undefined) {
    nextData.actualCompletionDate = actualCompletionDate || null
  }

  if (scope !== undefined) {
    nextData.scope = scope ? String(scope) : null
  }

  if (objective !== undefined) {
    nextData.objective = objective ? String(objective) : null
  }

  if (deliverables !== undefined) {
    nextData.deliverables = deliverables ? String(deliverables) : null
  }

  if (managerId !== undefined) {
    nextData.managerId = managerId
  }

  if (status !== undefined) {
    const normalizedStatus = normalizeProjectStatus(status)
    if (!normalizedStatus) {
      throw new ValidationError('Invalid project status', [{ field: 'status', message: 'Invalid project status' }])
    }
    nextData.status = normalizedStatus
  }

  if (Object.keys(nextData).length === 0) {
    throw new ValidationError('At least one project field must be provided')
  }

  const project = await prisma.project.update({
    where: { id: projectId },
    data: nextData,
    include: {
      projectCategory: true,
      manager: { select: { id: true, email: true, firstName: true, lastName: true } },
      createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      iterations: { orderBy: { iterationNo: 'desc' }, include: { currentStage: true } }
    }
  })

  await prisma.auditLog.create({
    data: {
      userId: updatedById,
      action: 'UPDATE',
      entity: 'Project',
      entityId: projectId,
      description:
        nextData.status && existing.status !== nextData.status
          ? `projectId=${projectId} changed project status from ${existing.status} to ${nextData.status}`
          : `projectId=${projectId} updated project details for ${existing.code}`,
      metadata: {
        projectId,
        code: existing.code,
        previousStatus: existing.status,
        nextStatus: project.status,
        changedFields: Object.keys(nextData)
      }
    }
  })

  return project
}

exports.deleteProject = async (projectId, { deletedById }) => {
  const existing = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, code: true }
  })
  if (!existing) throw new NotFoundError('Project')

  await prisma.project.delete({ where: { id: projectId } })

  await prisma.auditLog.create({
    data: {
      userId: deletedById,
      action: 'DELETE',
      entity: 'Project',
      entityId: projectId,
      description: `projectId=${projectId} deleted project ${existing.code}`,
      metadata: { projectId, code: existing.code }
    }
  })
}

exports.createProject = async ({
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
  managerId,
  createdById
}) => {
  const existing = await prisma.project.findUnique({ where: { code }, select: { id: true } });
  if (existing) throw new ConflictError('Project code already exists');

  const category = await prisma.projectCategory.findUnique({ where: { id: projectCategoryId }, select: { id: true } });
  if (!category) throw new NotFoundError('Project category');

  return prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
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
        managerId,
        createdById
      }
    });

    const stages = await getEnabledStagesForProject(project.id, tx)
    const firstStageId = stages[0]?.stageId || null

    const iteration = await tx.projectIteration.create({
      data: {
        projectId: project.id,
        iterationNo: 1,
        name: 'Iteration 1',
        currentStageId: firstStageId
      }
    });

    await createChecklistItemsFromRequirements(project.id, iteration.id, tx);

    await tx.auditLog.create({
      data: {
        userId: createdById,
        action: 'CREATE',
        entity: 'Project',
        entityId: project.id,
        description: `projectId=${project.id} created project ${code}`,
        metadata: { projectId: project.id, code, status: 'ACTIVE' }
      }
    })

    return tx.project.findUnique({
      where: { id: project.id },
      include: {
        projectCategory: true,
        manager: { select: { id: true, email: true, firstName: true, lastName: true } },
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
        iterations: { orderBy: { iterationNo: 'desc' }, include: { currentStage: true } }
      }
    });
  });
};

exports.getProject = async (projectId, { user } = {}) => {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      projectCategory: true,
      manager: { select: { id: true, email: true, firstName: true, lastName: true } },
      createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      iterations: { orderBy: { iterationNo: 'desc' }, include: { currentStage: true } }
    }
  });

  if (!project) throw new NotFoundError('Project');

  const enabledStages = mapEnabledStagesForView(await getEnabledStagesForProject(project.id));
  const stageNameMap = new Map(enabledStages.map((stage) => [stage.stageId, stage.name]));
  const projectWithStageView = {
    ...project,
    enabledStages,
    iterations: project.iterations.map((it) => ({
      ...it,
      currentStage: it.currentStage
        ? { ...it.currentStage, name: stageNameMap.get(it.currentStageId) || it.currentStage.name }
        : it.currentStage
    }))
  };

  const iterationIds = project.iterations.map((it) => it.id);
  if (iterationIds.length === 0) return projectWithStageView;

  const roleIds = user ? await folderPermissionService.getRoleIdsByNames(user.roles || []) : []
  const docWhere = user ? confidentialAccessService.buildConfidentialWhereClause(user, roleIds) : { isConfidential: false }

  const linkCounts = await prisma.projectDocumentLink.groupBy({
    by: ['projectIterationId'],
    where: {
      projectIterationId: { in: iterationIds },
      document: docWhere
    },
    _count: { _all: true }
  });

  const countsByIteration = new Map(linkCounts.map((r) => [r.projectIterationId, r._count._all]));

  return {
    ...projectWithStageView,
    iterations: projectWithStageView.iterations.map((it) => ({
      ...it,
      visibleDocumentLinksCount: countsByIteration.get(it.id) || 0
    }))
  };
};

exports.createIteration = async (projectId, { name, createdById }) => {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, projectCategoryId: true, status: true }
  });
  if (!project) throw new NotFoundError('Project');
  assertProjectCanProgress(project, 'add a new phase')

  const last = await prisma.projectIteration.findFirst({
    where: { projectId },
    orderBy: { iterationNo: 'desc' },
    select: { iterationNo: true }
  });
  const nextNo = (last?.iterationNo || 0) + 1;

  const stages = await getEnabledStagesForProject(project.id);
  const firstStageId = stages[0]?.stageId || null;

  return prisma.$transaction(async (tx) => {
    const iteration = await tx.projectIteration.create({
      data: {
        projectId,
        iterationNo: nextNo,
        name: name || `Iteration ${nextNo}`,
        currentStageId: firstStageId,
        isActive: true
      },
      include: { currentStage: true }
    });

    await createChecklistItemsFromRequirements(project.id, iteration.id, tx);

    await tx.auditLog.create({
      data: {
        userId: createdById,
        action: 'CREATE',
        entity: 'ProjectIteration',
        entityId: iteration.id,
        description: `projectId=${projectId} created phase ${nextNo}`,
        metadata: { projectId, iterationNo: nextNo }
      }
    });

    return iteration;
  });
};

exports.updateIteration = async (iterationId, { name, updatedById }) => {
  const existing = await prisma.projectIteration.findUnique({
    where: { id: iterationId },
    select: { id: true, projectId: true, iterationNo: true, name: true }
  });
  if (!existing) throw new NotFoundError('Project iteration');

  const trimmedName = String(name || '').trim();
  if (!trimmedName) {
    throw new ValidationError('Phase name is required', [{ field: 'name', message: 'Phase name is required' }]);
  }

  const iteration = await prisma.projectIteration.update({
    where: { id: iterationId },
    data: { name: trimmedName },
    include: { currentStage: true }
  });

  await prisma.auditLog.create({
    data: {
      userId: updatedById,
      action: 'UPDATE',
      entity: 'ProjectIteration',
      entityId: iterationId,
      description: `projectId=${existing.projectId} renamed phase ${existing.iterationNo} from "${existing.name || ''}" to "${trimmedName}"`,
      metadata: {
        projectId: existing.projectId,
        iterationNo: existing.iterationNo,
        previousName: existing.name,
        nextName: trimmedName
      }
    }
  });

  return iteration;
};

exports.listIterationItems = async (iterationId, { user }) => {
  const iteration = await prisma.projectIteration.findUnique({
    where: { id: iterationId },
    include: { project: { select: { id: true, projectCategoryId: true } } }
  })
  if (!iteration) throw new NotFoundError('Project iteration')

  const existingCount = await prisma.projectIterationDocumentItem.count({ where: { projectIterationId: iterationId } })
  if (existingCount === 0) {
    await createChecklistItemsFromRequirements(iteration.project.id, iterationId, prisma)
  }

  const categoryStages = await getEffectiveStagesForProject(iteration.project.id)
  const stageNameMap = new Map(
    categoryStages.map((cs) => [
      cs.stageId,
      cs.displayName || cs.stage?.name
    ])
  )

  const roleIds = user ? await folderPermissionService.getRoleIdsByNames(user.roles || []) : []

  const items = await prisma.projectIterationDocumentItem.findMany({
    where: { projectIterationId: iterationId },
    include: {
      stage: true,
      documentType: true,
      links: {
        include: {
          document: {
            select: buildLinkedDocumentAccessSelect(user, roleIds)
          }
        },
        orderBy: { linkedAt: 'desc' }
      }
    },
    orderBy: [{ stageId: 'asc' }, { documentTypeId: 'asc' }]
  });

  const withStageNames = items.map((item) => ({
    ...item,
    stage: item.stage
      ? { ...item.stage, name: stageNameMap.get(item.stageId) || item.stage.name }
      : item.stage,
    links: (item.links || []).map((link) => ({
      ...link,
      document: serializeLinkedDocumentForUser(link.document, user, roleIds)
    }))
  }))

  return withStageNames;
};

exports.linkDocumentToItem = async (itemId, { documentId, linkedById }) => {
  return prisma.$transaction(async (tx) => {
    const item = await tx.projectIterationDocumentItem.findUnique({
      where: { id: itemId },
      include: {
        iteration: {
          include: {
            project: {
              select: { id: true, status: true }
            }
          }
        }
      }
    });
    if (!item) throw new NotFoundError('Project item');
    assertProjectCanProgress(item.iteration.project, 'link documents to this project')

    const doc = await tx.document.findUnique({
      where: { id: documentId },
      select: { id: true, status: true }
    });
    if (!doc) throw new NotFoundError('Document');

    const exists = await tx.projectDocumentLink.findFirst({
      where: { projectIterationId: item.projectIterationId, documentId },
      select: { id: true }
    });

    if (exists) throw new ConflictError('Document already linked to this iteration');

    const link = await tx.projectDocumentLink.create({
      data: {
        projectIterationId: item.projectIterationId,
        stageId: item.stageId,
        itemId: item.id,
        documentId,
        linkedById
      },
      include: {
        document: { select: { id: true, fileCode: true, title: true, status: true, stage: true, isConfidential: true } }
      }
    });

    let updatedItem = item;
    if (doc.status === 'PUBLISHED' && item.status !== 'COMPLETE') {
      updatedItem = await tx.projectIterationDocumentItem.update({
        where: { id: item.id },
        data: { status: 'COMPLETE', completedAt: new Date() }
      });
    }

    return { link, item: updatedItem };
  });
};

exports.unlinkDocumentFromItem = async (itemId, linkId, { user } = {}) => {
  return prisma.$transaction(async (tx) => {
    const item = await tx.projectIterationDocumentItem.findUnique({
      where: { id: itemId },
      include: {
        iteration: {
          include: {
            project: {
              select: { id: true, status: true }
            }
          }
        }
      }
    })
    if (!item) throw new NotFoundError('Project item')
    assertProjectCanProgress(item.iteration.project, 'remove linked documents from this project')

    const roleIds = user ? await folderPermissionService.getRoleIdsByNames(user.roles || []) : []
    const link = await tx.projectDocumentLink.findFirst({
      where: {
        id: linkId,
        itemId,
        projectIterationId: item.projectIterationId,
        stageId: item.stageId
      },
      include: {
        document: {
          select: buildLinkedDocumentAccessSelect(user, roleIds, { status: true })
        }
      }
    })
    if (!link) throw new NotFoundError('Project document link')

    if (!canInteractWithLinkedDocument(link.document, user, roleIds)) {
      throw new ForbiddenError('You do not have access to unlink this confidential document')
    }

    await tx.projectDocumentLink.delete({ where: { id: link.id } })

    const remainingLinks = await tx.projectDocumentLink.findMany({
      where: {
        itemId,
        projectIterationId: item.projectIterationId
      },
      select: {
        document: {
          select: { status: true }
        }
      }
    })
    const remainingPublished = remainingLinks.filter((entry) => entry.document?.status === 'PUBLISHED').length

    let updatedItem = { id: item.id, status: item.status }
    if (remainingPublished === 0 && item.status === 'COMPLETE') {
      updatedItem = await tx.projectIterationDocumentItem.update({
        where: { id: itemId },
        data: { status: 'PENDING', completedAt: null }
      })
    }

    return { removedLinkId: link.id, item: updatedItem }
  })
}

exports.listIterationStageDocuments = async (iterationId, { user }) => {
  const iteration = await prisma.projectIteration.findUnique({
    where: { id: iterationId },
    include: { project: { select: { id: true, projectCategoryId: true } } }
  })
  if (!iteration) throw new NotFoundError('Project iteration')

  const categoryStages = await getEffectiveStagesForProject(iteration.project.id)
  const stageNameMap = new Map(
    categoryStages.map((cs) => [
      cs.stageId,
      cs.displayName || cs.stage?.name
    ])
  )

  const roleIds = user ? await folderPermissionService.getRoleIdsByNames(user.roles || []) : []

  const links = await prisma.projectDocumentLink.findMany({
    where: {
      projectIterationId: iterationId,
      itemId: null
    },
    include: {
      document: {
        select: buildLinkedDocumentAccessSelect(user, roleIds, {
          documentTypeId: true,
          documentType: { select: { id: true, name: true } }
        })
      },
      stage: true
    },
    orderBy: { linkedAt: 'desc' }
  })

  return links.map((link) => ({
    ...link,
    document: serializeLinkedDocumentForUser(link.document, user, roleIds),
    stage: link.stage
      ? { ...link.stage, name: stageNameMap.get(link.stageId) || link.stage.name }
      : link.stage
  }))
}

exports.linkDocumentToStage = async (iterationId, stageId, { documentId, linkedById }) => {
  return prisma.$transaction(async (tx) => {
    const iteration = await tx.projectIteration.findUnique({
      where: { id: iterationId },
      include: {
        project: {
          select: { id: true, status: true }
        }
      }
    })
    if (!iteration) throw new NotFoundError('Project iteration')
    assertProjectCanProgress(iteration.project, 'link documents to this project')

    const stage = await tx.projectStageDefinition.findUnique({ where: { id: stageId }, select: { id: true } })
    if (!stage) throw new NotFoundError('Project stage')

    const doc = await tx.document.findUnique({ where: { id: documentId }, select: { id: true, status: true } })
    if (!doc) throw new NotFoundError('Document')

    const exists = await tx.projectDocumentLink.findFirst({
      where: { projectIterationId: iterationId, documentId },
      select: { id: true }
    })
    if (exists) throw new ConflictError('Document already linked to this iteration')

    const link = await tx.projectDocumentLink.create({
      data: {
        projectIterationId: iterationId,
        stageId,
        itemId: null,
        documentId,
        linkedById
      },
      include: {
        document: { select: { id: true, fileCode: true, title: true, status: true, stage: true, isConfidential: true } },
        stage: true
      }
    })

    return { link }
  })
}

exports.unlinkDocumentFromStage = async (iterationId, stageId, linkId, { user } = {}) => {
  const iteration = await prisma.projectIteration.findUnique({
    where: { id: iterationId },
    include: {
      project: {
        select: { id: true, status: true }
      }
    }
  })
  if (!iteration) throw new NotFoundError('Project iteration')
  assertProjectCanProgress(iteration.project, 'remove linked documents from this project')

  const roleIds = user ? await folderPermissionService.getRoleIdsByNames(user.roles || []) : []
  const link = await prisma.projectDocumentLink.findFirst({
    where: {
      id: linkId,
      projectIterationId: iterationId,
      stageId,
      itemId: null
    },
    select: {
      id: true,
      document: {
        select: buildLinkedDocumentAccessSelect(user, roleIds)
      }
    }
  })
  if (!link) throw new NotFoundError('Project document link')

  if (!canInteractWithLinkedDocument(link.document, user, roleIds)) {
    throw new ForbiddenError('You do not have access to unlink this confidential document')
  }

  await prisma.projectDocumentLink.delete({ where: { id: link.id } })
  return { removedLinkId: link.id }
}

exports.createDocumentFromItem = async (itemId, { title, description, createdById }) => {
  const item = await prisma.projectIterationDocumentItem.findUnique({
    where: { id: itemId },
    include: {
      iteration: {
        include: {
          project: true
        }
      },
      stage: true,
      documentType: true
    }
  })
  if (!item) throw new NotFoundError('Project item')
  assertProjectCanProgress(item.iteration.project, 'create new documents for this project')

  const projectCategoryId = item.iteration.project.projectCategoryId
  const projectId = item.iteration.project.id

  const overrideRequirement = await prisma.projectSetupDocumentRequirementOverride.findFirst({
    where: {
      projectId,
      stageId: item.stageId,
      documentTypeId: item.documentTypeId,
      isExcluded: false
    },
    select: { id: true, isConfidentialDefault: true }
  })

  const defaultRequirement = overrideRequirement
    ? null
    : await prisma.projectSetupDocumentRequirementDefault.findFirst({
        where: {
          stageId: item.stageId,
          documentTypeId: item.documentTypeId
        },
        select: { id: true, isConfidentialDefault: true }
      })

  const requirement = overrideRequirement || defaultRequirement
  const requirementScope = overrideRequirement ? 'OVERRIDE' : defaultRequirement ? 'DEFAULT' : null
  const isConfidential = Boolean(requirement?.isConfidentialDefault)

  const document = await documentService.createDocument({
    title,
    description,
    documentTypeId: item.documentTypeId,
    projectCategoryId,
    folderId: null,
    isConfidential
  }, createdById)

  if (isConfidential && requirement?.id && requirementScope) {
    await confidentialAccessService.applyProjectSetupRequirementAccessToDocument(
      { scope: requirementScope, requirementId: requirement.id },
      document.id
    )
  }

  const link = await prisma.projectDocumentLink.create({
    data: {
      projectIterationId: item.projectIterationId,
      stageId: item.stageId,
      itemId: item.id,
      documentId: document.id,
      linkedById: createdById
    }
  })

  return { document, link }
}

exports.createDocumentForStage = async (iterationId, stageId, { documentTypeId, title, description, createdById }) => {
  const iteration = await prisma.projectIteration.findUnique({
    where: { id: iterationId },
    include: { project: true }
  })
  if (!iteration) throw new NotFoundError('Project iteration')
  assertProjectCanProgress(iteration.project, 'create new documents for this project')

  const stage = await prisma.projectStageDefinition.findUnique({ where: { id: stageId }, select: { id: true } })
  if (!stage) throw new NotFoundError('Project stage')

  const docType = await prisma.documentType.findUnique({ where: { id: documentTypeId }, select: { id: true } })
  if (!docType) throw new NotFoundError('Document type')

  const overrideRequirement = await prisma.projectSetupDocumentRequirementOverride.findFirst({
    where: {
      projectId: iteration.project.id,
      stageId,
      documentTypeId,
      isExcluded: false
    },
    select: { id: true, isConfidentialDefault: true }
  })

  const defaultRequirement = overrideRequirement
    ? null
    : await prisma.projectSetupDocumentRequirementDefault.findFirst({
        where: { stageId, documentTypeId },
        select: { id: true, isConfidentialDefault: true }
      })

  const requirement = overrideRequirement || defaultRequirement
  const requirementScope = overrideRequirement ? 'OVERRIDE' : defaultRequirement ? 'DEFAULT' : null
  const isConfidential = Boolean(requirement?.isConfidentialDefault)

  const document = await documentService.createDocument({
    title,
    description,
    documentTypeId,
    projectCategoryId: iteration.project.projectCategoryId,
    folderId: null,
    isConfidential
  }, createdById)

  if (isConfidential && requirement?.id && requirementScope) {
    await confidentialAccessService.applyProjectSetupRequirementAccessToDocument(
      { scope: requirementScope, requirementId: requirement.id },
      document.id
    )
  }

  const link = await prisma.projectDocumentLink.create({
    data: {
      projectIterationId: iterationId,
      stageId,
      itemId: null,
      documentId: document.id,
      linkedById: createdById
    },
    include: {
      document: { select: { id: true, fileCode: true, title: true, status: true, isConfidential: true } },
      stage: true
    }
  })

  return { document, link }
}

exports.advanceIterationStage = async (iterationId, { advancedById }) => {
  const iteration = await prisma.projectIteration.findUnique({
    where: { id: iterationId },
    include: {
      project: true,
      currentStage: true
    }
  })
  if (!iteration) throw new NotFoundError('Project iteration')
  assertProjectCanProgress(iteration.project, 'move this phase to the next stage')

  const enabledStages = await getEnabledStagesForProject(iteration.project.id)
  if (enabledStages.length === 0) throw new ValidationError('No enabled stages configured for this project')

  const currentStageId = iteration.currentStageId || enabledStages[0].stageId
  const currentIdx = enabledStages.findIndex((s) => s.stageId === currentStageId)
  const idx = currentIdx >= 0 ? currentIdx : 0
  const current = enabledStages[idx]
  const next = enabledStages[idx + 1]
  if (!next) throw new ValidationError('Already at the last stage')

  const pendingItems = await prisma.projectIterationDocumentItem.findMany({
    where: {
      projectIterationId: iterationId,
      stageId: current.stageId,
      status: 'PENDING'
    },
    include: {
      documentType: {
        select: { name: true }
      }
    },
    orderBy: { documentTypeId: 'asc' }
  })

  if (pendingItems.length > 0) {
    const preview = pendingItems.slice(0, 3).map((item) => item.documentType?.name || `Document type ${item.documentTypeId}`)
    const overflow = pendingItems.length - preview.length
    const currentStageLabel = current.displayName || current.stage?.name || iteration.currentStage?.name || 'current stage'
    const suffix = overflow > 0 ? ` and ${overflow} more` : ''
    throw new ValidationError(
      `Cannot move to the next stage. Pending required documents in ${currentStageLabel}: ${preview.join(', ')}${suffix}.`,
      pendingItems.map((item) => ({
        field: 'stageItems',
        message: item.documentType?.name || `Document type ${item.documentTypeId}`,
        stageId: item.stageId,
        documentTypeId: item.documentTypeId
      }))
    )
  }

  const updated = await prisma.projectIteration.update({
    where: { id: iterationId },
    data: { currentStageId: next.stageId },
    include: { currentStage: true }
  })

  await prisma.auditLog.create({
    data: {
      userId: advancedById,
      action: 'UPDATE',
      entity: 'ProjectIteration',
      entityId: iterationId,
      description: `projectId=${iteration.projectId} moved phase ${iteration.iterationNo} to next stage`,
      metadata: {
        projectId: iteration.projectId,
        iterationNo: iteration.iterationNo,
        fromStageId: current.stageId,
        toStageId: next.stageId
      }
    }
  })

  return { iteration: updated }
}

exports.handleDocumentPublished = async (documentId) => {
  const links = await prisma.projectDocumentLink.findMany({
    where: { documentId },
    select: { itemId: true }
  })

  const itemIds = Array.from(new Set(links.map((l) => l.itemId).filter((x) => !!x)))
  if (itemIds.length === 0) return { updatedCount: 0 }

  const updated = await prisma.projectIterationDocumentItem.updateMany({
    where: {
      id: { in: itemIds },
      status: 'PENDING'
    },
    data: { status: 'COMPLETE', completedAt: new Date() }
  })

  return { updatedCount: updated.count }
}

exports.getProjectActivityLogs = async (projectId, { page = 1, limit = 20 } = {}) => {
  const pid = parseInt(projectId, 10)
  if (!Number.isFinite(pid)) throw new ValidationError('Invalid projectId')

  const needle = `projectId=${pid}`
  const where = {
    OR: [
      {
        entity: 'Project',
        entityId: pid
      },
      {
        description: { contains: needle }
      }
    ]
  }

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10)
  const take = parseInt(limit, 10)

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take
    })
  ])

  const items = logs.map((log) => ({
    id: log.id,
    timestamp: log.createdAt.toISOString(),
    user: log.user ? `${log.user.firstName || ''} ${log.user.lastName || ''}`.trim() || log.user.email : 'System',
    action: log.action,
    entity: log.entity,
    description: log.description || `${log.action} ${log.entity}`,
    metadata:
      log.metadata == null
        ? null
        : typeof log.metadata === 'string'
          ? JSON.parse(log.metadata)
          : log.metadata
  }))

  return { logs: items, total, page: parseInt(page, 10), limit: take }
}

exports.listProjectChangeRequests = async (projectId, { iterationId } = {}) => {
  const pid = parseInt(projectId, 10)
  if (!Number.isFinite(pid)) throw new ValidationError('Invalid projectId')

  const where = { projectId: pid }
  if (iterationId !== undefined) {
    const iid = parseInt(iterationId, 10)
    if (!Number.isFinite(iid)) throw new ValidationError('Invalid iterationId')
    where.projectIterationId = iid
  }

  return prisma.projectChangeRequest.findMany({
    where,
    include: {
      iteration: { select: { id: true, iterationNo: true, name: true } },
      createdBy: { select: { id: true, email: true, firstName: true, lastName: true } }
    },
    orderBy: [{ dateApproved: 'asc' }, { createdAt: 'asc' }]
  })
}

exports.createProjectChangeRequest = async (projectId, payload) => {
  const pid = parseInt(projectId, 10)
  if (!Number.isFinite(pid)) throw new ValidationError('Invalid projectId')

  const project = await prisma.project.findUnique({ where: { id: pid } })
  if (!project) throw new NotFoundError('Project not found')

  const changeId = String(payload?.changeId || '').trim()
  if (!changeId) throw new ValidationError('changeId is required')

  const description = String(payload?.description || '').trim()
  if (!description) throw new ValidationError('description is required')

  const createdById = parseInt(payload?.createdById, 10)
  if (!Number.isFinite(createdById)) throw new ValidationError('createdById is required')

  const projectIterationId =
    payload?.projectIterationId === null || payload?.projectIterationId === undefined
      ? null
      : parseInt(payload.projectIterationId, 10)

  if (projectIterationId) {
    const iteration = await prisma.projectIteration.findUnique({
      where: { id: projectIterationId },
      select: { id: true, projectId: true }
    })
    if (!iteration || iteration.projectId !== pid) throw new ValidationError('Invalid projectIterationId')
  }

  try {
    const created = await prisma.projectChangeRequest.create({
      data: {
        projectId: pid,
        projectIterationId,
        changeId,
        phaseRef: payload?.phaseRef ?? null,
        description,
        impact: payload?.impact ?? null,
        authorizedBy: payload?.authorizedBy ?? null,
        complianceSignOff: payload?.complianceSignOff ?? null,
        dateApproved: payload?.dateApproved ?? null,
        createdById
      },
      include: {
        iteration: { select: { id: true, iterationNo: true, name: true } },
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } }
      }
    })

    await prisma.auditLog.create({
      data: {
        userId: createdById,
        action: 'CREATE',
        entity: 'ProjectChangeRequest',
        entityId: created.id,
        description: `projectId=${pid} created change request ${created.changeId}`,
        metadata: {
          projectId: pid,
          projectIterationId: created.projectIterationId,
          changeId: created.changeId
        }
      }
    })

    return created
  } catch (e) {
    if (e?.code === 'P2002') {
      throw new ConflictError('changeId already exists for this project')
    }
    throw e
  }
}

exports.updateProjectChangeRequest = async (changeRequestId, payload) => {
  const id = parseInt(changeRequestId, 10)
  if (!Number.isFinite(id)) throw new ValidationError('Invalid changeRequestId')

  const existing = await prisma.projectChangeRequest.findUnique({
    where: { id },
    select: { id: true, projectId: true }
  })
  if (!existing) throw new NotFoundError('Change request not found')

  const updatedById = parseInt(payload?.updatedById, 10)
  if (!Number.isFinite(updatedById)) throw new ValidationError('updatedById is required')

  let projectIterationId = undefined
  if (payload?.projectIterationId !== undefined) {
    projectIterationId =
      payload.projectIterationId === null || payload.projectIterationId === ''
        ? null
        : parseInt(payload.projectIterationId, 10)

    if (projectIterationId) {
      const iteration = await prisma.projectIteration.findUnique({
        where: { id: projectIterationId },
        select: { id: true, projectId: true }
      })
      if (!iteration || iteration.projectId !== existing.projectId) throw new ValidationError('Invalid projectIterationId')
    }
  }

  const data = {}
  if (projectIterationId !== undefined) data.projectIterationId = projectIterationId
  if (payload?.changeId !== undefined) data.changeId = String(payload.changeId).trim()
  if (payload?.phaseRef !== undefined) data.phaseRef = payload.phaseRef
  if (payload?.description !== undefined) data.description = String(payload.description).trim()
  if (payload?.impact !== undefined) data.impact = payload.impact
  if (payload?.authorizedBy !== undefined) data.authorizedBy = payload.authorizedBy
  if (payload?.complianceSignOff !== undefined) data.complianceSignOff = payload.complianceSignOff
  if (payload?.dateApproved !== undefined) data.dateApproved = payload.dateApproved

  if (data.changeId !== undefined && !data.changeId) throw new ValidationError('changeId is required')
  if (data.description !== undefined && !data.description) throw new ValidationError('description is required')

  try {
    const updated = await prisma.projectChangeRequest.update({
      where: { id },
      data,
      include: {
        iteration: { select: { id: true, iterationNo: true, name: true } },
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } }
      }
    })

    await prisma.auditLog.create({
      data: {
        userId: updatedById,
        action: 'UPDATE',
        entity: 'ProjectChangeRequest',
        entityId: id,
        description: `projectId=${existing.projectId} updated change request ${updated.changeId}`,
        metadata: { projectId: existing.projectId, changeRequestId: id }
      }
    })

    return updated
  } catch (e) {
    if (e?.code === 'P2002') {
      throw new ConflictError('changeId already exists for this project')
    }
    throw e
  }
}

exports.deleteProjectChangeRequest = async (changeRequestId, { deletedById } = {}) => {
  const id = parseInt(changeRequestId, 10)
  if (!Number.isFinite(id)) throw new ValidationError('Invalid changeRequestId')

  const existing = await prisma.projectChangeRequest.findUnique({
    where: { id },
    select: { id: true, projectId: true, changeId: true }
  })
  if (!existing) throw new NotFoundError('Change request not found')

  const uid = parseInt(deletedById, 10)
  if (!Number.isFinite(uid)) throw new ValidationError('deletedById is required')

  await prisma.projectChangeRequest.delete({ where: { id } })
  await prisma.auditLog.create({
    data: {
      userId: uid,
      action: 'DELETE',
      entity: 'ProjectChangeRequest',
      entityId: id,
      description: `projectId=${existing.projectId} deleted change request ${existing.changeId}`,
      metadata: { projectId: existing.projectId, changeRequestId: id, changeId: existing.changeId }
    }
  })

  return { id }
}

exports.searchDocuments = async ({ projectId, q }, { user }) => {
  const query = String(q || '').trim()

  const normalizeSearchValue = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const normalizedQuery = normalizeSearchValue(query)
  const roleIds = user ? await folderPermissionService.getRoleIdsByNames(user.roles || []) : []

  const andWhere = []
  if (user?.id) {
    andWhere.push(documentAssignmentService.buildAccessWhereClause(user.id, roleIds))
  }
  if (user) {
    andWhere.push(confidentialAccessService.buildConfidentialWhereClause(user, roleIds))
  }
  if (projectId) {
    andWhere.push({ projectLinks: { some: { iteration: { projectId } } } })
  }

  if (query) {
    const tokens = new Set(
      String(query)
        .trim()
        .split(/[^A-Za-z0-9]+/g)
        .filter(Boolean)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2)
    )
    tokens.add(query)

    const normalizedPrefix = normalizedQuery ? normalizedQuery.slice(0, Math.min(3, normalizedQuery.length)) : ''
    if (normalizedPrefix && normalizedPrefix.length >= 2) tokens.add(normalizedPrefix)

    const tokenList = Array.from(tokens).slice(0, 12)
    const orWhere = tokenList.flatMap((t) => ([
      { fileCode: { contains: t } },
      { title: { contains: t } },
      { description: { contains: t } }
    ]))
    andWhere.push({ OR: orWhere })
  }

  let candidates
  try {
    candidates = await prisma.document.findMany({
      where: andWhere.length > 0 ? { AND: andWhere } : {},
      select: {
        id: true,
        fileCode: true,
        title: true,
        description: true,
        status: true,
        isConfidential: true,
        updatedAt: true,
        documentTypeId: true,
        documentType: { select: { id: true, name: true } }
      },
      orderBy: { updatedAt: 'desc' },
      take: query ? 2000 : 500
    })
  } catch (error) {
    throw error
  }

  const fetchWithLinks = async (ids) => {
    if (!ids?.length) return []
    return prisma.document.findMany({
      where: {
        AND: andWhere.length > 0 ? [{ AND: andWhere }, { id: { in: ids } }] : [{ id: { in: ids } }]
      },
      select: {
        id: true,
        fileCode: true,
        title: true,
        description: true,
        status: true,
        isConfidential: true,
        updatedAt: true,
        documentTypeId: true,
        documentType: { select: { id: true, name: true } },
        projectLinks: {
          where: projectId ? { iteration: { projectId } } : undefined,
          orderBy: { linkedAt: 'desc' },
          take: 3,
          include: {
            iteration: {
              include: {
                project: { include: { projectCategory: true } }
              }
            },
            stage: true,
            item: { include: { documentType: true } }
          }
        }
      }
    })
  }

  const toResult = (doc) => {
    const latestLink = doc.projectLinks[0] || null
    return {
      id: doc.id,
      fileCode: doc.fileCode,
      title: doc.title,
      status: doc.status,
      isConfidential: doc.isConfidential,
      updatedAt: doc.updatedAt,
      documentTypeId: doc.documentTypeId,
      documentType: doc.documentType,
      document: {
        id: doc.id,
        fileCode: doc.fileCode,
        title: doc.title,
        status: doc.status,
        isConfidential: doc.isConfidential,
        updatedAt: doc.updatedAt,
        documentTypeId: doc.documentTypeId,
        documentType: doc.documentType
      },
      iteration: latestLink?.iteration || null,
      stage: latestLink?.stage || null,
      item: latestLink?.item || null
    }
  }

  if (!query) {
    const ids = candidates.slice(0, 200).map((d) => d.id)
    const docs = await fetchWithLinks(ids)
    const byId = new Map(docs.map((d) => [d.id, d]))
    return ids.map((id) => toResult(byId.get(id))).filter(Boolean)
  }

  const scored = candidates
    .map((doc) => {
      const normalizedFileCode = normalizeSearchValue(doc.fileCode)
      const normalizedTitle = normalizeSearchValue(doc.title)
      const normalizedDescription = normalizeSearchValue(doc.description)

      const directFileCodeMatch = String(doc.fileCode || '').toLowerCase().includes(query.toLowerCase())
      const directTitleMatch = String(doc.title || '').toLowerCase().includes(query.toLowerCase())
      const normalizedFileCodeMatch = normalizedQuery ? normalizedFileCode.includes(normalizedQuery) : false
      const normalizedTitleMatch = normalizedQuery ? normalizedTitle.includes(normalizedQuery) : false
      const normalizedDescriptionMatch = normalizedQuery ? normalizedDescription.includes(normalizedQuery) : false

      if (!directFileCodeMatch && !directTitleMatch && !normalizedFileCodeMatch && !normalizedTitleMatch && !normalizedDescriptionMatch) {
        return null
      }

      let score = 0
      if (normalizedQuery && normalizedFileCode.startsWith(normalizedQuery)) score += 120
      if (directFileCodeMatch) score += 100
      if (normalizedFileCodeMatch) score += 80
      if (directTitleMatch) score += 50
      if (normalizedTitleMatch) score += 30
      if (normalizedDescriptionMatch) score += 10

      return {
        score,
        updatedAt: doc.updatedAt,
        id: doc.id
      }
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
    .slice(0, 200)
    .map((entry) => entry.id)

  const docs = await fetchWithLinks(scored)
  const byId = new Map(docs.map((d) => [d.id, d]))
  return scored.map((id) => toResult(byId.get(id))).filter(Boolean)
};

exports.getCategoryStages = async (projectCategoryId) => {
  const category = await prisma.projectCategory.findUnique({ where: { id: projectCategoryId }, select: { id: true } })
  if (!category) throw new NotFoundError('Project category')

  const rows = await ensureCategoryStages(projectCategoryId)
  return rows.map((r) => ({
    id: r.id,
    stageId: r.stageId,
    displayName: r.displayName,
    sortOrder: r.sortOrder ?? r.stage?.sortOrder ?? null,
    isEnabled: r.isEnabled,
    stage: r.stage
      ? { id: r.stage.id, key: r.stage.key, name: r.stage.name, sortOrder: r.stage.sortOrder, isActive: r.stage.isActive }
      : null
  }))
}

exports.createCategoryStage = async (projectCategoryId, { name, displayName, createdById }) => {
  const category = await prisma.projectCategory.findUnique({ where: { id: projectCategoryId }, select: { id: true, name: true } })
  if (!category) throw new NotFoundError('Project category')

  const trimmedName = String(name || '').trim()
  if (!trimmedName) throw new ValidationError('Stage name is required')

  const existingStages = await ensureCategoryStages(projectCategoryId)
  const maxSortOrder = existingStages.reduce((max, s) => Math.max(max, s.sortOrder ?? s.stage?.sortOrder ?? 0), 0)

  const baseKey = slugifyStageKey(trimmedName) || 'custom_stage'
  const uniqueKey = `${baseKey}_${projectCategoryId}_${Date.now()}`

  await prisma.$transaction(async (tx) => {
    const stage = await tx.projectStageDefinition.create({
      data: {
        key: uniqueKey,
        name: trimmedName,
        sortOrder: maxSortOrder + 1,
        isSystem: false,
        isActive: true
      }
    })

    await tx.projectCategoryStage.create({
      data: {
        projectCategoryId,
        stageId: stage.id,
        displayName: displayName || trimmedName,
        sortOrder: maxSortOrder + 1,
        isEnabled: true
      }
    })

    await tx.auditLog.create({
      data: {
        userId: createdById,
        action: 'CREATE',
        entity: 'ProjectCategoryStage',
        entityId: stage.id,
        metadata: { projectCategoryId, stageId: stage.id, stageName: trimmedName }
      }
    })
  })

  const categoryStages = await exports.getCategoryStages(projectCategoryId)
  return categoryStages[categoryStages.length - 1] || null
}

exports.updateCategoryStages = async (projectCategoryId, stages, { updatedById }) => {
  const category = await prisma.projectCategory.findUnique({ where: { id: projectCategoryId }, select: { id: true } })
  if (!category) throw new NotFoundError('Project category')

  const normalized = stages.map((s) => ({
    stageId: Number(s.stageId),
    displayName: s.displayName !== undefined ? (s.displayName ? String(s.displayName) : null) : undefined,
    sortOrder: s.sortOrder !== undefined && s.sortOrder !== null && s.sortOrder !== '' ? Number(s.sortOrder) : null,
    isEnabled: Boolean(s.isEnabled)
  }))

  if (normalized.some((s) => !s.stageId)) throw new ValidationError('Invalid stageId in stages payload')

  await prisma.$transaction(async (tx) => {
    for (const s of normalized) {
      await tx.projectCategoryStage.upsert({
        where: { projectCategoryId_stageId: { projectCategoryId, stageId: s.stageId } },
        update: {
          displayName: s.displayName,
          sortOrder: s.sortOrder,
          isEnabled: s.isEnabled
        },
        create: {
          projectCategoryId,
          stageId: s.stageId,
          displayName: s.displayName,
          sortOrder: s.sortOrder,
          isEnabled: s.isEnabled
        }
      })
    }

    await tx.auditLog.create({
      data: {
        userId: updatedById,
        action: 'UPDATE',
        entity: 'ProjectCategoryStage',
        entityId: null,
        metadata: { projectCategoryId, count: normalized.length }
      }
    })
  })

  return exports.getCategoryStages(projectCategoryId)
}

exports.listCategoryRequirements = async (projectCategoryId) => {
  const category = await prisma.projectCategory.findUnique({ where: { id: projectCategoryId }, select: { id: true } })
  if (!category) throw new NotFoundError('Project category')

  return prisma.projectCategoryDocumentRequirement.findMany({
    where: { projectCategoryId },
    include: {
      stage: true,
      documentType: true
    },
    orderBy: [{ stageId: 'asc' }, { documentTypeId: 'asc' }]
  })
}

exports.createCategoryRequirement = async (projectCategoryId, { stageId, documentTypeId, isRequired, isConfidentialDefault, createdById }) => {
  const category = await prisma.projectCategory.findUnique({ where: { id: projectCategoryId }, select: { id: true } })
  if (!category) throw new NotFoundError('Project category')

  const stage = await prisma.projectStageDefinition.findUnique({ where: { id: stageId }, select: { id: true } })
  if (!stage) throw new NotFoundError('Project stage')

  const docType = await prisma.documentType.findUnique({ where: { id: documentTypeId }, select: { id: true } })
  if (!docType) throw new NotFoundError('Document type')

  try {
    const requirement = await prisma.projectCategoryDocumentRequirement.create({
      data: {
        projectCategoryId,
        stageId,
        documentTypeId,
        isRequired: Boolean(isRequired),
        isConfidentialDefault: Boolean(isConfidentialDefault)
      },
      include: { stage: true, documentType: true }
    })

    await prisma.auditLog.create({
      data: {
        userId: createdById,
        action: 'CREATE',
        entity: 'ProjectCategoryDocumentRequirement',
        entityId: requirement.id,
        metadata: { projectCategoryId, stageId, documentTypeId }
      }
    })

    return requirement
  } catch (e) {
    throw new ConflictError('Requirement already exists for this category + stage + document type')
  }
}

exports.updateRequirement = async (requirementId, { isRequired, isConfidentialDefault, updatedById }) => {
  const existing = await prisma.projectCategoryDocumentRequirement.findUnique({
    where: { id: requirementId },
    select: { id: true }
  })
  if (!existing) throw new NotFoundError('Requirement')

  const requirement = await prisma.projectCategoryDocumentRequirement.update({
    where: { id: requirementId },
    data: {
      ...(isRequired !== undefined ? { isRequired } : {}),
      ...(isConfidentialDefault !== undefined ? { isConfidentialDefault } : {})
    },
    include: { stage: true, documentType: true }
  })

  await prisma.auditLog.create({
    data: {
      userId: updatedById,
      action: 'UPDATE',
      entity: 'ProjectCategoryDocumentRequirement',
      entityId: requirement.id,
      metadata: { requirementId }
    }
  })

  return requirement
}

exports.deleteRequirement = async (requirementId, { deletedById }) => {
  const existing = await prisma.projectCategoryDocumentRequirement.findUnique({
    where: { id: requirementId },
    select: { id: true }
  })
  if (!existing) throw new NotFoundError('Requirement')

  await prisma.projectCategoryDocumentRequirement.delete({ where: { id: requirementId } })

  await prisma.auditLog.create({
    data: {
      userId: deletedById,
      action: 'DELETE',
      entity: 'ProjectCategoryDocumentRequirement',
      entityId: requirementId,
      metadata: { requirementId }
    }
  })
}

const mapStageConfigRowForView = (r) => ({
  id: r.id,
  stageId: r.stageId,
  displayName: r.displayName ?? null,
  sortOrder: r.sortOrder ?? r.stage?.sortOrder ?? null,
  isEnabled: Boolean(r.isEnabled),
  stage: r.stage
    ? { id: r.stage.id, key: r.stage.key, name: r.stage.name, sortOrder: r.stage.sortOrder, isActive: r.stage.isActive }
    : null
})

exports.getSetupStages = async () => {
  const rows = await ensureDefaultSetupStages()
  return rows.map(mapStageConfigRowForView)
}

exports.createSetupStage = async ({ name, displayName, createdById }) => {
  const trimmedName = String(name || '').trim()
  if (!trimmedName) throw new ValidationError('Stage name is required')

  const existingStages = await ensureDefaultSetupStages()
  const maxSortOrder = existingStages.reduce((max, s) => Math.max(max, s.sortOrder ?? s.stage?.sortOrder ?? 0), 0)

  const baseKey = slugifyStageKey(trimmedName) || 'custom_stage'
  const uniqueKey = `${baseKey}_${Date.now()}`

  await prisma.$transaction(async (tx) => {
    const stage = await tx.projectStageDefinition.create({
      data: {
        key: uniqueKey,
        name: trimmedName,
        sortOrder: maxSortOrder + 1,
        isSystem: false,
        isActive: true
      }
    })

    await tx.projectSetupStageDefault.create({
      data: {
        stageId: stage.id,
        displayName: displayName || trimmedName,
        sortOrder: maxSortOrder + 1,
        isEnabled: true
      }
    })

    await tx.auditLog.create({
      data: {
        userId: createdById,
        action: 'CREATE',
        entity: 'ProjectSetupStageDefault',
        entityId: stage.id,
        metadata: { stageId: stage.id, stageName: trimmedName }
      }
    })
  })

  const stages = await exports.getSetupStages()
  return stages[stages.length - 1] || null
}

exports.updateSetupStages = async (stages, { updatedById }) => {
  const normalized = stages.map((s) => ({
    stageId: Number(s.stageId),
    displayName: s.displayName !== undefined ? (s.displayName ? String(s.displayName) : null) : undefined,
    sortOrder: s.sortOrder !== undefined && s.sortOrder !== null && s.sortOrder !== '' ? Number(s.sortOrder) : null,
    isEnabled: Boolean(s.isEnabled)
  }))

  if (normalized.some((s) => !s.stageId)) throw new ValidationError('Invalid stageId in stages payload')

  await prisma.$transaction(async (tx) => {
    for (const s of normalized) {
      await tx.projectSetupStageDefault.upsert({
        where: { stageId: s.stageId },
        update: {
          displayName: s.displayName,
          sortOrder: s.sortOrder,
          isEnabled: s.isEnabled
        },
        create: {
          stageId: s.stageId,
          displayName: s.displayName,
          sortOrder: s.sortOrder,
          isEnabled: s.isEnabled
        }
      })
    }

    await tx.auditLog.create({
      data: {
        userId: updatedById,
        action: 'UPDATE',
        entity: 'ProjectSetupStageDefault',
        entityId: null,
        metadata: { count: normalized.length }
      }
    })
  })

  return exports.getSetupStages()
}

exports.getProjectSetupStages = async (projectId) => {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } })
  if (!project) throw new NotFoundError('Project')

  const rows = await getEffectiveStagesForProject(projectId)
  return rows.map(mapStageConfigRowForView)
}

exports.createProjectSetupStage = async (projectId, { name, displayName, createdById }) => {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } })
  if (!project) throw new NotFoundError('Project')

  const trimmedName = String(name || '').trim()
  if (!trimmedName) throw new ValidationError('Stage name is required')

  const existingStages = await getEffectiveStagesForProject(projectId)
  const maxSortOrder = existingStages.reduce((max, s) => Math.max(max, s.sortOrder ?? s.stage?.sortOrder ?? 0), 0)

  const baseKey = slugifyStageKey(trimmedName) || 'custom_stage'
  const uniqueKey = `${baseKey}_${projectId}_${Date.now()}`

  await prisma.$transaction(async (tx) => {
    const stage = await tx.projectStageDefinition.create({
      data: {
        key: uniqueKey,
        name: trimmedName,
        sortOrder: maxSortOrder + 1,
        isSystem: false,
        isActive: true
      }
    })

    await tx.projectSetupStageOverride.create({
      data: {
        projectId,
        stageId: stage.id,
        displayName: displayName || trimmedName,
        sortOrder: maxSortOrder + 1,
        isEnabled: true
      }
    })

    await tx.auditLog.create({
      data: {
        userId: createdById,
        action: 'CREATE',
        entity: 'ProjectSetupStageOverride',
        entityId: stage.id,
        metadata: { projectId, stageId: stage.id, stageName: trimmedName }
      }
    })
  })

  const stages = await exports.getProjectSetupStages(projectId)
  return stages[stages.length - 1] || null
}

exports.updateProjectSetupStages = async (projectId, stages, { updatedById }) => {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } })
  if (!project) throw new NotFoundError('Project')

  const normalized = stages.map((s) => ({
    stageId: Number(s.stageId),
    displayName: s.displayName !== undefined ? (s.displayName ? String(s.displayName) : null) : undefined,
    sortOrder: s.sortOrder !== undefined && s.sortOrder !== null && s.sortOrder !== '' ? Number(s.sortOrder) : null,
    isEnabled: Boolean(s.isEnabled)
  }))

  if (normalized.some((s) => !s.stageId)) throw new ValidationError('Invalid stageId in stages payload')

  const defaultRows = await ensureDefaultSetupStages()
  const defaultByStage = new Map(
    defaultRows.map((d) => [
      d.stageId,
      {
        displayName: d.displayName ?? null,
        sortOrder: d.sortOrder ?? null,
        isEnabled: Boolean(d.isEnabled)
      }
    ])
  )

  const stageIdSet = new Set(normalized.map((s) => s.stageId))

  await prisma.$transaction(async (tx) => {
    for (const s of normalized) {
      const base = defaultByStage.get(s.stageId)
      if (base) {
        const nextDisplayName = s.displayName !== undefined ? s.displayName : base.displayName
        const nextSortOrder = s.sortOrder !== undefined ? s.sortOrder : base.sortOrder
        const nextIsEnabled = s.isEnabled

        const differs =
          (nextDisplayName ?? null) !== (base.displayName ?? null) ||
          (nextSortOrder ?? null) !== (base.sortOrder ?? null) ||
          Boolean(nextIsEnabled) !== Boolean(base.isEnabled)

        if (!differs) {
          await tx.projectSetupStageOverride.deleteMany({ where: { projectId, stageId: s.stageId } })
          continue
        }
      }

      await tx.projectSetupStageOverride.upsert({
        where: { projectId_stageId: { projectId, stageId: s.stageId } },
        update: {
          displayName: s.displayName,
          sortOrder: s.sortOrder,
          isEnabled: s.isEnabled
        },
        create: {
          projectId,
          stageId: s.stageId,
          displayName: s.displayName,
          sortOrder: s.sortOrder,
          isEnabled: s.isEnabled
        }
      })
    }

    await tx.projectSetupStageOverride.deleteMany({
      where: {
        projectId,
        stageId: { notIn: Array.from(stageIdSet) }
      }
    })

    await tx.auditLog.create({
      data: {
        userId: updatedById,
        action: 'UPDATE',
        entity: 'ProjectSetupStageOverride',
        entityId: null,
        metadata: { projectId, count: normalized.length }
      }
    })
  })

  return exports.getProjectSetupStages(projectId)
}

exports.listSetupRequirements = async () => {
  return prisma.projectSetupDocumentRequirementDefault.findMany({
    include: {
      stage: true,
      documentType: true
    },
    orderBy: [{ stageId: 'asc' }, { documentTypeId: 'asc' }]
  })
}

exports.createSetupRequirement = async ({ stageId, documentTypeId, isRequired, isConfidentialDefault, createdById }) => {
  const stage = await prisma.projectStageDefinition.findUnique({ where: { id: stageId }, select: { id: true } })
  if (!stage) throw new NotFoundError('Project stage')

  const docType = await prisma.documentType.findUnique({ where: { id: documentTypeId }, select: { id: true } })
  if (!docType) throw new NotFoundError('Document type')

  try {
    const requirement = await prisma.projectSetupDocumentRequirementDefault.create({
      data: {
        stageId,
        documentTypeId,
        isRequired: Boolean(isRequired),
        isConfidentialDefault: Boolean(isConfidentialDefault)
      },
      include: { stage: true, documentType: true }
    })

    await prisma.auditLog.create({
      data: {
        userId: createdById,
        action: 'CREATE',
        entity: 'ProjectSetupDocumentRequirementDefault',
        entityId: requirement.id,
        metadata: { stageId, documentTypeId }
      }
    })

    return requirement
  } catch (e) {
    throw new ConflictError('Requirement already exists for this stage + document type')
  }
}

exports.deleteSetupRequirement = async (requirementId, { deletedById }) => {
  const existing = await prisma.projectSetupDocumentRequirementDefault.findUnique({
    where: { id: requirementId },
    select: { id: true }
  })
  if (!existing) throw new NotFoundError('Requirement')

  await prisma.projectSetupDocumentRequirementDefault.delete({ where: { id: requirementId } })

  await prisma.auditLog.create({
    data: {
      userId: deletedById,
      action: 'DELETE',
      entity: 'ProjectSetupDocumentRequirementDefault',
      entityId: requirementId,
      metadata: { requirementId }
    }
  })
}

exports.listProjectSetupRequirements = async (projectId) => {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } })
  if (!project) throw new NotFoundError('Project')

  const defaults = await prisma.projectSetupDocumentRequirementDefault.findMany({
    include: { stage: true, documentType: true }
  })

  const overrides = await prisma.projectSetupDocumentRequirementOverride.findMany({
    where: { projectId },
    include: { stage: true, documentType: true }
  })

  const byKey = new Map(defaults.map((r) => [`${r.stageId}:${r.documentTypeId}`, r]))

  for (const o of overrides) {
    const key = `${o.stageId}:${o.documentTypeId}`
    if (o.isExcluded) {
      byKey.delete(key)
      continue
    }
    byKey.set(key, o)
  }

  return Array.from(byKey.values()).sort((a, b) => {
    if (a.stageId !== b.stageId) return a.stageId - b.stageId
    return a.documentTypeId - b.documentTypeId
  })
}

exports.createProjectSetupRequirement = async (projectId, { stageId, documentTypeId, isRequired, isConfidentialDefault, createdById }) => {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } })
  if (!project) throw new NotFoundError('Project')

  const stage = await prisma.projectStageDefinition.findUnique({ where: { id: stageId }, select: { id: true } })
  if (!stage) throw new NotFoundError('Project stage')

  const docType = await prisma.documentType.findUnique({ where: { id: documentTypeId }, select: { id: true } })
  if (!docType) throw new NotFoundError('Document type')

  const existingOverride = await prisma.projectSetupDocumentRequirementOverride.findFirst({
    where: { projectId, stageId, documentTypeId },
    select: { id: true, isExcluded: true }
  })
  if (existingOverride && !existingOverride.isExcluded) {
    throw new ConflictError('Requirement already exists for this project + stage + document type')
  }

  const defaultExists = await prisma.projectSetupDocumentRequirementDefault.findFirst({
    where: { stageId, documentTypeId },
    select: { id: true }
  })
  if (defaultExists && !existingOverride) {
    throw new ConflictError('Requirement already exists in default setup for this stage + document type')
  }

  const requirement = await prisma.projectSetupDocumentRequirementOverride.upsert({
    where: { projectId_stageId_documentTypeId: { projectId, stageId, documentTypeId } },
    update: {
      isExcluded: false,
      isRequired: Boolean(isRequired),
      isConfidentialDefault: Boolean(isConfidentialDefault)
    },
    create: {
      projectId,
      stageId,
      documentTypeId,
      isRequired: Boolean(isRequired),
      isConfidentialDefault: Boolean(isConfidentialDefault),
      isExcluded: false
    },
    include: { stage: true, documentType: true }
  })

  await prisma.auditLog.create({
    data: {
      userId: createdById,
      action: 'CREATE',
      entity: 'ProjectSetupDocumentRequirementOverride',
      entityId: requirement.id,
      metadata: { projectId, stageId, documentTypeId }
    }
  })

  return requirement
}

exports.deleteProjectSetupRequirement = async (projectId, requirementId, { deletedById }) => {
  const overrideRow = await prisma.projectSetupDocumentRequirementOverride.findFirst({
    where: { id: requirementId, projectId },
    select: { id: true, stageId: true, documentTypeId: true }
  })

  if (overrideRow) {
    await prisma.projectSetupDocumentRequirementOverride.delete({ where: { id: overrideRow.id } })
    await prisma.auditLog.create({
      data: {
        userId: deletedById,
        action: 'DELETE',
        entity: 'ProjectSetupDocumentRequirementOverride',
        entityId: overrideRow.id,
        metadata: { projectId, requirementId: overrideRow.id }
      }
    })
    return
  }

  const defaultRow = await prisma.projectSetupDocumentRequirementDefault.findUnique({
    where: { id: requirementId },
    select: { id: true, stageId: true, documentTypeId: true, isRequired: true, isConfidentialDefault: true }
  })
  if (!defaultRow) throw new NotFoundError('Requirement')

  await prisma.projectSetupDocumentRequirementOverride.upsert({
    where: { projectId_stageId_documentTypeId: { projectId, stageId: defaultRow.stageId, documentTypeId: defaultRow.documentTypeId } },
    update: { isExcluded: true },
    create: {
      projectId,
      stageId: defaultRow.stageId,
      documentTypeId: defaultRow.documentTypeId,
      isRequired: defaultRow.isRequired,
      isConfidentialDefault: defaultRow.isConfidentialDefault,
      isExcluded: true
    }
  })

  await prisma.auditLog.create({
    data: {
      userId: deletedById,
      action: 'DELETE',
      entity: 'ProjectSetupDocumentRequirementOverride',
      entityId: null,
      metadata: { projectId, defaultRequirementId: defaultRow.id, stageId: defaultRow.stageId, documentTypeId: defaultRow.documentTypeId }
    }
  })
}

exports.getSetupRequirementConfidentialAccess = async (requirementId) => {
  return confidentialAccessService.getProjectSetupRequirementAccess({ requirementId, scope: 'DEFAULT' })
}

exports.updateSetupRequirementConfidentialAccess = async (requirementId, actor, payload) => {
  return confidentialAccessService.setProjectSetupRequirementAccess({ requirementId, scope: 'DEFAULT' }, actor, payload)
}

exports.getProjectSetupRequirementConfidentialAccess = async (projectId, requirementId) => {
  const overrideRow = await prisma.projectSetupDocumentRequirementOverride.findFirst({
    where: { id: requirementId, projectId },
    select: { id: true }
  })
  if (overrideRow) {
    return confidentialAccessService.getProjectSetupRequirementAccess({ projectId, requirementId: overrideRow.id, scope: 'OVERRIDE' })
  }

  return confidentialAccessService.getProjectSetupRequirementAccess({ requirementId, scope: 'DEFAULT' })
}

exports.updateProjectSetupRequirementConfidentialAccess = async (projectId, requirementId, actor, payload) => {
  const overrideRow = await prisma.projectSetupDocumentRequirementOverride.findFirst({
    where: { id: requirementId, projectId },
    select: { id: true }
  })
  if (overrideRow) {
    return confidentialAccessService.setProjectSetupRequirementAccess({ projectId, requirementId: overrideRow.id, scope: 'OVERRIDE' }, actor, payload)
  }

  const defaultRow = await prisma.projectSetupDocumentRequirementDefault.findUnique({
    where: { id: requirementId },
    select: { id: true, stageId: true, documentTypeId: true, isRequired: true, isConfidentialDefault: true }
  })
  if (!defaultRow) throw new NotFoundError('Requirement')

  const upserted = await prisma.projectSetupDocumentRequirementOverride.upsert({
    where: { projectId_stageId_documentTypeId: { projectId, stageId: defaultRow.stageId, documentTypeId: defaultRow.documentTypeId } },
    update: { isExcluded: false },
    create: {
      projectId,
      stageId: defaultRow.stageId,
      documentTypeId: defaultRow.documentTypeId,
      isRequired: defaultRow.isRequired,
      isConfidentialDefault: defaultRow.isConfidentialDefault,
      isExcluded: false
    },
    select: { id: true }
  })

  return confidentialAccessService.setProjectSetupRequirementAccess({ projectId, requirementId: upserted.id, scope: 'OVERRIDE' }, actor, payload)
}
