const prisma = require('../config/database');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../utils/errors');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const smartDocumentPdfService = require('./smartDocumentPdfService');

const DRAFT_EDITABLE_STATUSES = ['DRAFT', 'RETURNED', 'DRAFTING', 'ACKNOWLEDGED'];
const REVIEW_EDITABLE_STATUSES = ['IN_REVIEW'];
const APPROVAL_TWEAKABLE_STATUSES = [
  'PENDING_FIRST_APPROVAL',
  'IN_FIRST_APPROVAL',
  'PENDING_SECOND_APPROVAL',
  'IN_SECOND_APPROVAL'
];
const LOCKED_STATUSES = [
  'READY_TO_PUBLISH',
  'PENDING_ACKNOWLEDGMENT',
  'APPROVED',
  'PUBLISHED',
  'SUPERSEDED'
];

function stableStringify(obj) {
  if (obj === null || obj === undefined) {
    return JSON.stringify(obj);
  }
  if (typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(stableStringify).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  const parts = keys.map((k) => {
    return JSON.stringify(k) + ':' + stableStringify(obj[k]);
  });
  return '{' + parts.join(',') + '}';
}

function computeDiff(oldObj, newObj) {
  const oldSafe = oldObj && typeof oldObj === 'object' ? oldObj : {};
  const newSafe = newObj && typeof newObj === 'object' ? newObj : {};
  const allKeys = new Set([...Object.keys(oldSafe), ...Object.keys(newSafe)]);
  const diffs = [];
  for (const key of allKeys) {
    const oldVal = oldSafe[key];
    const newVal = newSafe[key];
    const oldStr = JSON.stringify(oldVal);
    const newStr = JSON.stringify(newVal);
    if (oldStr !== newStr) {
      diffs.push({ key, oldValue: oldVal, newValue: newVal });
    }
  }
  return diffs;
}

class SmartDocumentContentService {
  buildContentChecksum({ fieldValuesJson, autoFieldSnapshotJson }) {
    const canonical = stableStringify({
      f: fieldValuesJson || {},
      a: autoFieldSnapshotJson || {}
    });
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }

  async getOrCreateContentForDocumentVersion({
    documentVersionId,
    smartTemplateVersionId,
    createdById,
    initialFieldValues,
    cloneFromDocumentVersionId
  }) {
    if (!documentVersionId) {
      throw new BadRequestError('documentVersionId is required');
    }
    if (!smartTemplateVersionId) {
      throw new BadRequestError('smartTemplateVersionId is required');
    }
    if (!createdById) {
      throw new BadRequestError('createdById is required');
    }

    const existing = await prisma.smartDocumentContent.findUnique({
      where: { documentVersionId: Number(documentVersionId) }
    });

    if (existing) {
      return existing;
    }

    const docVersion = await prisma.documentVersion.findUnique({
      where: { id: Number(documentVersionId) },
      include: { document: true }
    });

    if (!docVersion) {
      throw new NotFoundError('DocumentVersion');
    }

    const tplVersion = await prisma.smartTemplateVersion.findUnique({
      where: { id: Number(smartTemplateVersionId) },
      include: { formFields: true }
    });

    if (!tplVersion) {
      throw new NotFoundError('SmartTemplateVersion');
    }

    let fieldValuesJson = {};
    let autoFieldSnapshotJson = {
      documentVersionId: Number(documentVersionId),
      createdByUserId: Number(createdById),
      createdAtTimestamp: Date.now()
    };

    if (cloneFromDocumentVersionId) {
      const cloneSource = await prisma.smartDocumentContent.findUnique({
        where: { documentVersionId: Number(cloneFromDocumentVersionId) }
      });
      if (!cloneSource) {
        throw new NotFoundError('Source SmartDocumentContent for clone');
      }
      fieldValuesJson = cloneSource.fieldValuesJson
        ? JSON.parse(JSON.stringify(cloneSource.fieldValuesJson))
        : {};
      autoFieldSnapshotJson = cloneSource.autoFieldSnapshotJson
        ? {
            ...JSON.parse(JSON.stringify(cloneSource.autoFieldSnapshotJson)),
            documentVersionId: Number(documentVersionId),
            createdByUserId: Number(createdById),
            clonedFromDocumentVersionId: Number(cloneFromDocumentVersionId),
            createdAtTimestamp: Date.now()
          }
        : autoFieldSnapshotJson;
    } else {
      for (const field of tplVersion.formFields || []) {
        let defaultVal = null;
        if (field.defaultValueJson) {
          const dv = field.defaultValueJson;
          if (dv && typeof dv === 'object' && dv.hasOwnProperty('value')) {
            defaultVal = dv.value;
          } else {
            defaultVal = dv;
          }
        }
        fieldValuesJson[field.fieldKey] = defaultVal;
      }
      if (initialFieldValues && typeof initialFieldValues === 'object') {
        for (const [k, v] of Object.entries(initialFieldValues)) {
          if (fieldValuesJson.hasOwnProperty(k)) {
            fieldValuesJson[k] = v;
          }
        }
      }
    }

    const contentChecksum = this.buildContentChecksum({
      fieldValuesJson,
      autoFieldSnapshotJson
    });

    const created = await prisma.smartDocumentContent.create({
      data: {
        documentId: docVersion.documentId,
        documentVersionId: Number(documentVersionId),
        smartTemplateVersionId: Number(smartTemplateVersionId),
        fieldValuesJson,
        autoFieldSnapshotJson,
        contentChecksum,
        createdById: Number(createdById)
      }
    });

    return created;
  }

  async saveFieldValues({
    documentVersionId,
    changedByUserId,
    fieldValues,
    workflowAction = 'DRAFT_EDIT',
    commentId = null,
    skipLockCheck = false,
    allowOverwriteSystemGenerated = false
  }) {
    if (!documentVersionId) {
      throw new BadRequestError('documentVersionId is required');
    }
    if (!changedByUserId) {
      throw new BadRequestError('changedByUserId is required');
    }
    if (!fieldValues || typeof fieldValues !== 'object') {
      throw new BadRequestError('fieldValues object is required');
    }

    const docVersion = await prisma.documentVersion.findUnique({
      where: { id: Number(documentVersionId) },
      include: {
        smartDocumentContent: true,
        smartTemplateVersion: {
          include: { formFields: true }
        },
        document: true
      }
    });

    if (!docVersion) {
      throw new NotFoundError('DocumentVersion');
    }

    let content = docVersion.smartDocumentContent;
    if (!content) {
      const stvId =
        docVersion.smartTemplateVersionId ||
        (docVersion.smartTemplateVersion && docVersion.smartTemplateVersion.id) ||
        null;
      if (!stvId) {
        throw new BadRequestError(
          'Smart template version not assigned to document version. Cannot save field values.'
        );
      }
      content = await this.getOrCreateContentForDocumentVersion({
        documentVersionId: Number(documentVersionId),
        smartTemplateVersionId: Number(stvId),
        createdById: Number(changedByUserId),
        initialFieldValues: fieldValues,
      });
    }

    const doc = docVersion.document;
    if (!doc) {
      throw new NotFoundError('Document');
    }

    if (!skipLockCheck) {
      if (docVersion.smartContentIsLocked) {
        throw new BadRequestError('Content is locked');
      }

      const status = doc.status;
      const changer = await prisma.user.findUnique({
        where: { id: Number(changedByUserId) },
        include: { roles: { include: { role: true } } }
      });
      const isAdmin =
        changer &&
        changer.roles &&
        changer.roles.some(
          (ur) => ur.role && (ur.role.isSystem || ur.role.name === 'ADMIN' || /admin/i.test(ur.role.name))
        );

      if (LOCKED_STATUSES.includes(status) && !isAdmin) {
        throw new BadRequestError(
          `Content locked during ${status} status. No edits permitted.`
        );
      }

      if (APPROVAL_TWEAKABLE_STATUSES.includes(status)) {
        if (workflowAction !== 'APPROVER_MINOR_TWEAK') {
          throw new BadRequestError(
            `Content locked during ${status} status. Only approver minor tweaks permitted.`
          );
        }
        const isFirstApprover = doc.firstApproverId && Number(doc.firstApproverId) === Number(changedByUserId);
        const isSecondApprover = doc.secondApproverId && Number(doc.secondApproverId) === Number(changedByUserId);
        if (!isAdmin && !isFirstApprover && !isSecondApprover) {
          throw new ForbiddenError(
            'Only the assigned first/second approver or admin can apply minor tweaks during approval'
          );
        }
      }

      if (REVIEW_EDITABLE_STATUSES.includes(status)) {
        if (workflowAction !== 'REVIEWER_DIRECT_EDIT') {
          throw new BadRequestError(
            'Content locked during review. Author edits disabled.'
          );
        }
        const isReviewer = doc.reviewerId && Number(doc.reviewerId) === Number(changedByUserId);
        if (!isAdmin && !isReviewer) {
          throw new ForbiddenError(
            'Only the assigned reviewer or admin can edit fields during review stage'
          );
        }
      }

      if (DRAFT_EDITABLE_STATUSES.includes(status)) {
        const isOwner =
          Number(doc.ownerId) === Number(changedByUserId) ||
          Number(doc.createdById) === Number(changedByUserId);
        if (!isOwner && !isAdmin) {
          throw new ForbiddenError(
            'Only document owner/creator or admin can edit in DRAFT status'
          );
        }
      }
    }

    const formFields = (docVersion.smartTemplateVersion && docVersion.smartTemplateVersion.formFields) || [];
    const systemGeneratedKeys = new Set(
      formFields
        .filter((f) => f.inputType === 'SYSTEM_GENERATED')
        .map((f) => f.fieldKey)
    );

    const existingFieldValues = content.fieldValuesJson && typeof content.fieldValuesJson === 'object'
      ? content.fieldValuesJson
      : {};

    const mergedFieldValues = { ...existingFieldValues };
    for (const [k, v] of Object.entries(fieldValues)) {
      if (!allowOverwriteSystemGenerated && systemGeneratedKeys.has(k)) {
        continue;
      }
      mergedFieldValues[k] = v;
    }

    const diffs = computeDiff(existingFieldValues, mergedFieldValues);

    const autoSnapshot = content.autoFieldSnapshotJson && typeof content.autoFieldSnapshotJson === 'object'
      ? content.autoFieldSnapshotJson
      : {};

    const newChecksum = this.buildContentChecksum({
      fieldValuesJson: mergedFieldValues,
      autoFieldSnapshotJson: autoSnapshot
    });

    const result = await prisma.$transaction(async (tx) => {
      if (diffs.length > 0) {
        const changes = diffs.map((d) => ({
          documentId: docVersion.documentId,
          documentVersionId: Number(documentVersionId),
          smartFormFieldKey: d.key,
          changedById: Number(changedByUserId),
          oldValueSnapshot: d.oldValue !== undefined ? d.oldValue : null,
          newValueSnapshot: d.newValue !== undefined ? d.newValue : null,
          workflowAction: workflowAction || null,
          sourceCommentId: commentId ? Number(commentId) : null
        }));
        await tx.smartDocumentFieldChange.createMany({ data: changes });
      }

      // Append audit trail snapshots for workflow-tracked edits
      let updatedAuditTrail = content.fieldAuditTrailJson;
      if (diffs.length > 0 && (workflowAction === 'REVIEWER_DIRECT_EDIT' || workflowAction === 'APPROVER_MINOR_TWEAK')) {
        const snapshotClone = JSON.parse(JSON.stringify(mergedFieldValues));
        const existingBeforeClone = JSON.parse(JSON.stringify(existingFieldValues));

        // Normalize existing audit trail to array format
        let auditArr = [];
        if (Array.isArray(updatedAuditTrail)) {
          auditArr = [...updatedAuditTrail];
        } else if (updatedAuditTrail && typeof updatedAuditTrail === 'object') {
          // Legacy object format: convert to array entries
          if (updatedAuditTrail.drafterSnapshot) {
            auditArr.push({
              action: 'DRAFTER_BASELINE',
              userId: null,
              timestamp: Date.now(),
              snapshot: JSON.parse(JSON.stringify(updatedAuditTrail.drafterSnapshot))
            });
          }
          if (updatedAuditTrail.reviewerSnapshot) {
            auditArr.push({
              action: 'REVIEWER_DIRECT_EDIT',
              userId: null,
              timestamp: Date.now(),
              snapshot: JSON.parse(JSON.stringify(updatedAuditTrail.reviewerSnapshot))
            });
          }
        }

        if (workflowAction === 'REVIEWER_DIRECT_EDIT') {
          // On FIRST reviewer edit ever, capture drafter's baseline from the pre-edit DB values
          const hasDrafterBaseline = auditArr.some(e => e && e.action === 'DRAFTER_BASELINE');
          if (!hasDrafterBaseline) {
            auditArr.unshift({
              action: 'DRAFTER_BASELINE',
              userId: Number(doc.ownerId || doc.createdById || changedByUserId),
              timestamp: Date.now(),
              snapshot: existingBeforeClone
            });
          }
          auditArr.push({
            action: 'REVIEWER_DIRECT_EDIT',
            userId: Number(changedByUserId),
            timestamp: Date.now(),
            snapshot: snapshotClone
          });
        } else if (workflowAction === 'APPROVER_MINOR_TWEAK') {
          auditArr.push({
            action: 'APPROVER_MINOR_TWEAK',
            userId: Number(changedByUserId),
            timestamp: Date.now(),
            snapshot: snapshotClone
          });
        }

        updatedAuditTrail = auditArr;
      }

      const updateData = {
        fieldValuesJson: mergedFieldValues,
        contentChecksum: newChecksum
      };
      if (updatedAuditTrail !== undefined && updatedAuditTrail !== content.fieldAuditTrailJson) {
        updateData.fieldAuditTrailJson = updatedAuditTrail;
      }

      return tx.smartDocumentContent.update({
        where: { id: content.id },
        data: updateData
      });
    });

    return {
      content: result,
      fieldChangeCount: diffs.length
    };
  }

  async lockContentForDocumentVersion(documentVersionId) {
    if (!documentVersionId) {
      throw new BadRequestError('documentVersionId is required');
    }
    const dv = await prisma.documentVersion.findUnique({
      where: { id: Number(documentVersionId) },
      select: { id: true }
    });
    if (!dv) {
      throw new NotFoundError('DocumentVersion');
    }
    return prisma.documentVersion.update({
      where: { id: Number(documentVersionId) },
      data: { smartContentIsLocked: true }
    });
  }

  async unlockContentForDocumentVersion(documentVersionId) {
    if (!documentVersionId) {
      throw new BadRequestError('documentVersionId is required');
    }
    const dv = await prisma.documentVersion.findUnique({
      where: { id: Number(documentVersionId) },
      select: { id: true }
    });
    if (!dv) {
      throw new NotFoundError('DocumentVersion');
    }
    return prisma.documentVersion.update({
      where: { id: Number(documentVersionId) },
      data: { smartContentIsLocked: false }
    });
  }

  async snapshotSystemFields({ documentVersionId, systemValues }) {
    if (!documentVersionId) {
      throw new BadRequestError('documentVersionId is required');
    }
    if (!systemValues || typeof systemValues !== 'object') {
      throw new BadRequestError('systemValues object is required');
    }

    const content = await prisma.smartDocumentContent.findUnique({
      where: { documentVersionId: Number(documentVersionId) }
    });
    if (!content) {
      throw new NotFoundError('SmartDocumentContent for this DocumentVersion');
    }

    const existingSnapshot = content.autoFieldSnapshotJson && typeof content.autoFieldSnapshotJson === 'object'
      ? content.autoFieldSnapshotJson
      : {};

    const mergedSnapshot = { ...existingSnapshot };
    const allowedKeys = [
      'referenceCode',
      'version',
      'documentTypeName',
      'preparedByFullName',
      'preparedDate',
      'reviewedByFullName',
      'approvedByFullName',
      'publishedDate'
    ];
    for (const key of allowedKeys) {
      if (systemValues.hasOwnProperty(key)) {
        mergedSnapshot[key] = systemValues[key];
      }
    }

    const fieldVals = content.fieldValuesJson && typeof content.fieldValuesJson === 'object'
      ? content.fieldValuesJson
      : {};

    const newChecksum = this.buildContentChecksum({
      fieldValuesJson: fieldVals,
      autoFieldSnapshotJson: mergedSnapshot
    });

    return prisma.smartDocumentContent.update({
      where: { id: content.id },
      data: {
        autoFieldSnapshotJson: mergedSnapshot,
        contentChecksum: newChecksum
      }
    });
  }

  async createNewRevisionFromExisting({
    existingDocumentId,
    oldDocumentVersionId,
    newDocumentVersionId,
    smartTemplateVersionId,
    createdById
  }) {
    return this.getOrCreateContentForDocumentVersion({
      documentVersionId: newDocumentVersionId,
      smartTemplateVersionId,
      createdById,
      cloneFromDocumentVersionId: oldDocumentVersionId
    });
  }
}

module.exports = new SmartDocumentContentService();
module.exports.computeDiff = computeDiff;
module.exports.stableStringify = stableStringify;
