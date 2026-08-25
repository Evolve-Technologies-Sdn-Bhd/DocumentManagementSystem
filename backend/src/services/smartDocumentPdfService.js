const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const config = require('../config/app');
const prisma = require('../config/database');
const docxToPdfService = require('./docxToPdfService');
const smartDocumentGenerator = require('./smartDocumentGenerator');
const smartDocumentFormatter = require('./smartDocumentFormatter');
const fileStorageService = require('./fileStorageService');
const { BadRequestError, NotFoundError } = require('../utils/errors');

function generateUuid() {
  if (crypto && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function resolveTemplateFilePath(rawPath) {
  if (!rawPath) return null;
  const stripped = String(rawPath)
    .replace(/^\/uploads\//, '')
    .replace(/^uploads[\\/]/, '');
  const candidates = [
    rawPath,
    path.isAbsolute(rawPath) ? null : path.resolve(process.cwd(), rawPath),
    path.isAbsolute(rawPath) ? null : path.resolve(process.cwd(), 'src', rawPath),
    path.isAbsolute(rawPath) ? null : path.resolve(process.cwd(), 'backend', rawPath),
    path.isAbsolute(rawPath) ? null : path.resolve(process.cwd(), '..', 'backend', rawPath),
    path.resolve(config.uploadDir || path.join(process.cwd(), 'uploads'), stripped),
    path.resolve(config.uploadDir || path.join(process.cwd(), 'uploads'), rawPath)
  ].filter(Boolean);
  const fsSync = require('fs');
  for (const candidate of candidates) {
    try {
      if (candidate && fsSync.existsSync(candidate)) return candidate;
    } catch { /* ignore */ }
  }
  return null;
}

class SmartDocumentPdfService {

  async convertDocxBufferToPdf(docxBuffer, opts) {
    try {
      if (!Buffer.isBuffer(docxBuffer)) {
        throw new BadRequestError('docxBuffer must be a Buffer');
      }
      const result = await docxToPdfService.convertDocxBufferToPdf(docxBuffer, opts || {});
      return {
        pdfBuffer: result.pdfBuffer,
        byteLength: result.byteLength
      };
    } catch (error) {
      if (error instanceof BadRequestError || error instanceof NotFoundError) throw error;
      throw new BadRequestError('PDF conversion failed: ' + error.message);
    }
  }

  async generateFinalPdfForDocumentVersion({ documentVersionId }) {
    if (!documentVersionId) {
      throw new BadRequestError('Missing documentVersionId');
    }

    const tx = await prisma.$transaction(async (txPrisma) => {
      const version = await txPrisma.documentVersion.findUnique({
        where: { id: Number(documentVersionId) },
        include: {
          document: {
            include: { smartDocumentStyleProfile: true }
          },
          smartTemplateVersion: {
            include: {
              smartTemplate: { include: { styleProfile: true } },
              formFields: true,
              fieldMappings: true
            }
          }
        }
      });

      if (!version) {
        throw new NotFoundError('DocumentVersion');
      }

      if (!version.smartTemplateVersion) {
        throw new BadRequestError('DocumentVersion has no linked SmartTemplateVersion');
      }

      const resolvedStyleProfile =
        (version.document &&
          version.document.smartDocumentStyleProfile &&
          version.document.smartDocumentStyleProfile.isActive !== false &&
          version.document.smartDocumentStyleProfile) ||
        (version.smartTemplateVersion.smartTemplate &&
          version.smartTemplateVersion.smartTemplate.styleProfile) ||
        version.smartTemplateVersion.formattingSnapshot ||
        {};
      const styleProfile = resolvedStyleProfile;

      const content = await txPrisma.smartDocumentContent.findUnique({
        where: { documentVersionId: Number(documentVersionId) }
      });

      if (!content) {
        throw new NotFoundError('SmartDocumentContent for this DocumentVersion');
      }

      const fieldValuesMap = content.fieldValuesJson && typeof content.fieldValuesJson === 'object'
        ? content.fieldValuesJson
        : {};

      const autoSnapshot = content.autoFieldSnapshotJson && typeof content.autoFieldSnapshotJson === 'object'
        ? content.autoFieldSnapshotJson
        : {};

      const systemValues = {
        referenceCode: autoSnapshot.referenceCode || (version.document && version.document.fileCode) || '',
        version: version.version || '',
        documentTypeName: autoSnapshot.documentTypeName || '',
        preparedByFullName: autoSnapshot.preparedByFullName || '',
        reviewedByFullName: autoSnapshot.reviewedByFullName || '',
        approvedByFullName: autoSnapshot.approvedByFullName || '',
        preparedDate: autoSnapshot.preparedDate || version.uploadedAt || new Date(),
        publishedDate: autoSnapshot.publishedDate || (version.isPublished ? (version.uploadedAt || new Date()) : undefined)
      };

      let templateBuffer;
      if (version.smartTemplateVersion.templateFilePath) {
        const resolved = resolveTemplateFilePath(version.smartTemplateVersion.templateFilePath);
        if (!resolved) {
          throw new NotFoundError(
            'Template DOCX file is missing on server. Re-upload the Smart Template to restore the .docx template file. Raw path: ' +
            String(version.smartTemplateVersion.templateFilePath)
          );
        }
        try {
          templateBuffer = await fs.readFile(resolved);
        } catch (e) {
          throw new BadRequestError('Failed to read template DOCX file: ' + e.message);
        }
      } else {
        throw new BadRequestError('SmartTemplateVersion has no template file path');
      }

      let generatedDocxBuffer;
      try {
        generatedDocxBuffer = await smartDocumentGenerator.generateDocx({
          templateBuffer,
          fieldValuesMap,
          formFields: version.smartTemplateVersion.formFields || [],
          fieldMappings: version.smartTemplateVersion.fieldMappings || [],
          styleProfile: styleProfile,
          systemValues
        });
      } catch (e) {
        throw new BadRequestError('DOCX generation step failed: ' + e.message);
      }

      let styledDocxBuffer;
      try {
        styledDocxBuffer = await smartDocumentFormatter.applyStyleProfileToDocxBuffer({
          docxBuffer: generatedDocxBuffer,
          styleProfile: styleProfile,
          headerValues: {},
          footerValues: {}
        });
      } catch (e) {
        styledDocxBuffer = generatedDocxBuffer;
      }

      const finalSystemValues = {
        ...systemValues,
        referenceCode: systemValues.referenceCode || (version.document && version.document.fileCode) || '',
        version: systemValues.version || version.version || '',
        revision: systemValues.version || version.version || '',
        docCode: systemValues.referenceCode || (version.document && version.document.fileCode) || '',
        fileCode: (version.document && version.document.fileCode) || systemValues.referenceCode || '',
        preparedByName: systemValues.preparedByFullName || systemValues.preparedByName || '',
        approvedByName: systemValues.approvedByFullName || systemValues.approvedByName || '',
        reviewedByName: systemValues.reviewedByFullName || systemValues.reviewedByName || ''
      };

      let conversionResult;
      try {
        conversionResult = await this.convertDocxBufferToPdf(styledDocxBuffer, {
          workDirSuffix: 'smart-doc-final',
          styleProfile,
          systemValues: finalSystemValues,
          headerValues: finalSystemValues,
          footerValues: finalSystemValues
        });
      } catch (e) {
        throw new BadRequestError('PDF conversion step failed: ' + e.message);
      }

      const { pdfBuffer } = conversionResult;
      const fileSize = pdfBuffer.length;

      const finalDir = path.join(config.uploadDir, 'smart-documents', 'final');
      await fs.mkdir(finalDir, { recursive: true });

      const outUuid = generateUuid();
      const savedFileName = `${version.id}_${outUuid}.pdf`;
      const savedPath = path.join(finalDir, savedFileName);

      await fs.writeFile(savedPath, pdfBuffer);

      const updatedVersion = await txPrisma.documentVersion.update({
        where: { id: Number(documentVersionId) },
        data: {
          smartFinalPdfPath: savedPath,
          smartFinalPdfFileSize: fileSize,
          smartFinalPdfGeneratedAt: new Date()
        }
      });

      return {
        pdfBuffer,
        savedPath,
        fileSize,
        documentVersion: updatedVersion
      };
    }, {
      timeout: 300000
    });

    return {
      pdfBuffer: tx.pdfBuffer,
      savedPath: tx.savedPath,
      fileSize: tx.fileSize
    };
  }

  async _safeFileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async _safeDelete(filePath) {
    try {
      if (!filePath) return;
      await fs.unlink(filePath);
    } catch {
      // swallow
    }
  }
}

module.exports = new SmartDocumentPdfService();
