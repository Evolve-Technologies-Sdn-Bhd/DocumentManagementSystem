const prisma = require('../config/database');
const ResponseFormatter = require('../utils/responseFormatter');
const asyncHandler = require('../utils/asyncHandler');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../utils/errors');
const config = require('../config/app');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const crypto = require('crypto');
const smartDocumentContentService = require('../services/smartDocumentContentService');
const smartDocumentPdfService = require('../services/smartDocumentPdfService');

const parseIntSafe = (v, fallback = undefined) => {
  if (v === null || v === undefined || v === '') return fallback;
  const n = parseInt(v, 10);
  return isNaN(n) ? fallback : n;
};

function isUserAdmin(user) {
  if (!user || !user.roles) return false;
  if (!Array.isArray(user.roles)) return false;
  return user.roles.some(
    (r) =>
      (r && (r.isSystem || /admin/i.test(r.name))) ||
      (r && r.role && (r.role.isSystem || /admin/i.test(r.role.name)))
  );
}

function computeIsEditable(user, doc, docVersion) {
  if (!doc || !docVersion) return false;
  const contentLocked = Boolean(docVersion.smartContentIsLocked);
  if (contentLocked) return false;

  const userId = user && user.id ? Number(user.id) : null;
  const ownerId = doc.ownerId ? Number(doc.ownerId) : null;
  const createdById = doc.createdById ? Number(doc.createdById) : null;

  if (userId && (userId === ownerId || userId === createdById)) {
    return true;
  }
  if (isUserAdmin(user)) {
    return true;
  }

  const status = doc.status;
  const draftLike = ['DRAFT', 'RETURNED', 'DRAFTING', 'ACKNOWLEDGED'].includes(status);
  if (draftLike && !contentLocked) {
    return true;
  }

  if (status === 'IN_REVIEW' && !contentLocked) {
    const reviewerId = doc.reviewerId ? Number(doc.reviewerId) : null;
    if (userId && userId === reviewerId) {
      return true;
    }
  }

  return false;
}

exports.getSmartDocumentContent = asyncHandler(async (req, res) => {
  const documentVersionId = parseIntSafe(req.params.documentVersionId);
  if (!documentVersionId) {
    return ResponseFormatter.notFound(res, 'Document Version');
  }

  const documentVersion = await prisma.documentVersion.findUnique({
    where: { id: documentVersionId },
    include: {
      smartDocumentContent: {
        include: {
          createdBy: {
            select: { id: true, firstName: true, lastName: true, email: true }
          }
        }
      },
      smartTemplateVersion: {
        include: {
          formFields: { orderBy: { sortOrder: 'asc' } },
          fieldMappings: true,
          sections: { orderBy: { sortOrder: 'asc' } },
          smartTemplate: {
            include: {
              styleProfile: true,
              documentType: true
            }
          }
        }
      },
      document: {
        include: {
          documentType: true,
          owner: { select: { id: true, firstName: true, lastName: true, email: true, employeeId: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true, email: true, employeeId: true } }
        }
      }
    }
  });

  if (!documentVersion) {
    return ResponseFormatter.notFound(res, 'Document Version');
  }

  try {
    if (!documentVersion.smartTemplateVersionId && documentVersion.document) {
      const docType = await prisma.documentType.findUnique({
        where: { id: documentVersion.document.documentTypeId },
        select: { smartDefaultTemplate: { select: { id: true } } }
      });
      if (docType && docType.smartDefaultTemplate) {
        return ResponseFormatter.error(
          res,
          'Smart template version not assigned to document version',
          400
        );
      }
    }

    let smartDocumentContent = documentVersion.smartDocumentContent;
    if (
      !smartDocumentContent &&
      (documentVersion.smartTemplateVersionId ||
        (documentVersion.smartTemplateVersion && documentVersion.smartTemplateVersion.id))
    ) {
      const stvId =
        documentVersion.smartTemplateVersionId ||
        (documentVersion.smartTemplateVersion && documentVersion.smartTemplateVersion.id);
      try {
        smartDocumentContent =
          await smartDocumentContentService.getOrCreateContentForDocumentVersion({
            documentVersionId: Number(documentVersionId),
            smartTemplateVersionId: Number(stvId),
            createdById: Number(
              documentVersion.document?.ownerId ||
                documentVersion.document?.createdById ||
                req.user.id
            ),
          });
      } catch (createErr) {
        console.warn(
          '[getSmartDocumentContent] Could not auto-create smartDocumentContent (continuing):',
          createErr?.message || createErr
        );
        smartDocumentContent = null;
      }
    }
    const templateVersion = documentVersion.smartTemplateVersion;
    const styleProfile =
      (templateVersion &&
        templateVersion.smartTemplate &&
        templateVersion.smartTemplate.styleProfile) ||
      (templateVersion && templateVersion.formattingSnapshot) ||
      null;
    const sections = (templateVersion && templateVersion.sections) || [];
    const formFields = (templateVersion && templateVersion.formFields) || [];
    const fieldMappings = (templateVersion && templateVersion.fieldMappings) || [];
    const owner = documentVersion.document
      ? (documentVersion.document.owner || (documentVersion.document.ownerId
        ? { id: documentVersion.document.ownerId }
        : null))
      : null;
    const createdByUser = documentVersion.document
      ? (documentVersion.document.createdBy || (documentVersion.document.createdById
        ? { id: documentVersion.document.createdById }
        : null))
      : null;

    const resolvedDocumentTypeName =
      (documentVersion.document && documentVersion.document.documentType && documentVersion.document.documentType.name) ||
      (templateVersion && templateVersion.smartTemplate && templateVersion.smartTemplate.documentType && templateVersion.smartTemplate.documentType.name) ||
      (templateVersion && templateVersion.smartTemplate && templateVersion.smartTemplate.name) ||
      (documentVersion.document && documentVersion.document.documentTypeName) ||
      '';

    const resolvedPreparedByFullName =
      (owner && (owner.fullName || owner.displayFullName || owner.displayName || [owner.firstName, owner.lastName].filter(Boolean).join(' '))) ||
      (createdByUser && (createdByUser.fullName || createdByUser.displayFullName || createdByUser.displayName || [createdByUser.firstName, createdByUser.lastName].filter(Boolean).join(' '))) ||
      '';

    const isEditableByCurrentUser = computeIsEditable(
      req.user,
      documentVersion.document,
      documentVersion
    );

    return ResponseFormatter.success(
      res,
      {
        documentVersion,
        smartDocumentContent,
        templateVersion,
        styleProfile,
        sections,
        formFields,
        fieldMappings,
        owner,
        createdBy: createdByUser,
        documentTypeName: resolvedDocumentTypeName,
        preparedByFullName: resolvedPreparedByFullName,
        isEditableByCurrentUser
      },
      'Smart document content retrieved successfully'
    );
  } catch (unexpectedErr) {
    if (unexpectedErr instanceof BadRequestError ||
        unexpectedErr instanceof NotFoundError ||
        unexpectedErr instanceof ForbiddenError ||
        unexpectedErr?.isOperational === true) {
      throw unexpectedErr;
    }
    console.error('[getSmartDocumentContent] Processing error:', unexpectedErr);
    throw new BadRequestError(
      `Unable to load smart document content: ${unexpectedErr.message || unexpectedErr.code || String(unexpectedErr).slice(0, 200)}`
    );
  }
});

exports.saveSmartDocumentFieldValues = asyncHandler(async (req, res) => {
  const documentVersionId = parseIntSafe(req.params.documentVersionId);
  if (!documentVersionId) {
    return ResponseFormatter.notFound(res, 'Document Version');
  }

  const { fieldValues, workflowAction, commentId } = req.body || {};
  if (!fieldValues || typeof fieldValues !== 'object') {
    return ResponseFormatter.error(res, 'fieldValues object is required', 400);
  }

  const result = await smartDocumentContentService.saveFieldValues({
    documentVersionId,
    changedByUserId: req.user.id,
    fieldValues,
    workflowAction: workflowAction || 'DRAFT_EDIT',
    commentId: commentId || null
  });

  const totalChangeCount = await prisma.smartDocumentFieldChange.count({
    where: { documentVersionId }
  });

  return ResponseFormatter.success(
    res,
    {
      id: result.content.id,
      contentChecksum: result.content.contentChecksum,
      updatedAt: result.content.updatedAt,
      fieldChangeCount: result.fieldChangeCount,
      totalFieldChangeCount: totalChangeCount
    },
    'Smart document field values saved successfully'
  );
});

exports.snapshotSystemValues = asyncHandler(async (req, res) => {
  const documentVersionId = parseIntSafe(req.params.documentVersionId);
  if (!documentVersionId) {
    return ResponseFormatter.notFound(res, 'Document Version');
  }

  try {
    const { systemValues } = req.body || {};
    if (!systemValues || typeof systemValues !== 'object') {
      return ResponseFormatter.error(res, 'systemValues object is required', 400);
    }

    const dv = await prisma.documentVersion.findUnique({
      where: { id: documentVersionId },
      include: { document: true }
    });
    if (!dv) {
      return ResponseFormatter.notFound(res, 'Document Version');
    }

    const userId = Number(req.user.id);
    const ownerId = dv.document ? Number(dv.document.ownerId) : null;
    const createdById = dv.document ? Number(dv.document.createdById) : null;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } } }
    });

    const isAllowed =
      userId === ownerId ||
      userId === createdById ||
      isUserAdmin({ roles: (user && user.roles) || [] });

    if (!isAllowed) {
      return ResponseFormatter.forbidden(
        res,
        'Only document owner/creator or admin can snapshot system values'
      );
    }

    const updated = await smartDocumentContentService.snapshotSystemFields({
      documentVersionId,
      systemValues
    });

    return ResponseFormatter.success(
      res,
      {
        id: updated.id,
        contentChecksum: updated.contentChecksum,
        autoFieldSnapshotJson: updated.autoFieldSnapshotJson
      },
      'System values snapshotted successfully'
    );
  } catch (unexpectedErr) {
    if (unexpectedErr instanceof BadRequestError ||
        unexpectedErr instanceof NotFoundError ||
        unexpectedErr instanceof ForbiddenError ||
        unexpectedErr?.isOperational === true) {
      throw unexpectedErr;
    }
    console.error('[snapshotSystemValues] Processing error:', unexpectedErr);
    throw new BadRequestError(
      `Snapshot failed: ${unexpectedErr.message || unexpectedErr.code || String(unexpectedErr).slice(0, 200)}`
    );
  }
});

exports.getSmartDocumentFieldChanges = asyncHandler(async (req, res) => {
  const documentVersionId = parseIntSafe(req.params.documentVersionId);
  if (!documentVersionId) {
    return ResponseFormatter.notFound(res, 'Document Version');
  }

  const fieldKey = req.query.fieldKey ? String(req.query.fieldKey) : undefined;
  const workflowAction = req.query.workflowAction
    ? String(req.query.workflowAction)
    : undefined;
  const limit = parseIntSafe(req.query.limit, 200);
  const offset = parseIntSafe(req.query.offset, 0);

  const where = { documentVersionId };
  if (fieldKey) where.smartFormFieldKey = fieldKey;
  if (workflowAction) where.workflowAction = workflowAction;

  const [changes, total] = await Promise.all([
    prisma.smartDocumentFieldChange.findMany({
      where,
      orderBy: { changedAt: 'desc' },
      include: {
        changedBy: {
          select: { id: true, firstName: true, lastName: true, email: true }
        }
      },
      take: Math.max(1, Math.min(limit, 1000)),
      skip: Math.max(0, offset)
    }),
    prisma.smartDocumentFieldChange.count({ where })
  ]);

  return ResponseFormatter.success(
    res,
    { changes, total },
    'Smart document field changes retrieved successfully'
  );
});

exports.createSmartRevision = asyncHandler(async (req, res) => {
  const {
    existingDocumentId,
    oldDocumentVersionId,
    newDocumentVersionId,
    smartTemplateVersionId
  } = req.body || {};

  if (!newDocumentVersionId) {
    return ResponseFormatter.error(res, 'newDocumentVersionId is required', 400);
  }
  if (!smartTemplateVersionId) {
    return ResponseFormatter.error(res, 'smartTemplateVersionId is required', 400);
  }
  if (!oldDocumentVersionId) {
    return ResponseFormatter.error(res, 'oldDocumentVersionId is required', 400);
  }

  const newContent = await smartDocumentContentService.createNewRevisionFromExisting({
    existingDocumentId,
    oldDocumentVersionId,
    newDocumentVersionId,
    smartTemplateVersionId,
    createdById: req.user.id
  });

  return ResponseFormatter.success(
    res,
    { smartDocumentContent: newContent },
    'Smart document revision content created successfully',
    201
  );
});

exports.generateFinalPdfForDocumentVersion = asyncHandler(async (req, res) => {
  const documentVersionId = parseIntSafe(req.params.documentVersionId);
  if (!documentVersionId) {
    return ResponseFormatter.notFound(res, 'Document Version');
  }

  const dv = await prisma.documentVersion.findUnique({
    where: { id: documentVersionId },
    include: { document: true, smartDocumentContent: true, smartTemplateVersion: true }
  });
  if (!dv) {
    return ResponseFormatter.notFound(res, 'Document Version');
  }
  if (!dv.smartTemplateVersionId) {
    return ResponseFormatter.error(
      res,
      'Smart template version not assigned to document version',
      400
    );
  }

  // Fine-grained permission check (more lenient than route guard):
  // Allow: admin, owner/creator, assigned reviewer, assigned first/second approver,
  //        OR any user who holds the documents.published/publish permission.
  const curUserId = req.user && req.user.id ? Number(req.user.id) : null;
  const doc = dv.document || null;
  if (!curUserId || !doc) {
    return ResponseFormatter.forbidden(res, 'Insufficient permissions to generate final PDF');
  }
  const ownerId = doc.ownerId ? Number(doc.ownerId) : null;
  const createdById = doc.createdById ? Number(doc.createdById) : null;
  const reviewerId = doc.reviewerId ? Number(doc.reviewerId) : null;
  const firstApproverId = doc.firstApproverId ? Number(doc.firstApproverId) : null;
  const secondApproverId = doc.secondApproverId ? Number(doc.secondApproverId) : null;

  const userRecord = await prisma.user.findUnique({
    where: { id: curUserId },
    include: { roles: { include: { role: true } } }
  });
  const isAdmin = isUserAdmin({ roles: (userRecord && userRecord.roles) || [] });

  const canRegen =
    isAdmin ||
    curUserId === ownerId ||
    curUserId === createdById ||
    curUserId === reviewerId ||
    curUserId === firstApproverId ||
    curUserId === secondApproverId;

  if (!canRegen) {
    return ResponseFormatter.forbidden(
      res,
      'Only document owner/creator, assigned reviewer/approver, admin, or publisher can regenerate the final PDF'
    );
  }

  let content = dv.smartDocumentContent;
  if (!content) {
    try {
      content = await smartDocumentContentService.getOrCreateContentForDocumentVersion({
        documentVersionId: Number(documentVersionId),
        smartTemplateVersionId: Number(dv.smartTemplateVersionId),
        createdById: Number(
          dv.document?.ownerId || dv.document?.createdById || req.user.id
        ),
      });
    } catch (createErr) {
      console.warn(
        '[generateFinalPdf] Could not auto-create content:',
        createErr?.message || createErr
      );
    }
  }
  if (!content) {
    return ResponseFormatter.error(
      res,
      'Document version does not contain smart document content',
      400
    );
  }

  const result = await smartDocumentPdfService.generateFinalPdfForDocumentVersion({
    documentVersionId
  });

  return ResponseFormatter.success(
    res,
    {
      savedPath: result.savedPath,
      fileSize: result.fileSize
    },
    'Final PDF generated and saved'
  );
});

exports.previewCurrentSmartDocumentAsPdf = asyncHandler(async (req, res) => {
  const documentVersionId = parseIntSafe(req.params.documentVersionId);
  if (!documentVersionId) {
    return ResponseFormatter.notFound(res, 'Document Version');
  }

  const asDocx = Boolean(req.body ? req.body.asDocx : false) || Boolean(req.query.asDocx);

  const dv = await prisma.documentVersion.findUnique({
    where: { id: documentVersionId },
    include: {
      document: {
        include: { smartDocumentStyleProfile: true, documentType: true }
      },
      smartDocumentContent: true,
      smartTemplateVersion: {
        include: {
          smartTemplate: { include: { styleProfile: true, documentType: true } },
          formFields: true,
          fieldMappings: true
        }
      }
    }
  });

  if (!dv) {
    return ResponseFormatter.notFound(res, 'Document Version');
  }

  try {
    let smartDocumentContent = dv.smartDocumentContent;
    if (!smartDocumentContent && dv.smartTemplateVersionId) {
      try {
        smartDocumentContent =
          await smartDocumentContentService.getOrCreateContentForDocumentVersion({
            documentVersionId: Number(documentVersionId),
            smartTemplateVersionId: Number(dv.smartTemplateVersionId),
            createdById: Number(
              dv.document?.ownerId || dv.document?.createdById || req.user.id
            ),
          });
      } catch (createErr) {
        console.warn(
          '[previewCurrentSmartDocumentAsPdf] Could not auto-create content:',
          createErr?.message || createErr
        );
        smartDocumentContent = null;
      }
    }
    if (!smartDocumentContent) {
      return ResponseFormatter.error(
        res,
        'Smart document content not initialized for this document version',
        400
      );
    }

    const templateVersion = dv.smartTemplateVersion;
    if (!templateVersion || !templateVersion.templateFilePath) {
      return ResponseFormatter.error(
        res,
        'Smart template version or template file missing',
        400
      );
    }

    const styleProfile =
      (dv.document &&
        dv.document.smartDocumentStyleProfile &&
        dv.document.smartDocumentStyleProfile.isActive !== false &&
        dv.document.smartDocumentStyleProfile) ||
      (templateVersion.smartTemplate && templateVersion.smartTemplate.styleProfile) ||
      templateVersion.formattingSnapshot ||
      {};

    const absTpl = path.isAbsolute(templateVersion.templateFilePath)
      ? templateVersion.templateFilePath
      : path.join(config.uploadDir, templateVersion.templateFilePath);

    if (!fsSync.existsSync(absTpl)) {
      return ResponseFormatter.notFound(res, 'Template file on disk');
    }

    let templateBuffer;
    try {
      templateBuffer = await fs.readFile(absTpl);
    } catch (fsErr) {
      throw new BadRequestError(
        `Failed to read template file from disk (${path.basename(absTpl)}): ${fsErr.message || fsErr.code || 'read error'}`
      );
    }

    const smartDocumentGenerator = require('../services/smartDocumentGenerator');
    const smartDocumentFormatter = require('../services/smartDocumentFormatter');
    const smartDocumentPdfServiceLocal = require('../services/smartDocumentPdfService');

    const fieldValuesMap =
      smartDocumentContent.fieldValuesJson &&
      typeof smartDocumentContent.fieldValuesJson === 'object'
        ? smartDocumentContent.fieldValuesJson
        : {};

    const systemValues =
      smartDocumentContent.autoFieldSnapshotJson &&
      typeof smartDocumentContent.autoFieldSnapshotJson === 'object'
        ? smartDocumentContent.autoFieldSnapshotJson
        : {};

    const formFields = templateVersion.formFields || [];
    const fieldMappings = templateVersion.fieldMappings || [];

    let docxBuf = await smartDocumentGenerator.generateDocx({
      templateBuffer,
      fieldValuesMap,
      formFields,
      fieldMappings,
      styleProfile,
      systemValues
    });

    docxBuf = await smartDocumentFormatter.applyStyleProfileToDocxBuffer({
      docxBuffer: docxBuf,
      styleProfile,
      headerValues: systemValues,
      footerValues: systemValues
    });

    const ts = Date.now();
    const fileCode = (dv.document && dv.document.fileCode) || `doc-v${dv.id}`;

    if (asDocx) {
      const fileName = `${fileCode}_v${dv.version}_preview_${ts}.docx`;
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
      res.setHeader('Content-Length', docxBuf.length);
      return res.send(docxBuf);
    }

    const resolvedDocumentTypeNameForPreview =
      (dv.document && dv.document.documentType && dv.document.documentType.name) ||
      (templateVersion && templateVersion.smartTemplate && templateVersion.smartTemplate.documentType && templateVersion.smartTemplate.documentType.name) ||
      (templateVersion && templateVersion.smartTemplate && templateVersion.smartTemplate.name) ||
      (dv.document && dv.document.documentTypeName) ||
      (systemValues && systemValues.documentTypeName) ||
      '';

    const normalizedSystemValues = {
      ...(systemValues || {}),
      documentTypeName: resolvedDocumentTypeNameForPreview || (systemValues && systemValues.documentTypeName) || '',
      documentType: resolvedDocumentTypeNameForPreview || (systemValues && systemValues.documentTypeName) || '',
      referenceCode: (systemValues && systemValues.referenceCode) || (dv.document && dv.document.fileCode) || '',
      version: (systemValues && systemValues.version) || dv.version || '',
      revision: (systemValues && systemValues.version) || dv.version || '',
      docCode: (systemValues && systemValues.referenceCode) || (dv.document && dv.document.fileCode) || '',
      fileCode: (dv.document && dv.document.fileCode) || (systemValues && systemValues.referenceCode) || ''
    };

    const { pdfBuffer } = await smartDocumentPdfServiceLocal.convertDocxBufferToPdf(docxBuf, {
      workDirSuffix: 'smart-doc-preview',
      styleProfile,
      systemValues: normalizedSystemValues,
      headerValues: normalizedSystemValues,
      footerValues: normalizedSystemValues
    });

    const fileName = `${fileCode}_v${dv.version}_preview_${ts}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (unexpectedErr) {
    if (unexpectedErr instanceof BadRequestError ||
        unexpectedErr instanceof NotFoundError ||
        unexpectedErr instanceof ForbiddenError ||
        unexpectedErr?.isOperational === true) {
      throw unexpectedErr;
    }
    console.error('[previewCurrentSmartDocumentAsPdf] Unhandled pipeline error:', unexpectedErr);
    throw new BadRequestError(
      `Preview generation failed: ${unexpectedErr.message || unexpectedErr.code || String(unexpectedErr).slice(0, 200)}`
    );
  }
});
