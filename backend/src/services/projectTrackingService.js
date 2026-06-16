const prisma = require('../config/database');
const { ConflictError, NotFoundError, ValidationError } = require('../utils/errors');
const documentService = require('./documentService');

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

const createChecklistItemsFromRequirements = async (projectCategoryId, iterationId) => {
  const enabledStages = await getEnabledStagesForCategory(projectCategoryId);
  if (enabledStages.length === 0) return [];

  const stageIds = enabledStages.map((s) => s.stageId);

  const requirements = await prisma.projectCategoryDocumentRequirement.findMany({
    where: {
      projectCategoryId,
      stageId: { in: stageIds },
      isRequired: true
    }
  });

  if (requirements.length === 0) return [];

  await prisma.projectIterationDocumentItem.createMany({
    data: requirements.map((r) => ({
      projectIterationId: iterationId,
      stageId: r.stageId,
      documentTypeId: r.documentTypeId
    })),
    skipDuplicates: true
  });

  return prisma.projectIterationDocumentItem.findMany({
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

    await createChecklistItemsFromRequirements(projectCategoryId, iteration.id);

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

  if (canViewConfidential) return project;

  const iterationIds = project.iterations.map((it) => it.id);
  if (iterationIds.length === 0) return project;

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
    ...project,
    iterations: project.iterations.map((it) => ({
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

    await createChecklistItemsFromRequirements(project.projectCategoryId, iteration.id);

    await tx.auditLog.create({
      data: {
        userId: createdById,
        action: 'CREATE',
        entity: 'ProjectIteration',
        entityId: iteration.id,
        metadata: { projectId, iterationNo: nextNo }
      }
    });

    return iteration;
  });
};

exports.listIterationItems = async (iterationId, { canViewConfidential }) => {
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

  const items = await prisma.projectIterationDocumentItem.findMany({
    where: { projectIterationId: iterationId },
    include: {
      stage: true,
      documentType: true,
      links: {
        include: {
          document: {
            select: { id: true, fileCode: true, title: true, status: true, isConfidential: true, updatedAt: true }
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

  if (canViewConfidential) return withStageNames;

  return withStageNames.map((item) => ({
    ...item,
    links: item.links.filter((l) => !l.document?.isConfidential)
  }));
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
        document: { select: { id: true, fileCode: true, title: true, status: true, isConfidential: true } }
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

exports.listIterationStageDocuments = async (iterationId, { canViewConfidential }) => {
  const links = await prisma.projectDocumentLink.findMany({
    where: {
      projectIterationId: iterationId,
      itemId: null,
      ...(canViewConfidential ? {} : { document: { isConfidential: false } })
    },
    include: {
      document: {
        select: { id: true, fileCode: true, title: true, status: true, isConfidential: true, documentTypeId: true, updatedAt: true }
      },
      stage: true
    },
    orderBy: { linkedAt: 'desc' }
  })

  return links
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
        document: { select: { id: true, fileCode: true, title: true, status: true, isConfidential: true } },
        stage: true
      }
    })

    return { link }
  })
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
    select: { isConfidentialDefault: true }
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
    select: { isConfidentialDefault: true }
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

  const pending = await prisma.projectIterationDocumentItem.count({
    where: {
      projectIterationId: iterationId,
      stageId: current.stageId,
      status: 'PENDING'
    }
  })

  if (pending > 0) {
    throw new ValidationError(`Cannot advance stage. ${pending} item(s) are still pending.`)
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
      metadata: { fromStageId: current.stageId, toStageId: next.stageId }
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

exports.searchDocuments = async ({ projectId, q }, { canViewConfidential }) => {
  const where = {};
  if (projectId) where.iteration = { projectId };
  if (q) {
    where.OR = [
      { document: { fileCode: { contains: q } } },
      { document: { title: { contains: q } } }
    ];
  }
  if (!canViewConfidential) {
    where.document = { ...(where.document || {}), isConfidential: false };
  }

  return prisma.projectDocumentLink.findMany({
    where,
    include: {
      document: { select: { id: true, fileCode: true, title: true, status: true, isConfidential: true, updatedAt: true } },
      iteration: {
        include: {
          project: { include: { projectCategory: true } }
        }
      },
      stage: true,
      item: { include: { documentType: true } }
    },
    orderBy: { linkedAt: 'desc' },
    take: 200
  });
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
