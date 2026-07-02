const asyncHandler = require('../utils/asyncHandler');
const ResponseFormatter = require('../utils/responseFormatter');
const configService = require('../services/configService');
const expiryTrackingService = require('../services/expiryTrackingService');
const { ValidationError } = require('../utils/errors');
const prisma = require('../config/database');
const { updateFileUploadSettingsCache } = require('../middleware/upload');

/**
 * @desc    Get all document types
 * @route   GET /api/config/document-types
 * @access  Private
 */
exports.getDocumentTypes = asyncHandler(async (req, res) => {
  const includeInactive = String(req.query.includeInactive || '').toLowerCase() === 'true';
  const documentTypes = await configService.getDocumentTypes({ includeInactive });
  
  return ResponseFormatter.success(
    res,
    { documentTypes },
    'Document types retrieved successfully'
  );
});

/**
 * @desc    Create new document type
 * @route   POST /api/config/document-types
 * @access  Private (Admin only)
 */
exports.createDocumentType = asyncHandler(async (req, res) => {
  const { name, prefix, description, requiresExpiryTracking, allowRenewal } = req.body;

  // Validation
  if (!name || !prefix) {
    throw new ValidationError('Name and prefix are required');
  }

  const normalizedName = String(name).trim();
  const normalizedPrefix = String(prefix).trim();
  if (!normalizedName || !normalizedPrefix) {
    throw new ValidationError('Name and prefix are required');
  }

  const existing = await prisma.documentType.findFirst({
    where: {
      OR: [
        { name: normalizedName },
        { prefix: normalizedPrefix }
      ]
    },
    select: { id: true, isActive: true }
  })
  if (existing && existing.isActive === false) {
    return ResponseFormatter.error(
      res,
      'A document type with the same name or prefix already exists but is inactive. Enable "Show inactive" and delete it permanently (or restore it) before creating a new one.',
      409
    )
  }

  const documentType = await configService.createDocumentType({
    name: normalizedName,
    prefix: normalizedPrefix,
    description,
    requiresExpiryTracking,
    allowRenewal
  });

  return ResponseFormatter.success(
    res,
    { documentType },
    'Document type created successfully',
    201
  );
});

/**
 * @desc    Update document type
 * @route   PUT /api/config/document-types/:id
 * @access  Private (Admin only)
 */
exports.updateDocumentType = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, prefix, description, isActive, requiresExpiryTracking, allowRenewal } = req.body;

  const documentType = await configService.updateDocumentType(id, {
    name: typeof name === 'string' ? name.trim() : name,
    prefix: typeof prefix === 'string' ? prefix.trim() : prefix,
    description,
    isActive,
    requiresExpiryTracking,
    allowRenewal
  });

  return ResponseFormatter.success(
    res,
    { documentType },
    'Document type updated successfully'
  );
});

/**
 * @desc    Delete document type
 * @route   DELETE /api/config/document-types/:id
 * @access  Private (Admin only)
 */
exports.deleteDocumentType = asyncHandler(async (req, res) => {
  const { id } = req.params;

  await configService.deleteDocumentType(id);

  return ResponseFormatter.success(
    res,
    null,
    'Document type deleted successfully'
  );
});

exports.restoreDocumentType = asyncHandler(async (req, res) => {
  const { id } = req.params
  const documentType = await configService.restoreDocumentType(id)
  return ResponseFormatter.success(res, { documentType }, 'Document type restored successfully')
})

/**
 * @desc    Get all project categories
 * @route   GET /api/config/project-categories
 * @access  Private
 */
exports.getProjectCategories = asyncHandler(async (req, res) => {
  const includeInactive = String(req.query.includeInactive || '').toLowerCase() === 'true';
  const projectCategories = await configService.getProjectCategories({ includeInactive });
  
  return ResponseFormatter.success(
    res,
    { projectCategories },
    'Project categories retrieved successfully'
  );
});

/**
 * @desc    Create new project category
 * @route   POST /api/config/project-categories
 * @access  Private (Admin only)
 */
exports.createProjectCategory = asyncHandler(async (req, res) => {
  const { name, code, description } = req.body;

  // Validation
  if (!name || !code) {
    throw new ValidationError('Name and code are required');
  }

  const normalizedName = String(name).trim();
  const normalizedCode = String(code).trim();
  if (!normalizedName || !normalizedCode) {
    throw new ValidationError('Name and code are required');
  }

  const projectCategory = await configService.createProjectCategory({
    name: normalizedName,
    code: normalizedCode,
    description
  });

  return ResponseFormatter.success(
    res,
    { projectCategory },
    'Project category created successfully',
    201
  );
});

/**
 * @desc    Update project category
 * @route   PUT /api/config/project-categories/:id
 * @access  Private (Admin only)
 */
exports.updateProjectCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, code, description, isActive } = req.body;

  const projectCategory = await configService.updateProjectCategory(id, {
    name,
    code,
    description,
    isActive
  });

  return ResponseFormatter.success(
    res,
    { projectCategory },
    'Project category updated successfully'
  );
});

/**
 * @desc    Delete project category
 * @route   DELETE /api/config/project-categories/:id
 * @access  Private (Admin only)
 */
exports.deleteProjectCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;

  await configService.deleteProjectCategory(id);

  return ResponseFormatter.success(
    res,
    null,
    'Project category deleted successfully'
  )
});

/**
 * @desc    Get all departments
 * @route   GET /api/config/departments
 * @access  Private
 */
exports.getDepartments = asyncHandler(async (req, res) => {
  const includeInactive = String(req.query.includeInactive || '').toLowerCase() === 'true';
  const departments = await configService.getDepartments({ includeInactive });
  
  return ResponseFormatter.success(
    res,
    { departments },
    'Departments retrieved successfully'
  );
});

/**
 * @desc    Create new department
 * @route   POST /api/config/departments
 * @access  Private (Admin only)
 */
exports.createDepartment = asyncHandler(async (req, res) => {
  const { name, code, description } = req.body;

  // Validation
  if (!name || !code) {
    throw new ValidationError('Name and code are required');
  }

  const normalizedName = String(name).trim()
  const normalizedCode = String(code).trim()
  if (!normalizedName || !normalizedCode) {
    throw new ValidationError('Name and code are required');
  }

  const existing = await prisma.department.findFirst({
    where: {
      OR: [
        { name: normalizedName },
        { code: normalizedCode }
      ]
    },
    select: { id: true, isActive: true }
  })
  if (existing && existing.isActive === false) {
    return ResponseFormatter.error(
      res,
      'A department with the same name or code already exists but is inactive. Enable "Show inactive" and delete it permanently (or restore it) before creating a new one.',
      409
    )
  }

  const department = await configService.createDepartment({
    name: normalizedName,
    code: normalizedCode,
    description
  });

  return ResponseFormatter.success(
    res,
    { department },
    'Department created successfully',
    201
  );
});

/**
 * @desc    Update department
 * @route   PUT /api/config/departments/:id
 * @access  Private (Admin only)
 */
exports.updateDepartment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, code, description, isActive } = req.body;

  const department = await configService.updateDepartment(id, {
    name,
    code,
    description,
    isActive
  });

  return ResponseFormatter.success(
    res,
    { department },
    'Department updated successfully'
  );
});

/**
 * @desc    Delete department
 * @route   DELETE /api/config/departments/:id
 * @access  Private (Admin only)
 */
exports.deleteDepartment = asyncHandler(async (req, res) => {
  const { id } = req.params;

  await configService.deleteDepartment(id);

  return ResponseFormatter.success(
    res,
    null,
    'Department deleted successfully'
  )
});

exports.restoreDepartment = asyncHandler(async (req, res) => {
  const { id } = req.params
  const department = await configService.restoreDepartment(id)
  return ResponseFormatter.success(res, { department }, 'Department restored successfully')
})

/**
 * @desc    Get document numbering settings
 * @route   GET /api/config/document-numbering
 * @access  Private
 */
exports.getDocumentNumberingSettings = asyncHandler(async (req, res) => {
  const settings = await configService.getDocumentNumberingSettings();
  
  return ResponseFormatter.success(
    res,
    { settings },
    'Document numbering settings retrieved successfully'
  );
});

/**
 * @desc    Update document numbering settings
 * @route   PUT /api/config/document-numbering
 * @access  Private (Admin only)
 */
exports.updateDocumentNumberingSettings = asyncHandler(async (req, res) => {
  const settings = req.body;

  // Validation
  if (!settings || typeof settings !== 'object') {
    throw new ValidationError('Invalid settings data');
  }

  const updatedSettings = await configService.updateDocumentNumberingSettings(settings);

  return ResponseFormatter.success(
    res,
    { settings: updatedSettings },
    'Document numbering settings updated successfully'
  );
});

/**
 * @desc    Get file upload settings
 * @route   GET /api/config/file-upload
 * @access  Private
 */
exports.getFileUploadSettings = asyncHandler(async (req, res) => {
  const settings = await configService.getFileUploadSettings();
  
  return ResponseFormatter.success(
    res,
    { settings },
    'File upload settings retrieved successfully'
  );
});

/**
 * @desc    Update file upload settings
 * @route   PUT /api/config/file-upload
 * @access  Private (Admin only)
 */
exports.updateFileUploadSettings = asyncHandler(async (req, res) => {
  const settings = req.body;

  // Validation
  if (!settings || typeof settings !== 'object') {
    throw new ValidationError('Invalid settings data');
  }

  const updatedSettings = await configService.updateFileUploadSettings(settings);
  updateFileUploadSettingsCache(updatedSettings);

  return ResponseFormatter.success(
    res,
    { settings: updatedSettings },
    'File upload settings updated successfully'
  );
});

/**
 * @desc    Get version control settings
 * @route   GET /api/config/version-control
 * @access  Private
 */
exports.getVersionControlSettings = asyncHandler(async (req, res) => {
  const settings = await configService.getVersionControlSettings();
  
  return ResponseFormatter.success(
    res,
    { settings },
    'Version control settings retrieved successfully'
  );
});

/**
 * @desc    Update version control settings
 * @route   PUT /api/config/version-control
 * @access  Private (Admin only)
 */
exports.updateVersionControlSettings = asyncHandler(async (req, res) => {
  const settings = req.body;

  // Validation
  if (!settings || typeof settings !== 'object') {
    throw new ValidationError('Invalid settings data');
  }

  const updatedSettings = await configService.updateVersionControlSettings(settings);

  return ResponseFormatter.success(
    res,
    { settings: updatedSettings },
    'Version control settings updated successfully'
  );
});

exports.getRfidEpcRegistrySettings = asyncHandler(async (_req, res) => {
  const settings = await configService.getRfidEpcRegistrySettings()
  return ResponseFormatter.success(res, { settings }, 'RFID EPC registry settings retrieved successfully')
})

exports.updateRfidEpcRegistrySettings = asyncHandler(async (req, res) => {
  const settings = req.body
  if (!settings || typeof settings !== 'object') {
    throw new ValidationError('Invalid settings data')
  }

  const updatedSettings = await configService.updateRfidEpcRegistrySettings(settings)
  return ResponseFormatter.success(res, { settings: updatedSettings }, 'RFID EPC registry settings updated successfully')
})

/**
 * @desc    Get retention policy settings
 * @route   GET /api/config/retention-policy
 * @access  Private
 */
exports.getRetentionPolicySettings = asyncHandler(async (req, res) => {
  const settings = await configService.getRetentionPolicySettings();
  
  return ResponseFormatter.success(
    res,
    { settings },
    'Retention policy settings retrieved successfully'
  );
});

/**
 * @desc    Update retention policy settings
 * @route   PUT /api/config/retention-policy
 * @access  Private (Admin only)
 */
exports.updateRetentionPolicySettings = asyncHandler(async (req, res) => {
  const settings = req.body;

  // Validation
  if (!settings || typeof settings !== 'object') {
    throw new ValidationError('Invalid settings data');
  }

  const updatedSettings = await configService.updateRetentionPolicySettings(settings);

  return ResponseFormatter.success(
    res,
    { settings: updatedSettings },
    'Retention policy settings updated successfully'
  );
});

exports.getExpiryTrackingSettings = asyncHandler(async (_req, res) => {
  const settings = await configService.getExpiryTrackingSettings()

  return ResponseFormatter.success(
    res,
    { settings },
    'Expiry tracking settings retrieved successfully'
  )
})

exports.updateExpiryTrackingSettings = asyncHandler(async (req, res) => {
  const settings = req.body

  if (!settings || typeof settings !== 'object') {
    throw new ValidationError('Invalid settings data')
  }

  const updatedSettings = await configService.updateExpiryTrackingSettings(settings)

  return ResponseFormatter.success(
    res,
    { settings: updatedSettings },
    'Expiry tracking settings updated successfully'
  )
})

exports.applyExpiryTrackingSettingsToExistingProfiles = asyncHandler(async (req, res) => {
  const result = await expiryTrackingService.applyGlobalSettingsToExistingProfiles(req.user?.id)

  return ResponseFormatter.success(
    res,
    result,
    'Expiry tracking settings applied to existing profiles successfully'
  )
})

/**
 * @desc    Get notification settings
 * @route   GET /api/config/notification-settings
 * @access  Private
 */
exports.getNotificationSettings = asyncHandler(async (req, res) => {
  const settings = await configService.getNotificationSettings();
  const safeSettings = {
    ...settings,
    smtpPassword: settings.smtpPassword ? '••••••••' : ''
  }
  
  return ResponseFormatter.success(
    res,
    { settings: safeSettings },
    'Notification settings retrieved successfully'
  );
});

/**
 * @desc    Update notification settings
 * @route   PUT /api/config/notification-settings
 * @access  Private (Admin only)
 */
exports.updateNotificationSettings = asyncHandler(async (req, res) => {
  const settings = req.body;

  // Validation
  if (!settings || typeof settings !== 'object') {
    throw new ValidationError('Invalid settings data');
  }

  const updatedSettings = await configService.updateNotificationSettings(settings);

  return ResponseFormatter.success(
    res,
    { settings: updatedSettings },
    'Notification settings updated successfully'
  );
});

/**
 * @desc    Test email configuration
 * @route   POST /api/config/notification-settings/test-email
 * @access  Private (Admin only)
 */
exports.testEmailSettings = asyncHandler(async (req, res) => {
  const { testEmail } = req.body;

  if (!testEmail) {
    throw new ValidationError('Test email address is required');
  }

  const result = await configService.testEmailConfiguration(testEmail);

  if (result.success) {
    return ResponseFormatter.success(
      res,
      { result },
      result.message
    );
  } else {
    return ResponseFormatter.error(
      res,
      result.message,
      400,
      { error: result.error }
    );
  }
});

/**
 * @desc    Get landing page settings (global)
 * @route   GET /api/system/config/landing-page-settings
 * @access  Private (Admin)
 */
exports.getLandingPageSettings = asyncHandler(async (req, res) => {
  const settings = await configService.getLandingPageSettings();

  return ResponseFormatter.success(
    res,
    { settings },
    'Landing page settings retrieved successfully'
  );
});

/**
 * @desc    Update landing page settings (global)
 * @route   PUT /api/system/config/landing-page-settings
 * @access  Private (Admin)
 */
exports.updateLandingPageSettings = asyncHandler(async (req, res) => {
  const settings = req.body;

  if (!settings || typeof settings !== 'object') {
    throw new ValidationError('Invalid settings data');
  }

  const updatedSettings = await configService.updateLandingPageSettings(settings);

  return ResponseFormatter.success(
    res,
    { settings: updatedSettings },
    'Landing page settings updated successfully'
  );
});

exports.uploadLandingFooterPdf = asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) {
    throw new ValidationError('No file uploaded');
  }

  const url = `/uploads/landing/${file.filename}`;
  return ResponseFormatter.success(
    res,
    { url, fileName: file.originalname, size: file.size },
    'PDF uploaded successfully'
  );
});

exports.getCompanyInfo = asyncHandler(async (req, res) => {
  const companyInfo = await configService.getCompanyInfo();
  return ResponseFormatter.success(res, { companyInfo }, 'Company info retrieved successfully');
});

exports.updateCompanyInfo = asyncHandler(async (req, res) => {
  const companyInfo = req.body;
  if (!companyInfo || typeof companyInfo !== 'object') {
    throw new ValidationError('Invalid company info data');
  }
  const updatedCompanyInfo = await configService.updateCompanyInfo(companyInfo);
  return ResponseFormatter.success(res, { companyInfo: updatedCompanyInfo }, 'Company info updated successfully');
});

exports.getThemeSettings = asyncHandler(async (req, res) => {
  const theme = await configService.getThemeSettings();
  return ResponseFormatter.success(res, { theme }, 'Theme settings retrieved successfully');
});

exports.updateThemeSettings = asyncHandler(async (req, res) => {
  const theme = req.body;
  if (!theme || typeof theme !== 'object') {
    throw new ValidationError('Invalid theme settings data');
  }
  const updatedTheme = await configService.updateThemeSettings(theme);
  return ResponseFormatter.success(res, { theme: updatedTheme }, 'Theme settings updated successfully');
});
