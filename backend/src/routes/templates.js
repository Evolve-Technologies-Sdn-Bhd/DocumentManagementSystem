const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const ResponseFormatter = require('../utils/responseFormatter');
const asyncHandler = require('../utils/asyncHandler');
const prisma = require('../config/database');
const { uploadTemplate } = require('../middleware/upload');
const path = require('path');
const documentConversionService = require('../services/documentConversionService');
const notificationService = require('../services/notificationService');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

router.get('/requests', asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { roles: { select: { role: { select: { name: true } } } } }
  })
  const roles = user?.roles?.map((r) => r.role.name) || []
  const canViewAll = roles.includes('admin') || roles.includes('document_controller')

  const where = canViewAll ? {} : { requestedById: req.user.id }
  const requests = await prisma.templateRequest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      documentType: true,
      template: true,
      requestedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      resolvedBy: { select: { id: true, email: true, firstName: true, lastName: true } }
    }
  })

  return ResponseFormatter.success(res, { requests }, 'Template requests retrieved successfully')
}))

router.post('/requests', asyncHandler(async (req, res) => {
  const { requestType, documentTypeId, documentTypeName, templateId, templateName, description } = req.body

  if (!requestType || !['NEW', 'UPDATE'].includes(String(requestType).toUpperCase())) {
    return ResponseFormatter.error(res, 'Invalid request type', 400)
  }

  const type = String(requestType).toUpperCase()
  const docTypeId = documentTypeId ? parseInt(documentTypeId) : null
  const tplId = templateId ? parseInt(templateId) : null
  const docTypeNameText = documentTypeName ? String(documentTypeName).trim() : null
  const tplNameText = templateName ? String(templateName).trim() : null

  if (!docTypeId && !docTypeNameText) {
    return ResponseFormatter.error(res, 'Document type is required', 400)
  }
  if (type === 'NEW' && !tplNameText) {
    return ResponseFormatter.error(res, 'Template name is required', 400)
  }
  if (type === 'UPDATE' && !tplId && !tplNameText) {
    return ResponseFormatter.error(res, 'Select an existing template or provide a template name', 400)
  }

  const created = await prisma.templateRequest.create({
    data: {
      requestType: type,
      status: 'PENDING',
      documentTypeId: docTypeId,
      documentTypeName: docTypeId ? null : docTypeNameText,
      templateId: tplId,
      templateName: tplId ? null : tplNameText,
      description: description ? String(description) : null,
      requestedById: req.user.id
    },
    include: {
      documentType: true,
      template: true
    }
  })

  const requester = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { email: true, firstName: true, lastName: true }
  })
  const requesterName = [requester?.firstName, requester?.lastName].filter(Boolean).join(' ').trim() || requester?.email || 'User'
  const docTypeLabel = created.documentType?.name || created.documentTypeName || 'Unknown Document Type'
  const tplLabel = created.template?.templateName || created.templateName || 'Template'

  const recipients = await prisma.user.findMany({
    where: {
      id: { not: req.user.id },
      roles: {
        some: {
          role: {
            name: { in: ['admin', 'document_controller'] }
          }
        }
      }
    },
    select: { id: true }
  })

  if (recipients.length > 0) {
    await notificationService.sendBulkNotifications(
      recipients.map((u) => u.id),
      'systemAlert',
      'Template Request',
      `${requesterName} requested ${type === 'NEW' ? 'a new template' : 'a template update'} for "${docTypeLabel}" (${tplLabel}).`,
      '/new-document-request',
      {
        subject: 'Template Request',
        title: 'Template Request',
        message: `${requesterName} requested ${type === 'NEW' ? 'a new template' : 'a template update'} for "${docTypeLabel}" (${tplLabel}).`,
        link: notificationService.buildAbsoluteLink('/new-document-request')
      }
    )
  }

  return ResponseFormatter.success(res, { request: created }, 'Template request submitted successfully', 201)
}))

router.patch('/requests/:id', authorize('admin', 'document_controller'), asyncHandler(async (req, res) => {
  const requestId = parseInt(req.params.id)
  const { status, resolutionNote } = req.body
  const normalizedStatus = String(status || '').toUpperCase()
  if (!['RESOLVED', 'REJECTED'].includes(normalizedStatus)) {
    return ResponseFormatter.error(res, 'Invalid status', 400)
  }

  const existing = await prisma.templateRequest.findUnique({
    where: { id: requestId },
    include: {
      documentType: true,
      template: true,
      requestedBy: { select: { id: true } }
    }
  })
  if (!existing) {
    return ResponseFormatter.error(res, 'Template request not found', 404)
  }

  const updated = await prisma.templateRequest.update({
    where: { id: requestId },
    data: {
      status: normalizedStatus,
      resolutionNote: resolutionNote ? String(resolutionNote) : null,
      resolvedById: req.user.id,
      resolvedAt: new Date()
    },
    include: {
      documentType: true,
      template: true,
      requestedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      resolvedBy: { select: { id: true, email: true, firstName: true, lastName: true } }
    }
  })

  await notificationService.sendNotification(
    updated.requestedById,
    'systemAlert',
    'Template Request Update',
    `Your template request has been ${normalizedStatus === 'RESOLVED' ? 'resolved' : 'rejected'}.`,
    '/new-document-request',
    {
      subject: 'Template Request Update',
      title: 'Template Request Update',
      message: `Your template request has been ${normalizedStatus === 'RESOLVED' ? 'resolved' : 'rejected'}.`,
      link: notificationService.buildAbsoluteLink('/new-document-request')
    }
  )

  return ResponseFormatter.success(res, { request: updated }, 'Template request updated successfully')
}))

/**
 * Get all templates
 * GET /api/templates
 */
router.get('/', asyncHandler(async (req, res) => {
  const templates = await prisma.template.findMany({
    include: {
      documentType: true
    },
    orderBy: { createdAt: 'desc' }
  });

  // Format response to match frontend expectations
  const formattedTemplates = templates.map(template => ({
    id: template.id,
    documentType: template.documentType.name,
    templateName: template.templateName,
    version: template.version,
    prefixCode: template.documentType.prefix,
    uploadedBy: template.uploadedBy,
    uploadedOn: new Date(template.uploadedOn).toLocaleDateString('en-GB'),
    filePath: template.filePath,
    fileName: template.fileName
  }));

  return ResponseFormatter.success(
    res,
    { templates: formattedTemplates },
    'Templates retrieved successfully'
  );
}));

/**
 * Create new template (admin only)
 * POST /api/templates
 */
router.post('/', authorize('admin'), uploadTemplate.single('files'), asyncHandler(async (req, res) => {
  console.log('Template upload request body:', req.body);
  console.log('Template upload file:', req.file);
  
  const { documentTypeId, templateName, version, uploadedBy } = req.body;

  // Validate required fields
  if (!documentTypeId || !templateName || !version) {
    return ResponseFormatter.error(
      res,
      'Missing required fields: documentTypeId, templateName, or version',
      400
    );
  }

  if (!req.file) {
    return ResponseFormatter.error(
      res,
      'No file uploaded',
      400
    );
  }

  try {
    // Check if document type exists
    const docType = await prisma.documentType.findUnique({
      where: { id: parseInt(documentTypeId) }
    });

    if (!docType) {
      return ResponseFormatter.error(
        res,
        `Document type with ID ${documentTypeId} not found`,
        404
      );
    }

    const template = await prisma.template.create({
      data: {
        documentTypeId: parseInt(documentTypeId),
        templateName,
        version,
        filePath: req.file.path,
        fileName: req.file.originalname,
        uploadedBy: uploadedBy || req.user.email
      },
      include: {
        documentType: true
      }
    });

    console.log('Template created successfully:', template);

    return ResponseFormatter.success(
      res,
      { template },
      'Template created successfully',
      201
    );
  } catch (error) {
    console.error('Error creating template:', error);
    throw error;
  }
}));

/**
 * Download template by document type (for acknowledged document requests)
 * GET /api/templates/by-document-type/:documentTypeId/download
 * IMPORTANT: This must come BEFORE /:id routes to avoid route collision
 */
router.get('/by-document-type/:documentTypeId', asyncHandler(async (req, res) => {
  const documentTypeId = parseInt(req.params.documentTypeId)

  const templates = await prisma.template.findMany({
    where: {
      documentTypeId,
      isActive: true
    },
    orderBy: {
      createdAt: 'desc'
    },
    select: {
      id: true,
      templateName: true,
      version: true,
      fileName: true,
      uploadedBy: true,
      uploadedOn: true,
      createdAt: true
    }
  })

  return ResponseFormatter.success(res, { templates }, 'Templates retrieved successfully')
}))

router.get('/by-document-type/:documentTypeId/download', async (req, res) => {
  try {
    const documentTypeId = parseInt(req.params.documentTypeId);

    // Find the most recent active template for this document type
    const template = await prisma.template.findFirst({
      where: {
        documentTypeId: documentTypeId,
        isActive: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        documentType: true
      }
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'No template found for this document type'
      });
    }

    // Check if file exists
    const fs = require('fs');
    const filePath = template.filePath;
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'Template file not found on server'
      });
    }

    // Get file stats for content-length
    const stat = fs.statSync(filePath);
    
    // Log for debugging
    console.log('Downloading template:');
    console.log('  Document Type ID:', documentTypeId);
    console.log('  Template ID:', template.id);
    console.log('  File Name:', template.fileName);
    console.log('  File Path:', filePath);
    console.log('  Content-Disposition:', `attachment; filename="${template.fileName}"`);
    
    // Set headers for file download
    res.setHeader('Content-Disposition', `attachment; filename="${template.fileName}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);

    // Create read stream and pipe to response
    const fileStream = fs.createReadStream(filePath);
    
    fileStream.on('error', (error) => {
      console.error('Error streaming file:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: 'Error streaming file'
        });
      }
    });

    fileStream.pipe(res);
  } catch (error) {
    console.error('Error downloading template:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Failed to download template'
      });
    }
  }
});

/**
 * Update template (admin only)
 * PUT /api/templates/:id
 */
router.put('/:id', authorize('admin'), uploadTemplate.single('files'), asyncHandler(async (req, res) => {
  console.log('Template update request body:', req.body);
  console.log('Template update file:', req.file);
  console.log('Template ID:', req.params.id);
  
  const templateId = parseInt(req.params.id);
  const { documentTypeId, templateName, version, uploadedBy } = req.body;

  // Validate required fields
  if (!templateName || !version) {
    return ResponseFormatter.error(
      res,
      'Missing required fields: templateName or version',
      400
    );
  }

  try {
    // Check if template exists
    const existingTemplate = await prisma.template.findUnique({
      where: { id: templateId }
    });

    if (!existingTemplate) {
      return ResponseFormatter.error(
        res,
        `Template with ID ${templateId} not found`,
        404
      );
    }

    const updateData = {};
    if (templateName) updateData.templateName = templateName;
    if (version) updateData.version = version;
    if (documentTypeId) updateData.documentTypeId = parseInt(documentTypeId);
    if (uploadedBy) updateData.uploadedBy = uploadedBy;
    
    // If new file is uploaded, update file path and name
    if (req.file) {
      updateData.filePath = req.file.path;
      updateData.fileName = req.file.originalname;
    }

    const template = await prisma.template.update({
      where: { id: templateId },
      data: updateData,
      include: {
        documentType: true
      }
    });

    console.log('Template updated successfully:', template);

    return ResponseFormatter.success(
      res,
      { template },
      'Template updated successfully'
    );
  } catch (error) {
    console.error('Error updating template:', error);
    throw error;
  }
}));

/**
 * Preview template file
 * GET /api/templates/:id/preview
 */
router.get('/:id/preview', asyncHandler(async (req, res) => {
  const templateId = parseInt(req.params.id);

  const template = await prisma.template.findUnique({
    where: { id: templateId },
    include: {
      documentType: true
    }
  });

  if (!template) {
    return ResponseFormatter.notFound(res, 'Template');
  }

  // Check if file exists
  const fs = require('fs');
  if (!fs.existsSync(template.filePath)) {
    return ResponseFormatter.error(
      res,
      'Template file not found on server',
      404
    );
  }

  // Get file extension to set proper content type
  const ext = path.extname(template.fileName).toLowerCase();
  const mimeTypes = {
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.dotx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
    '.doc': 'application/msword',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.csv': 'text/csv',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.ppt': 'application/vnd.ms-powerpoint'
  };

  // Set headers for inline viewing
  res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${template.fileName}"`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

  // Stream the file
  const fileStream = fs.createReadStream(template.filePath);
  fileStream.pipe(res);
}));

/**
 * Download template file
 * GET /api/templates/:id/download
 */
router.get('/:id/download', async (req, res) => {
  try {
    const templateId = parseInt(req.params.id);

    const template = await prisma.template.findUnique({
      where: { id: templateId },
      include: {
        documentType: true
      }
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    // Check if file exists
    const fs = require('fs');
    const filePath = template.filePath;
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'Template file not found on server'
      });
    }

    // Get file stats for content-length
    const stat = fs.statSync(filePath);
    
    // Set headers for file download
    res.setHeader('Content-Disposition', `attachment; filename="${template.fileName}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);

    // Create read stream and pipe to response
    const fileStream = fs.createReadStream(filePath);
    
    fileStream.on('error', (error) => {
      console.error('Error streaming file:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: 'Error streaming file'
        });
      }
    });

    fileStream.pipe(res);
  } catch (error) {
    console.error('Error downloading template:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Failed to download template'
      });
    }
  }
});

/**
 * Delete template (admin only)
 * DELETE /api/templates/:id
 */
router.delete('/:id', authorize('admin'), asyncHandler(async (req, res) => {
  const templateId = parseInt(req.params.id);

  const template = await prisma.template.findUnique({
    where: { id: templateId },
    select: { id: true, filePath: true }
  })

  if (!template) {
    return ResponseFormatter.error(res, 'Template not found', 404)
  }

  await prisma.template.delete({
    where: { id: templateId }
  })

  if (template.filePath) {
    try {
      const fs = require('fs')
      if (fs.existsSync(template.filePath)) {
        await fs.promises.unlink(template.filePath)
      }
    } catch (error) {
    }
  }

  return ResponseFormatter.success(
    res,
    null,
    'Template deleted successfully'
  );
}));

module.exports = router;
