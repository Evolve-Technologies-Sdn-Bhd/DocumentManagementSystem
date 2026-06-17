const prisma = require('../config/database');
const { ConflictError, NotFoundError, ValidationError } = require('../utils/errors');
const documentService = require('./documentService');
const documentAssignmentService = require('./documentAssignmentService')
const folderPermissionService = require('./folderPermissionService')
const confidentialAccessService = require('./confidentialAccessService')

const getActiveStageDefinitions = async () => {
  return prisma.projectStageDefinition.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' }
  });
};

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

const createChecklistItemsFromRequirements = async (projectCategoryId, iterationId, db = prisma) => {
  const enabledStages = await db.projectCategoryStage.findMany({
    where: {
      projectCategoryId,
      isEnabled: true,
      stage: { isActive: true }
    },
    include: { stage: true },
    orderBy: [{ sortOrder: 'asc' }, { stage: { sortOrder: 'asc' } }]
  });
  if (enabledStages.length === 0) return [];

  const stageIds = enabledStages.map((s) => s.stageId);

  const requirements = await db.projectCategoryDocumentRequirement.findMany({
    where: {
      projectCategoryId,
      stageId: { in: stageIds },
      isRequired: true
    }
  });

  if (requirements.length === 0) return [];

  await db.projectIterationDocumentItem.createMany({
    data: requirements.map((r) => ({
      projectIterationId: iterationId,
      stageId: r.stageId,
      documentTypeId: r.documentTypeId
    })),
    skipDuplicates: true
  });

  return db.projectIterationDocumentItem.findMany({
    where: { projectIterationId: iterationId },
    include: {
      stage: true,
      documentType: true
    },
    orderBy: [{ stageId: 'asc' }, { documentTypeId: 'asc' }]
  });
};

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

exports.updateProject = async (projectId, { name, description, managerId, updatedById }) => {
  const existing = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true }
  })
  if (!existing) throw new NotFoundError('Project')

  const project = await prisma.project.update({
    where: { id: projectId },
    data: {
      name,
      description,
      managerId
    },
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
      metadata: { projectId }
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
      metadata: { projectId, code: existing.code }
    }
  })
}

exports.createProject = async ({ code, name, description, projectCategoryId, managerId, createdById }) => {
  const existing = await prisma.project.findUnique({ where: { code }, select: { id: true } });
  if (existing) throw new ConflictError('Project code already exists');

  const category = await prisma.projectCategory.findUnique({ where: { id: projectCategoryId }, select: { id: true } });
  if (!category) throw new NotFoundError('Project category');

  const stages = await getEnabledStagesForCategory(projectCategoryId);
  const firstStageId = stages[0]?.stageId || null;

  return prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        code,
        name,
        description,
        projectCategoryId,
        managerId,
        createdById
      }
    });

    const iteration = await tx.projectIteration.create({
      data: {
        projectId: project.id,
        iterationNo: 1,
        name: 'Iteration 1',
        currentStageId: firstStageId
      }
    });

    await createChecklistItemsFromRequirements(projectCategoryId, iteration.id, tx);

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

exports.getProject = async (projectId, { canViewConfidential }) => {
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

  const enabledStages = mapEnabledStagesForView(await getEnabledStagesForCategory(project.projectCategoryId));
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

  if (canViewConfidential) return projectWithStageView;

  const iterationIds = project.iterations.map((it) => it.id);
  if (iterationIds.length === 0) return projectWithStageView;

  const linkCounts = await prisma.projectDocumentLink.groupBy({
    by: ['projectIterationId'],
    where: {
      projectIterationId: { in: iterationIds },
      document: { isConfidential: false }
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
    select: { id: true, projectCategoryId: true }
  });
  if (!project) throw new NotFoundError('Project');

  const last = await prisma.projectIteration.findFirst({
    where: { projectId },
    orderBy: { iterationNo: 'desc' },
    select: { iterationNo: true }
  });
  const nextNo = (last?.iterationNo || 0) + 1;

  const stages = await getEnabledStagesForCategory(project.projectCategoryId);
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

    await createChecklistItemsFromRequirements(project.projectCategoryId, iteration.id, tx);

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
    include: { project: { select: { projectCategoryId: true } } }
  })
  if (!iteration) throw new NotFoundError('Project iteration')

  const categoryStages = await ensureCategoryStages(iteration.project.projectCategoryId)
  const stageNameMap = new Map(
    categoryStages.map((cs) => [
      cs.stageId,
      cs.displayName || cs.stage?.name
    ])
  )

  const roleIds = user ? await folderPermissionService.getRoleIdsByNames(user.roles || []) : []
  const docWhere =
    user && !user?.permissions?.projectTracking?.viewConfidential
      ? confidentialAccessService.buildConfidentialWhereClause(user, roleIds)
      : {}

  const items = await prisma.projectIterationDocumentItem.findMany({
    where: { projectIterationId: iterationId },
    include: {
      stage: true,
      documentType: true,
      links: {
        where: user ? { document: docWhere } : undefined,
        include: {
          document: {
            select: { id: true, fileCode: true, title: true, status: true, stage: true, isConfidential: true, updatedAt: true }
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
      : item.stage
  }))

  return withStageNames;
};

exports.linkDocumentToItem = async (itemId, { documentId, linkedById }) => {
  return prisma.$transaction(async (tx) => {
    const item = await tx.projectIterationDocumentItem.findUnique({
      where: { id: itemId },
      include: { iteration: true }
    });
    if (!item) throw new NotFoundError('Project item');

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

exports.unlinkDocumentFromItem = async (itemId, linkId) => {
  return prisma.$transaction(async (tx) => {
    const item = await tx.projectIterationDocumentItem.findUnique({
      where: { id: itemId },
      select: { id: true, status: true }
    })
    if (!item) throw new NotFoundError('Project item')

    const link = await tx.projectDocumentLink.findFirst({
      where: {
        id: linkId,
        itemId,
        projectIterationId: { not: null }
      },
      include: {
        document: {
          select: { id: true, status: true }
        }
      }
    })
    if (!link) throw new NotFoundError('Project document link')

    await tx.projectDocumentLink.delete({ where: { id: link.id } })

    const remainingPublished = await tx.projectDocumentLink.count({
      where: {
        itemId,
        document: { status: 'PUBLISHED' }
      }
    })

    let updatedItem = item
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
    include: { project: { select: { projectCategoryId: true } } }
  })
  if (!iteration) throw new NotFoundError('Project iteration')

  const categoryStages = await ensureCategoryStages(iteration.project.projectCategoryId)
  const stageNameMap = new Map(
    categoryStages.map((cs) => [
      cs.stageId,
      cs.displayName || cs.stage?.name
    ])
  )

  const roleIds = user ? await folderPermissionService.getRoleIdsByNames(user.roles || []) : []
  const docWhere =
    user && !user?.permissions?.projectTracking?.viewConfidential
      ? confidentialAccessService.buildConfidentialWhereClause(user, roleIds)
      : {}

  const links = await prisma.projectDocumentLink.findMany({
    where: {
      projectIterationId: iterationId,
      itemId: null,
      ...(user ? { document: docWhere } : {})
    },
    include: {
      document: {
        select: {
          id: true,
          fileCode: true,
          title: true,
          status: true,
          stage: true,
          isConfidential: true,
          documentTypeId: true,
          updatedAt: true,
          documentType: { select: { id: true, name: true } }
        }
      },
      stage: true
    },
    orderBy: { linkedAt: 'desc' }
  })

  return links.map((link) => ({
    ...link,
    stage: link.stage
      ? { ...link.stage, name: stageNameMap.get(link.stageId) || link.stage.name }
      : link.stage
  }))
}

exports.linkDocumentToStage = async (iterationId, stageId, { documentId, linkedById }) => {
  return prisma.$transaction(async (tx) => {
    const iteration = await tx.projectIteration.findUnique({
      where: { id: iterationId },
      select: { id: true }
    })
    if (!iteration) throw new NotFoundError('Project iteration')

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

exports.unlinkDocumentFromStage = async (iterationId, stageId, linkId) => {
  const link = await prisma.projectDocumentLink.findFirst({
    where: {
      id: linkId,
      projectIterationId: iterationId,
      stageId,
      itemId: null
    },
    select: { id: true }
  })
  if (!link) throw new NotFoundError('Project document link')

  await prisma.projectDocumentLink.delete({ where: { id: link.id } })
  return { removedLinkId: link.id }
}

exports.createDocumentFromItem = async (itemId, { title, description, createdById }) => {
  const item = await prisma.projectIterationDocumentItem.findUnique({
    where: { id: itemId },
    include: {
      iteration: { include: { project: true } },
      stage: true,
      documentType: true
    }
  })
  if (!item) throw new NotFoundError('Project item')

  const projectCategoryId = item.iteration.project.projectCategoryId

  const requirement = await prisma.projectCategoryDocumentRequirement.findFirst({
    where: {
      projectCategoryId,
      stageId: item.stageId,
      documentTypeId: item.documentTypeId
    },
    select: { id: true, isConfidentialDefault: true }
  })

  const isConfidential = Boolean(requirement?.isConfidentialDefault)

  const document = await documentService.createDocument({
    title,
    description,
    documentTypeId: item.documentTypeId,
    projectCategoryId,
    folderId: null,
    isConfidential
  }, createdById)

  if (isConfidential && requirement?.id) {
    await confidentialAccessService.applyRequirementAccessToDocument(requirement.id, document.id)
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

  const stage = await prisma.projectStageDefinition.findUnique({ where: { id: stageId }, select: { id: true } })
  if (!stage) throw new NotFoundError('Project stage')

  const docType = await prisma.documentType.findUnique({ where: { id: documentTypeId }, select: { id: true } })
  if (!docType) throw new NotFoundError('Document type')

  const requirement = await prisma.projectCategoryDocumentRequirement.findFirst({
    where: {
      projectCategoryId: iteration.project.projectCategoryId,
      stageId,
      documentTypeId
    },
    select: { id: true, isConfidentialDefault: true }
  })

  const isConfidential = Boolean(requirement?.isConfidentialDefault)

  const document = await documentService.createDocument({
    title,
    description,
    documentTypeId,
    projectCategoryId: iteration.project.projectCategoryId,
    folderId: null,
    isConfidential
  }, createdById)

  if (isConfidential && requirement?.id) {
    await confidentialAccessService.applyRequirementAccessToDocument(requirement.id, document.id)
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

  const enabledStages = await getEnabledStagesForCategory(iteration.project.projectCategoryId)
  if (enabledStages.length === 0) throw new ValidationError('No enabled stages configured for this project category')

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
      metadata: { projectId: iteration.projectId, fromStageId: current.stageId, toStageId: next.stageId }
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
    description: { contains: needle }
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
    metadata: log.metadata ? JSON.parse(log.metadata) : null
  }))

  return { logs: items, total, page: parseInt(page, 10), limit: take }
}

exports.searchDocuments = async ({ projectId, q }, { user }) => {
  const query = String(q || '').trim()
  if (!query) return []

  const normalizeSearchValue = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const normalizedQuery = normalizeSearchValue(query)
  const roleIds = user ? await folderPermissionService.getRoleIdsByNames(user.roles || []) : []

  const andWhere = []
  if (user?.id) {
    andWhere.push(documentAssignmentService.buildAccessWhereClause(user.id, roleIds))
  }
  if (user && !user?.permissions?.projectTracking?.viewConfidential) {
    andWhere.push(confidentialAccessService.buildConfidentialWhereClause(user, roleIds))
  }
  if (projectId) {
    andWhere.push({ projectLinks: { some: { iteration: { projectId } } } })
  }

  let docs
  try {
    docs = await prisma.document.findMany({
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
      },
      orderBy: { updatedAt: 'desc' },
      take: 500
    })
  } catch (error) {
    throw error
  }

  const scored = docs
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

      const latestLink = doc.projectLinks[0] || null
      return {
        score,
        updatedAt: doc.updatedAt,
        result: {
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
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
    .slice(0, 200)
    .map((entry) => entry.result)

  return scored
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
