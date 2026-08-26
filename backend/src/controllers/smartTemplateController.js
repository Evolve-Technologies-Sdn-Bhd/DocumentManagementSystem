const prisma = require('../config/database');
const ResponseFormatter = require('../utils/responseFormatter');
const asyncHandler = require('../utils/asyncHandler');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config/app');
const { BadRequestError, NotFoundError } = require('../utils/errors');
const placeholderExtractor = require('../services/smartDocumentPlaceholderExtractor');
const smartDocumentGenerator = require('../services/smartDocumentGenerator');
const smartDocumentPdfService = require('../services/smartDocumentPdfService');
const smartDocumentFormatter = require('../services/smartDocumentFormatter');
const fileStorageService = require('../services/fileStorageService');

const INPUT_TYPES = [
  'TEXT', 'TEXTAREA', 'RICH_TEXT', 'NUMBER', 'DATE', 'TIME', 'DATETIME',
  'DROPDOWN', 'SINGLE_SELECT', 'MULTI_SELECT',
  'CHECKBOX', 'USER_LOOKUP', 'TABLE', 'IMAGE', 'ATTACHMENT',
  'REPEATER', 'SYSTEM_GENERATED'
]

const parseBool = (v) => {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const s = v.toLowerCase();
    if (s === 'true') return true;
    if (s === 'false') return false;
  }
  return undefined;
};

const parseIntSafe = (v, fallback = undefined) => {
  if (v === null || v === undefined || v === '') return fallback;
  const n = parseInt(v, 10);
  return isNaN(n) ? fallback : n;
};

exports.listSmartTemplates = asyncHandler(async (req, res) => {
  const documentTypeId = parseIntSafe(req.query.documentTypeId);
  const isActive = parseBool(req.query.isActive);

  const where = {};
  if (documentTypeId) where.documentTypeId = documentTypeId;
  if (isActive !== undefined) where.isActive = isActive;

  const templates = await prisma.smartTemplate.findMany({
    where,
    include: {
      styleProfile: true,
      documentType: true,
      versions: {
        orderBy: { createdAt: 'desc' },
        take: 5
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  return ResponseFormatter.success(
    res,
    { templates },
    'Smart templates retrieved successfully'
  );
});

exports.getSmartTemplate = asyncHandler(async (req, res) => {
  const id = parseIntSafe(req.params.id);
  if (!id) {
    return ResponseFormatter.notFound(res, 'Smart Template');
  }

  const template = await prisma.smartTemplate.findUnique({
    where: { id },
    include: {
      styleProfile: true,
      versions: {
        orderBy: { createdAt: 'desc' },
        include: {
          sections: {
            orderBy: { sortOrder: 'asc' }
          },
          formFields: {
            orderBy: { sortOrder: 'asc' },
            include: {
              fieldMapping: true
            }
          },
          fieldMappings: true
        }
      }
    }
  });

  if (!template) {
    return ResponseFormatter.notFound(res, 'Smart Template');
  }

  return ResponseFormatter.success(
    res,
    { template },
    'Smart template retrieved successfully'
  );
});

exports.createSmartTemplate = asyncHandler(async (req, res) => {
  const {
    templateName,
    templateCode,
    description,
    documentTypeId,
    styleProfileId,
    includeRevisionInDoc,
    includeFileCodeInDoc,
    includePreparedBy,
    includeDates
  } = req.body;

  if (!templateName || !templateCode || !documentTypeId) {
    return ResponseFormatter.error(
      res,
      'templateName, templateCode, and documentTypeId are required',
      400
    );
  }

  const docTypeId = parseIntSafe(documentTypeId);
  if (!docTypeId) {
    return ResponseFormatter.error(res, 'Invalid documentTypeId', 400);
  }

  const profileId = parseIntSafe(styleProfileId);

  const data = {
    templateName: String(templateName).trim(),
    templateCode: String(templateCode).trim(),
    description: description ? String(description) : null,
    documentTypeId: docTypeId,
    createdById: req.user.id,
    styleProfileId: profileId,
    includeRevisionInDoc: includeRevisionInDoc !== undefined ? Boolean(includeRevisionInDoc) : true,
    includeFileCodeInDoc: includeFileCodeInDoc !== undefined ? Boolean(includeFileCodeInDoc) : true,
    includePreparedBy: includePreparedBy !== undefined ? Boolean(includePreparedBy) : true,
    includeDates: includeDates !== undefined ? Boolean(includeDates) : true
  };

  try {
    const template = await prisma.smartTemplate.create({
      data,
      include: {
        styleProfile: true,
        versions: {
          orderBy: { createdAt: 'desc' },
          take: 5
        }
      }
    });

    return ResponseFormatter.success(
      res,
      { template },
      'Smart template created successfully',
      201
    );
  } catch (error) {
    if (error?.code === 'P2002') {
      const target = error?.meta?.target || [];
      if (Array.isArray(target) && target.includes('templateCode')) {
        return ResponseFormatter.error(
          res,
          'A smart template with this templateCode already exists',
          409
        );
      }
    }
    throw error;
  }
});

exports.updateSmartTemplate = asyncHandler(async (req, res) => {
  const id = parseIntSafe(req.params.id);
  if (!id) {
    return ResponseFormatter.notFound(res, 'Smart Template');
  }

  const existing = await prisma.smartTemplate.findUnique({
    where: { id },
    select: { id: true, isActive: true, documentTypeId: true }
  });

  if (!existing) {
    return ResponseFormatter.notFound(res, 'Smart Template');
  }

  const lockedVersions = await prisma.smartTemplateVersion.findMany({
    where: { smartTemplateId: id, isLocked: true },
    take: 1
  });

  const hasLocked = lockedVersions.length > 0;

  const {
    templateName,
    templateCode,
    description,
    documentTypeId,
    styleProfileId,
    isActive,
    includeRevisionInDoc,
    includeFileCodeInDoc,
    includePreparedBy,
    includeDates
  } = req.body;

  const data = {};
  if (templateName !== undefined) data.templateName = String(templateName).trim();
  if (templateCode !== undefined) data.templateCode = String(templateCode).trim();
  if (description !== undefined) data.description = description ? String(description) : null;
  if (documentTypeId !== undefined) {
    const dtId = parseIntSafe(documentTypeId);
    if (!dtId) return ResponseFormatter.error(res, 'Invalid documentTypeId', 400);
    if (hasLocked && dtId !== existing.documentTypeId) {
      return ResponseFormatter.error(
        res,
        'Cannot change documentTypeId because one or more versions are locked (published). Document type is part of the immutable record for published versions.',
        400
      );
    }
    data.documentTypeId = dtId;
  }
  if (styleProfileId !== undefined) {
    const spId = parseIntSafe(styleProfileId);
    data.styleProfileId = spId;
  }
  if (isActive !== undefined) data.isActive = Boolean(isActive);
  if (includeRevisionInDoc !== undefined) data.includeRevisionInDoc = Boolean(includeRevisionInDoc);
  if (includeFileCodeInDoc !== undefined) data.includeFileCodeInDoc = Boolean(includeFileCodeInDoc);
  if (includePreparedBy !== undefined) data.includePreparedBy = Boolean(includePreparedBy);
  if (includeDates !== undefined) data.includeDates = Boolean(includeDates);

  try {
    const template = await prisma.smartTemplate.update({
      where: { id },
      data,
      include: {
        styleProfile: true,
        versions: {
          orderBy: { createdAt: 'desc' },
          take: 5
        }
      }
    });

    return ResponseFormatter.success(
      res,
      { template },
      'Smart template updated successfully'
    );
  } catch (error) {
    if (error?.code === 'P2002') {
      const target = error?.meta?.target || [];
      if (Array.isArray(target) && target.includes('templateCode')) {
        return ResponseFormatter.error(
          res,
          'A smart template with this templateCode already exists',
          409
        );
      }
    }
    throw error;
  }
});

exports.deleteSmartTemplate = asyncHandler(async (req, res) => {
  const id = parseIntSafe(req.params.id);
  if (!id) {
    return ResponseFormatter.notFound(res, 'Smart Template');
  }

  const existing = await prisma.smartTemplate.findUnique({
    where: { id },
    select: { id: true }
  });

  if (!existing) {
    return ResponseFormatter.notFound(res, 'Smart Template');
  }

  const versionIds = await prisma.smartTemplateVersion.findMany({
    where: { smartTemplateId: id },
    select: { id: true }
  });

  if (versionIds.length > 0) {
    const ids = versionIds.map(v => v.id);
    const inUse = await prisma.smartDocumentContent.findFirst({
      where: { smartTemplateVersionId: { in: ids } },
      select: { id: true }
    });

    if (inUse) {
      return ResponseFormatter.error(
        res,
        'Cannot delete smart template because documents exist referencing one or more of its versions',
        400
      );
    }
  }

  await prisma.smartTemplate.delete({
    where: { id }
  });

  return ResponseFormatter.success(
    res,
    null,
    'Smart template deleted successfully'
  );
});

exports.createVersion = asyncHandler(async (req, res) => {
  const id = parseIntSafe(req.params.id);
  if (!id) {
    return ResponseFormatter.notFound(res, 'Smart Template');
  }

  const template = await prisma.smartTemplate.findUnique({
    where: { id },
    select: { id: true }
  });

  if (!template) {
    return ResponseFormatter.notFound(res, 'Smart Template');
  }

  const {
    versionNo,
    versionLabel,
    templateFilePath,
    templateFileName,
    placeholdersJson,
    changeNotes,
    copyFromVersionId
  } = req.body;

  if (!versionNo) {
    return ResponseFormatter.error(res, 'versionNo is required', 400);
  }

  const copyFromId = parseIntSafe(copyFromVersionId);

  let sourceVersion = null;
  if (copyFromId) {
    sourceVersion = await prisma.smartTemplateVersion.findUnique({
      where: { id: copyFromId },
      select: {
        id: true,
        smartTemplateId: true,
        versionNo: true,
        templateFilePath: true,
        templateFileName: true,
        templateFileSize: true,
        templateFileHash: true,
        templateUploadedAt: true,
        placeholdersJson: true,
        sections: true,
        formFields: {
          include: { fieldMapping: true }
        }
      }
    });
    if (!sourceVersion || sourceVersion.smartTemplateId !== id) {
      return ResponseFormatter.error(res, 'Invalid copyFromVersionId', 400);
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.smartTemplateVersion.updateMany({
        where: { smartTemplateId: id, isCurrent: true },
        data: { isCurrent: false }
      });

      const version = await tx.smartTemplateVersion.create({
        data: {
          smartTemplateId: id,
          versionNo: String(versionNo).trim(),
          versionLabel: versionLabel ? String(versionLabel) : null,
          templateFilePath: templateFilePath ? String(templateFilePath) : (sourceVersion ? sourceVersion.templateFilePath : null),
          templateFileName: templateFileName ? String(templateFileName) : (sourceVersion ? sourceVersion.templateFileName : null),
          templateFileSize: sourceVersion?.templateFileSize ?? null,
          templateFileHash: sourceVersion?.templateFileHash ?? null,
          templateUploadedAt: sourceVersion?.templateUploadedAt ?? null,
          placeholdersJson: placeholdersJson || (sourceVersion ? sourceVersion.placeholdersJson : null),
          changeNotes: changeNotes ? String(changeNotes) : null,
          isCurrent: true,
          createdById: req.user.id
        }
      });

      if (sourceVersion) {
        const sectionKeyMap = new Map();
        if (sourceVersion.sections && sourceVersion.sections.length > 0) {
          const sortedSections = [...sourceVersion.sections].sort(
            (a, b) => (a.parentSectionId ? 1 : 0) - (b.parentSectionId ? 1 : 0)
          );
          for (const sec of sortedSections) {
            const newParentId = sec.parentSectionId
              ? sectionKeyMap.get(`${sourceVersion.id}:${sec.parentSectionId}`)
              : null;
            const createdSec = await tx.smartTemplateSection.create({
              data: {
                smartTemplateVersionId: version.id,
                sectionKey: sec.sectionKey,
                sectionName: sec.sectionName,
                sectionDescription: sec.sectionDescription,
                sortOrder: sec.sortOrder,
                isRequired: sec.isRequired,
                isCollapsible: sec.isCollapsible,
                isSystemSection: sec.isSystemSection,
                sectionHelpText: sec.sectionHelpText,
                parentSectionId: newParentId,
                layoutConfig: sec.layoutConfig,
                createdById: req.user.id
              }
            });
            sectionKeyMap.set(`${sourceVersion.id}:${sec.id}`, createdSec.id);
          }
        }

        if (sourceVersion.formFields && sourceVersion.formFields.length > 0) {
          for (const fld of sourceVersion.formFields) {
            const sectionId = fld.smartTemplateSectionId
              ? sectionKeyMap.get(`${sourceVersion.id}:${fld.smartTemplateSectionId}`)
              : null;
            const createdFld = await tx.smartFormField.create({
              data: {
                smartTemplateVersionId: version.id,
                smartTemplateSectionId: sectionId,
                fieldKey: fld.fieldKey,
                fieldLabel: fld.fieldLabel,
                fieldHelpText: fld.fieldHelpText,
                placeholderHint: fld.placeholderHint,
                inputType: fld.inputType,
                optionsJson: fld.optionsJson,
                validationRulesJson: fld.validationRulesJson,
                defaultValueJson: fld.defaultValueJson,
                tableSchemaJson: fld.tableSchemaJson,
                repeaterSchemaJson: fld.repeaterSchemaJson,
                imageConfigJson: fld.imageConfigJson,
                attachmentConfigJson: fld.attachmentConfigJson,
                systemFieldConfigJson: fld.systemFieldConfigJson,
                visibilityRulesJson: fld.visibilityRulesJson,
                isMandatory: fld.isMandatory,
                isEditableAuthor: fld.isEditableAuthor,
                isEditableReviewer: fld.isEditableReviewer,
                isVisibleInForm: fld.isVisibleInForm,
                isVisibleInPreview: fld.isVisibleInPreview,
                isSearchable: fld.isSearchable,
                isSupportingField: !!fld.isSupportingField,
                sortOrder: fld.sortOrder,
                createdById: req.user.id
              }
            });

            if (fld.fieldMapping) {
              const fm = fld.fieldMapping;
              await tx.smartFieldMapping.create({
                data: {
                  smartTemplateVersionId: version.id,
                  smartFormFieldId: createdFld.id,
                  placeholderName: fm.placeholderName,
                  placeholderType: fm.placeholderType,
                  outputFormatJson: fm.outputFormatJson,
                  targetSectionName: fm.targetSectionName,
                  repeatParentTag: fm.repeatParentTag,
                  sortOrder: fm.sortOrder,
                  createdById: req.user.id
                }
              });
            }
          }
        }
      }

      return version;
    });

    const version = await prisma.smartTemplateVersion.findUnique({
      where: { id: result.id },
      include: {
        sections: { orderBy: { sortOrder: 'asc' } },
        formFields: {
          orderBy: { sortOrder: 'asc' },
          include: { fieldMapping: true }
        },
        fieldMappings: true
      }
    });

    return ResponseFormatter.success(
      res,
      { version },
      'Smart template version created successfully',
      201
    );
  } catch (error) {
    if (error?.code === 'P2002') {
      const target = error?.meta?.target || [];
      if (Array.isArray(target) && target.includes('smartTemplateId') && target.includes('versionNo')) {
        return ResponseFormatter.error(
          res,
          'A version with this versionNo already exists for this smart template',
          409
        );
      }
    }
    throw error;
  }
});

exports.publishVersion = asyncHandler(async (req, res) => {
  const id = parseIntSafe(req.params.id);
  const versionId = parseIntSafe(req.params.versionId);

  if (!id || !versionId) {
    return ResponseFormatter.notFound(res, 'Smart Template Version');
  }

  const template = await prisma.smartTemplate.findUnique({
    where: { id },
    select: { id: true, styleProfileId: true }
  });

  if (!template) {
    return ResponseFormatter.notFound(res, 'Smart Template');
  }

  const version = await prisma.smartTemplateVersion.findUnique({
    where: { id: versionId },
    select: {
      id: true,
      smartTemplateId: true,
      isLocked: true
    }
  });

  if (!version || version.smartTemplateId !== id) {
    return ResponseFormatter.notFound(res, 'Smart Template Version');
  }

  let formattingSnapshot = null;
  if (template.styleProfileId) {
    const profile = await prisma.smartDocumentStyleProfile.findUnique({
      where: { id: template.styleProfileId }
    });
    if (profile) {
      formattingSnapshot = { ...profile };
      delete formattingSnapshot.id;
      delete formattingSnapshot.createdAt;
      delete formattingSnapshot.updatedAt;
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.smartTemplateVersion.updateMany({
      where: { smartTemplateId: id, isCurrent: true, id: { not: versionId } },
      data: { isCurrent: false }
    });

    return tx.smartTemplateVersion.update({
      where: { id: versionId },
      data: {
        isLocked: true,
        isCurrent: true,
        publishedById: req.user.id,
        publishedAt: new Date(),
        formattingSnapshot
      },
      include: {
        sections: { orderBy: { sortOrder: 'asc' } },
        formFields: {
          orderBy: { sortOrder: 'asc' },
          include: { fieldMapping: true }
        },
        fieldMappings: true,
        publishedBy: { select: { id: true, email: true, firstName: true, lastName: true } }
      }
    });
  });

  return ResponseFormatter.success(
    res,
    { version: updated },
    'Smart template version published successfully'
  );
});

exports.listSectionsForVersion = asyncHandler(async (req, res) => {
  const versionId = parseIntSafe(req.params.versionId);
  if (!versionId) {
    return ResponseFormatter.notFound(res, 'Smart Template Version');
  }

  const version = await prisma.smartTemplateVersion.findUnique({
    where: { id: versionId },
    select: { id: true }
  });

  if (!version) {
    return ResponseFormatter.notFound(res, 'Smart Template Version');
  }

  const sections = await prisma.smartTemplateSection.findMany({
    where: { smartTemplateVersionId: versionId },
    orderBy: { sortOrder: 'asc' }
  });

  return ResponseFormatter.success(
    res,
    { sections },
    'Sections retrieved successfully'
  );
});

exports.upsertSectionsForVersion = asyncHandler(async (req, res) => {
  const versionId = parseIntSafe(req.params.versionId);
  if (!versionId) {
    return ResponseFormatter.notFound(res, 'Smart Template Version');
  }

  const version = await prisma.smartTemplateVersion.findUnique({
    where: { id: versionId },
    select: { id: true, isLocked: true }
  });

  if (!version) {
    return ResponseFormatter.notFound(res, 'Smart Template Version');
  }

  if (version.isLocked) {
    return ResponseFormatter.error(
      res,
      'Cannot modify sections of a locked (published) version',
      400
    );
  }

  const { sections } = req.body;
  if (!Array.isArray(sections)) {
    return ResponseFormatter.error(res, 'sections array is required', 400);
  }

  for (const sec of sections) {
    if (!sec.sectionKey || !sec.sectionName) {
      return ResponseFormatter.error(
        res,
        'Each section must have sectionKey and sectionName',
        400
      );
    }
  }

  const upserted = [];
  for (const sec of sections) {
    const parentId = parseIntSafe(sec.parentSectionId);
    const data = {
      smartTemplateVersionId: versionId,
      sectionKey: String(sec.sectionKey).trim(),
      sectionName: String(sec.sectionName).trim(),
      sectionDescription: sec.sectionDescription !== undefined
        ? (sec.sectionDescription ? String(sec.sectionDescription) : null)
        : undefined,
      sortOrder: sec.sortOrder !== undefined ? Number(sec.sortOrder) : 0,
      isRequired: sec.isRequired !== undefined ? Boolean(sec.isRequired) : true,
      isCollapsible: sec.isCollapsible !== undefined ? Boolean(sec.isCollapsible) : true,
      isSystemSection: sec.isSystemSection !== undefined ? Boolean(sec.isSystemSection) : false,
      sectionHelpText: sec.sectionHelpText !== undefined
        ? (sec.sectionHelpText ? String(sec.sectionHelpText) : null)
        : undefined,
      parentSectionId: parentId,
      layoutConfig: sec.layoutConfig || undefined,
      createdById: req.user.id
    };

    const result = await prisma.smartTemplateSection.upsert({
      where: {
        smartTemplateVersionId_sectionKey: {
          smartTemplateVersionId: versionId,
          sectionKey: String(sec.sectionKey).trim()
        }
      },
      create: data,
      update: {
        sectionName: data.sectionName,
        sectionDescription: data.sectionDescription,
        sortOrder: data.sortOrder,
        isRequired: data.isRequired,
        isCollapsible: data.isCollapsible,
        isSystemSection: data.isSystemSection,
        sectionHelpText: data.sectionHelpText,
        parentSectionId: data.parentSectionId,
        layoutConfig: data.layoutConfig
      }
    });
    upserted.push(result);
  }

  return ResponseFormatter.success(
    res,
    { sections: upserted },
    'Sections upserted successfully'
  );
});

exports.listFieldsForVersion = asyncHandler(async (req, res) => {
  const versionId = parseIntSafe(req.params.versionId);
  if (!versionId) {
    return ResponseFormatter.notFound(res, 'Smart Template Version');
  }

  const version = await prisma.smartTemplateVersion.findUnique({
    where: { id: versionId },
    select: { id: true }
  });

  if (!version) {
    return ResponseFormatter.notFound(res, 'Smart Template Version');
  }

  const fields = await prisma.smartFormField.findMany({
    where: { smartTemplateVersionId: versionId },
    orderBy: { sortOrder: 'asc' },
    include: {
      fieldMapping: true
    }
  });

  return ResponseFormatter.success(
    res,
    { fields },
    'Fields retrieved successfully'
  );
});

exports.upsertFieldsForVersion = asyncHandler(async (req, res) => {
  const versionId = parseIntSafe(req.params.versionId);
  if (!versionId) {
    return ResponseFormatter.notFound(res, 'Smart Template Version');
  }

  const version = await prisma.smartTemplateVersion.findUnique({
    where: { id: versionId },
    select: { id: true, isLocked: true }
  });

  if (!version) {
    return ResponseFormatter.notFound(res, 'Smart Template Version');
  }

  if (version.isLocked) {
    return ResponseFormatter.error(
      res,
      'Cannot modify fields of a locked (published) version',
      400
    );
  }

  const { fields } = req.body;
  if (!Array.isArray(fields)) {
    return ResponseFormatter.error(res, 'fields array is required', 400);
  }

  for (const f of fields) {
    if (!f.fieldKey || !f.fieldLabel || !f.inputType) {
      return ResponseFormatter.error(
        res,
        `Each field must have fieldKey, fieldLabel, and inputType. Got: ${JSON.stringify(f).slice(0, 80)}`,
        400
      );
    }
    if (!INPUT_TYPES.includes(String(f.inputType))) {
      return ResponseFormatter.error(
        res,
        `Invalid inputType "${f.inputType}" for field "${f.fieldKey}". Allowed: ${INPUT_TYPES.join(', ')}`,
        400
      );
    }
    if (String(f.fieldKey).trim().length > 120) {
      return ResponseFormatter.error(res, `Field Key for "${f.fieldKey}" is too long (max 120 chars).`, 400);
    }
  }

  const seen = new Set();
  for (const f of fields) {
    const k = String(f.fieldKey).trim().toUpperCase();
    if (seen.has(k)) {
      return ResponseFormatter.error(res, `Duplicate Field Key "${k}" in submitted payload — Form Fields must have unique Field Keys.`, 400);
    }
    seen.add(k);
  }

  const upserted = [];
  for (const f of fields) {
    const sectionId = parseIntSafe(f.smartTemplateSectionId);
    const createData = {
      smartTemplateVersionId: versionId,
      smartTemplateSectionId: sectionId,
      fieldKey: String(f.fieldKey).trim(),
      fieldLabel: String(f.fieldLabel).trim(),
      fieldHelpText: f.fieldHelpText !== undefined
        ? (f.fieldHelpText ? String(f.fieldHelpText) : null)
        : undefined,
      placeholderHint: f.placeholderHint !== undefined
        ? (f.placeholderHint ? String(f.placeholderHint) : null)
        : undefined,
      inputType: f.inputType,
      optionsJson: f.optionsJson || undefined,
      validationRulesJson: f.validationRulesJson || undefined,
      defaultValueJson: f.defaultValueJson || undefined,
      tableSchemaJson: f.tableSchemaJson || undefined,
      repeaterSchemaJson: f.repeaterSchemaJson || undefined,
      imageConfigJson: f.imageConfigJson || undefined,
      attachmentConfigJson: f.attachmentConfigJson || undefined,
      systemFieldConfigJson: f.systemFieldConfigJson || undefined,
      visibilityRulesJson: f.visibilityRulesJson || undefined,
      isMandatory: f.isMandatory !== undefined ? Boolean(f.isMandatory) : false,
      isEditableAuthor: f.isEditableAuthor !== undefined ? Boolean(f.isEditableAuthor) : true,
      isEditableReviewer: f.isEditableReviewer !== undefined ? Boolean(f.isEditableReviewer) : false,
      isVisibleInForm: f.isVisibleInForm !== undefined ? Boolean(f.isVisibleInForm) : true,
      isVisibleInPreview: f.isVisibleInPreview !== undefined ? Boolean(f.isVisibleInPreview) : true,
      isSearchable: f.isSearchable !== undefined ? Boolean(f.isSearchable) : false,
      isSupportingField: f.isSupportingField !== undefined ? Boolean(f.isSupportingField) : false,
      sortOrder: f.sortOrder !== undefined ? Number(f.sortOrder) : 0,
      createdById: req.user.id
    };

    const updateData = {
      smartTemplateSectionId: sectionId,
      fieldLabel: createData.fieldLabel,
      fieldHelpText: createData.fieldHelpText,
      placeholderHint: createData.placeholderHint,
      inputType: createData.inputType,
      optionsJson: createData.optionsJson,
      validationRulesJson: createData.validationRulesJson,
      defaultValueJson: createData.defaultValueJson,
      tableSchemaJson: createData.tableSchemaJson,
      repeaterSchemaJson: createData.repeaterSchemaJson,
      imageConfigJson: createData.imageConfigJson,
      attachmentConfigJson: createData.attachmentConfigJson,
      systemFieldConfigJson: createData.systemFieldConfigJson,
      visibilityRulesJson: createData.visibilityRulesJson,
      isMandatory: createData.isMandatory,
      isEditableAuthor: createData.isEditableAuthor,
      isEditableReviewer: createData.isEditableReviewer,
      isVisibleInForm: createData.isVisibleInForm,
      isVisibleInPreview: createData.isVisibleInPreview,
      isSearchable: createData.isSearchable,
      isSupportingField: createData.isSupportingField,
      sortOrder: createData.sortOrder
    };

    try {
      const result = await prisma.smartFormField.upsert({
        where: {
          smartTemplateVersionId_fieldKey: {
            smartTemplateVersionId: versionId,
            fieldKey: String(f.fieldKey).trim()
          }
        },
        create: createData,
        update: updateData,
        include: {
          fieldMapping: true
        }
      });
      upserted.push(result);
    } catch (e) {
      if (e?.code === 'P2002') {
        const target = (e?.meta?.target || []).join(',');
        return ResponseFormatter.error(
          res,
          `Duplicate constraint failed (${target}) when saving field "${f.fieldKey}" (label="${f.fieldLabel}"). This Field Key already exists on this version — use a unique Field Key.`,
          400
        );
      }
      if (e?.code === 'P2003') {
        return ResponseFormatter.error(
          res,
          `Foreign key constraint failed for field "${f.fieldKey}". Ensure smartTemplateSectionId (${sectionId || 'null'}) refers to a valid Section that belongs to this version.`,
          400
        );
      }
      throw e;
    }
  }

  return ResponseFormatter.success(
    res,
    { fields: upserted },
    'Fields upserted successfully'
  );
});

exports.upsertFieldMappings = asyncHandler(async (req, res) => {
  const versionId = parseIntSafe(req.params.versionId);
  if (!versionId) {
    return ResponseFormatter.notFound(res, 'Smart Template Version');
  }

  const version = await prisma.smartTemplateVersion.findUnique({
    where: { id: versionId },
    select: { id: true, isLocked: true }
  });

  if (!version) {
    return ResponseFormatter.notFound(res, 'Smart Template Version');
  }

  if (version.isLocked) {
    return ResponseFormatter.error(
      res,
      'Cannot modify field mappings of a locked (published) version',
      400
    );
  }

  const { mappings } = req.body;
  if (!Array.isArray(mappings)) {
    return ResponseFormatter.error(res, 'mappings array is required', 400);
  }

  for (const m of mappings) {
    if (!m.placeholderName || !String(m.placeholderName).trim()) {
      return ResponseFormatter.error(
        res,
        'Each mapping must have placeholderName. smartFormFieldId is optional (leave blank if intentionally unmapped — unmapped rows are kept locally in the UI only).',
        400
      );
    }
  }

  const PLACEHOLDER_TYPES_BACKEND = ['SIMPLE_VALUE', 'RICH_TEXT_CONTENT', 'TABLE_ROWS', 'IMAGE', 'REPEATED_SECTION', 'HEADER_FIELD', 'FOOTER_FIELD'];
  for (const m of mappings) {
    if (!m.smartFormFieldId) continue; // unmapped rows may skip validation — they will be defaulted to SIMPLE_VALUE if they are ever later mapped
    if (!m.placeholderType || !PLACEHOLDER_TYPES_BACKEND.includes(String(m.placeholderType))) {
      return ResponseFormatter.error(
        res,
        `Invalid placeholderType "${m.placeholderType}" for placeholder "${m.placeholderName}". Allowed: ${PLACEHOLDER_TYPES_BACKEND.join(', ')}`,
        400
      );
    }
  }

  const upserted = [];
  const skipped = [];
  const deletedRows = [];
  try {
    await prisma.$transaction(async (tx) => {
      for (const m of mappings) {
        if (!m.smartFormFieldId) {
          const existing = await tx.smartFieldMapping.findUnique({
            where: {
              smartTemplateVersionId_placeholderName: {
                smartTemplateVersionId: versionId,
                placeholderName: String(m.placeholderName).trim()
              }
            },
            select: { id: true, placeholderName: true }
          });
          if (existing) {
            try {
              await tx.smartFieldMapping.delete({ where: { id: existing.id } });
              deletedRows.push(existing.placeholderName);
            } catch (e) {
              skipped.push({ placeholderName: m.placeholderName, reason: `DB error clearing previous mapping: ${e.message || 'unknown'}` });
              continue;
            }
          }
          skipped.push({ placeholderName: m.placeholderName, reason: existing ? 'Previously-mapped row now unmapped — cleared from DB (stays in browser state).' : 'No Form Field selected yet. Stays locally in browser state until mapped.' });
          continue;
        }

        const fieldId = parseIntSafe(m.smartFormFieldId);
        if (!fieldId) {
          throw new Error(`400:Invalid smartFormFieldId for placeholder "${m.placeholderName}"`);
        }

        const field = await tx.smartFormField.findUnique({
          where: { id: fieldId },
          select: { id: true, smartTemplateVersionId: true }
        });

        if (!field || field.smartTemplateVersionId !== versionId) {
          throw new Error(`400:smartFormFieldId ${fieldId} does not belong to this version (for placeholder "${m.placeholderName}")`);
        }

        const effectivePlaceholderType = PLACEHOLDER_TYPES_BACKEND.includes(String(m.placeholderType))
          ? String(m.placeholderType)
          : 'SIMPLE_VALUE';

        const data = {
          smartTemplateVersionId: versionId,
          smartFormFieldId: fieldId,
          placeholderName: String(m.placeholderName).trim(),
          placeholderType: effectivePlaceholderType,
          outputFormatJson: m.outputFormatJson || undefined,
          targetSectionName: m.targetSectionName !== undefined
            ? (m.targetSectionName ? String(m.targetSectionName) : null)
            : undefined,
          repeatParentTag: m.repeatParentTag !== undefined
            ? (m.repeatParentTag ? String(m.repeatParentTag) : null)
            : undefined,
          sortOrder: m.sortOrder !== undefined ? Number(m.sortOrder) : 0,
          createdById: req.user.id
        };

        try {
          const result = await tx.smartFieldMapping.upsert({
            where: {
              smartTemplateVersionId_placeholderName: {
                smartTemplateVersionId: versionId,
                placeholderName: String(m.placeholderName).trim()
              }
            },
            create: data,
            update: {
              smartFormFieldId: fieldId,
              placeholderType: data.placeholderType,
              outputFormatJson: data.outputFormatJson,
              targetSectionName: data.targetSectionName,
              repeatParentTag: data.repeatParentTag,
              sortOrder: data.sortOrder
            }
          });
          upserted.push(result);
        } catch (e) {
          if (e?.code === 'P2002') {
            const target = (e?.meta?.target || []).join(',');
            throw new Error(`400:Duplicate constraint failed (${target}) when saving mapping for placeholder "${m.placeholderName}". The smartFormFieldId ${fieldId} is already mapped to another placeholder — field-to-placeholder is a 1:1 relationship.`);
          }
          if (e?.code === 'P2003') {
            throw new Error(`400:Foreign key constraint failed when saving mapping for placeholder "${m.placeholderName}" with fieldId ${fieldId}.`);
          }
          throw e;
        }
      }
    });
  } catch (txErr) {
    const msg = (txErr && txErr.message) ? txErr.message : String(txErr);
    if (msg.startsWith('400:')) {
      return ResponseFormatter.error(res, msg.slice(4), 400);
    }
    throw txErr;
  }

  return ResponseFormatter.success(
    res,
    { mappings: upserted, skipped, deletedRows },
    skipped.length > 0 || deletedRows.length > 0
      ? `Saved: ${upserted.length} mapped · Skipped: ${skipped.length} unmapped (stays in browser) · Cleared DB: ${deletedRows.length} previously-mapped rows now unmapped.`
      : `All ${upserted.length} placeholder ↔ field mappings persisted successfully.`
  );
});

exports.uploadTemplateDocx = asyncHandler(async (req, res) => {
  const versionId = parseIntSafe(req.params.versionId);
  if (!versionId) {
    return ResponseFormatter.notFound(res, 'Smart Template Version');
  }

  const version = await prisma.smartTemplateVersion.findUnique({
    where: { id: versionId },
    select: { id: true, isLocked: true, templateFilePath: true }
  });
  if (!version) {
    return ResponseFormatter.notFound(res, 'Smart Template Version');
  }
  if (version.isLocked) {
    return ResponseFormatter.error(
      res,
      'Cannot upload template file for a locked (published) version',
      400
    );
  }

  if (!req.file) {
    return ResponseFormatter.error(res, 'DOCX template file is required', 400);
  }

  const ext = path.extname(req.file.originalname).toLowerCase();
  if (ext !== '.docx') {
    try { await fs.unlink(req.file.path); } catch (_) {}
    return ResponseFormatter.error(res, 'Only .docx files are allowed', 400);
  }

  let extracted = { placeholders: [] };
  try {
    const buf = await fs.readFile(req.file.path);
    extracted = await placeholderExtractor.extractFromBuffer(buf);
  } catch (err) {
    try { await fs.unlink(req.file.path); } catch (_) {}
    return ResponseFormatter.error(
      res,
      `Failed to scan DOCX template: ${err.message}`,
      400
    );
  }

  if (version.templateFilePath) {
    try {
      const oldAbs = path.isAbsolute(version.templateFilePath)
        ? version.templateFilePath
        : path.join(config.uploadDir, version.templateFilePath);
      if (fsSync.existsSync(oldAbs)) {
        await fs.unlink(oldAbs);
      }
    } catch (_) {}
  }

  const stat = await fs.stat(req.file.path);
  const bufForHash = await fs.readFile(req.file.path);
  const hash = crypto.createHash('sha256').update(bufForHash).digest('hex');

  const relativePath = path.relative(config.uploadDir, req.file.path).replace(/\\/g, '/');

  const updated = await prisma.smartTemplateVersion.update({
    where: { id: versionId },
    data: {
      templateFilePath: relativePath,
      templateFileSize: stat.size,
      templateFileHash: hash,
      placeholdersJson: extracted.placeholders,
      templateUploadedAt: new Date()
    }
  });

  return ResponseFormatter.success(
    res,
    {
      versionId: updated.id,
      templateFilePath: updated.templateFilePath,
      templateFileSize: updated.templateFileSize,
      templateFileHash: updated.templateFileHash,
      placeholders: extracted.placeholders,
      placeholdersCount: extracted.placeholders.length
    },
    'Template uploaded and placeholders scanned successfully'
  );
});

exports.extractTemplatePlaceholders = asyncHandler(async (req, res) => {
  const versionId = parseIntSafe(req.params.versionId);
  if (!versionId) {
    return ResponseFormatter.notFound(res, 'Smart Template Version');
  }

  const version = await prisma.smartTemplateVersion.findUnique({
    where: { id: versionId },
    select: { id: true, templateFilePath: true, placeholdersJson: true }
  });
  if (!version) {
    return ResponseFormatter.notFound(res, 'Smart Template Version');
  }
  if (!version.templateFilePath) {
    return ResponseFormatter.error(res, 'Template file not uploaded for this version', 400);
  }

  if (version.placeholdersJson && Array.isArray(version.placeholdersJson) && version.placeholdersJson.length > 0 && !req.query.force) {
    return ResponseFormatter.success(
      res,
      { placeholders: version.placeholdersJson, source: 'cached' },
      'Placeholders retrieved'
    );
  }

  const absPath = path.isAbsolute(version.templateFilePath)
    ? version.templateFilePath
    : path.join(config.uploadDir, version.templateFilePath);
  const placeholders = await placeholderExtractor.extractFromFilePath(absPath);

  await prisma.smartTemplateVersion.update({
    where: { id: versionId },
    data: { placeholdersJson: placeholders.placeholders }
  });

  return ResponseFormatter.success(
    res,
    { placeholders: placeholders.placeholders, source: 'fresh' },
    'Placeholders scanned'
  );
});

exports.generatePreviewDocx = asyncHandler(async (req, res) => {
  const versionId = parseIntSafe(req.params.versionId);
  if (!versionId) {
    return ResponseFormatter.notFound(res, 'Smart Template Version');
  }

  const version = await prisma.smartTemplateVersion.findUnique({
    where: { id: versionId },
    include: {
      smartTemplate: { include: { styleProfile: true } },
      formFields: true,
      fieldMappings: true
    }
  });
  if (!version) {
    return ResponseFormatter.notFound(res, 'Smart Template Version');
  }
  if (!version.templateFilePath) {
    return ResponseFormatter.error(res, 'Template file not uploaded for this version', 400);
  }

  const absTpl = path.isAbsolute(version.templateFilePath)
    ? version.templateFilePath
    : path.join(config.uploadDir, version.templateFilePath);
  if (!fsSync.existsSync(absTpl)) {
    return ResponseFormatter.error(res, 'Template file missing on disk', 404);
  }
  const tplBuf = await fs.readFile(absTpl);

  const { fieldValues, systemValues } = req.body || {};
  const fieldValuesMap = fieldValues && typeof fieldValues === 'object' ? fieldValues : {};
  const systemValuesMap = systemValues && typeof systemValues === 'object' ? systemValues : {};

  const styleProfile = version.smartTemplate?.styleProfile || (version.formattingSnapshot || null);

  let docxBuf = await smartDocumentGenerator.generateDocx({
    templateBuffer: tplBuf,
    fieldValuesMap,
    formFields: version.formFields,
    fieldMappings: version.fieldMappings,
    styleProfile,
    systemValues: systemValuesMap
  });

  docxBuf = await smartDocumentFormatter.applyStyleProfileToDocxBuffer({
    docxBuffer: docxBuf,
    styleProfile,
    headerValues: systemValuesMap,
    footerValues: systemValuesMap
  });

  const fileName = `preview_template_v${version.id}_${Date.now()}.docx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
  res.setHeader('Content-Length', docxBuf.length);
  return res.send(docxBuf);
});

exports.generatePreviewPdf = asyncHandler(async (req, res) => {
  const versionId = parseIntSafe(req.params.versionId);
  if (!versionId) {
    return ResponseFormatter.notFound(res, 'Smart Template Version');
  }

  const version = await prisma.smartTemplateVersion.findUnique({
    where: { id: versionId },
    include: {
      smartTemplate: { include: { styleProfile: true } },
      formFields: true,
      fieldMappings: true
    }
  });
  if (!version) {
    return ResponseFormatter.notFound(res, 'Smart Template Version');
  }
  if (!version.templateFilePath) {
    return ResponseFormatter.error(res, 'Template file not uploaded for this version', 400);
  }

  const absTpl = path.isAbsolute(version.templateFilePath)
    ? version.templateFilePath
    : path.join(config.uploadDir, version.templateFilePath);
  if (!fsSync.existsSync(absTpl)) {
    return ResponseFormatter.error(res, 'Template file missing on disk', 404);
  }
  const tplBuf = await fs.readFile(absTpl);

  const { fieldValues, systemValues } = req.body || {};
  const fieldValuesMap = fieldValues && typeof fieldValues === 'object' ? fieldValues : {};
  const systemValuesMap = systemValues && typeof systemValues === 'object' ? systemValues : {};

  const styleProfile = version.smartTemplate?.styleProfile || (version.formattingSnapshot || null);

  let docxBuf = await smartDocumentGenerator.generateDocx({
    templateBuffer: tplBuf,
    fieldValuesMap,
    formFields: version.formFields,
    fieldMappings: version.fieldMappings,
    styleProfile,
    systemValues: systemValuesMap
  });

  docxBuf = await smartDocumentFormatter.applyStyleProfileToDocxBuffer({
    docxBuffer: docxBuf,
    styleProfile,
    headerValues: systemValuesMap,
    footerValues: systemValuesMap
  });

  const tplSysValues = {
    ...systemValuesMap,
    referenceCode: (systemValuesMap && systemValuesMap.referenceCode) || (systemValuesMap && systemValuesMap.fileCode) || '',
    version: (systemValuesMap && systemValuesMap.version) || ''
  };

  const { pdfBuffer } = await smartDocumentPdfService.convertDocxBufferToPdf(docxBuf, {
    styleProfile,
    systemValues: tplSysValues,
    headerValues: tplSysValues,
    footerValues: tplSysValues
  });

  const fileName = `preview_template_v${version.id}_${Date.now()}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  return res.send(pdfBuffer);
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
  if (!dv.smartTemplateVersionId || !dv.smartDocumentContent) {
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
      fileSize: result.fileSize,
      pdfUrl: fileStorageService.getPublicUrl ? fileStorageService.getPublicUrl(result.savedPath) : result.savedPath
    },
    'Final PDF generated and saved'
  );
});

exports.downloadFinalPdf = asyncHandler(async (req, res) => {
  const documentVersionId = parseIntSafe(req.params.documentVersionId);
  if (!documentVersionId) {
    return ResponseFormatter.notFound(res, 'Document Version');
  }

  const dv = await prisma.documentVersion.findUnique({
    where: { id: documentVersionId },
    select: { id: true, smartFinalPdfPath: true, smartFinalPdfFileSize: true, document: true }
  });
  if (!dv) {
    return ResponseFormatter.notFound(res, 'Document Version');
  }
  if (!dv.smartFinalPdfPath) {
    return ResponseFormatter.error(res, 'Final PDF has not been generated yet', 400);
  }

  const absPath = path.isAbsolute(dv.smartFinalPdfPath)
    ? dv.smartFinalPdfPath
    : path.join(config.uploadDir, dv.smartFinalPdfPath);
  if (!fsSync.existsSync(absPath)) {
    return ResponseFormatter.notFound(res, 'Final PDF file missing');
  }

  const stat = await fs.stat(absPath);
  const fileName = `${(dv.document?.fileCode || `doc-v${dv.id}`)}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
  res.setHeader('Content-Length', stat.size);
  const stream = fsSync.createReadStream(absPath);
  return stream.pipe(res);
});
