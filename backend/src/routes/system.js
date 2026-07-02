const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const ResponseFormatter = require('../utils/responseFormatter');
const prisma = require('../config/database');
const config = require('../config/app');
const backupController = require('../controllers/backupController');
const configController = require('../controllers/configController');
const cleanupController = require('../controllers/cleanupController');
const securityService = require('../services/securityService');
const { uploadLandingPdf } = require('../middleware/upload');

/**
 * @route   GET /api/system/info
 * @desc    Get system information (version, stats, storage)
 * @access  Private
 */
router.get('/info', authenticate, asyncHandler(async (req, res) => {
  try {
    // Get total users count (all users, not just active)
    const totalUsers = await prisma.user.count();
    
    // Get active users count
    const activeUsers = await prisma.user.count({
      where: { status: 'ACTIVE' }
    });

    // Get total documents count
    const totalDocuments = await prisma.document.count();

    // Get storage information from DocumentVersion table (where file sizes are stored)
    const versions = await prisma.documentVersion.findMany({
      select: { fileSize: true }
    });

    // Calculate total storage used (sum of all file sizes)
    const totalBytes = versions.reduce((sum, version) => {
      const size = parseInt(version.fileSize) || 0;
      return sum + size;
    }, 0);

    // Format storage used
    let storageUsed;
    if (totalBytes < 1024) {
      storageUsed = `${totalBytes} B`;
    } else if (totalBytes < 1024 * 1024) {
      storageUsed = `${(totalBytes / 1024).toFixed(2)} KB`;
    } else if (totalBytes < 1024 * 1024 * 1024) {
      storageUsed = `${(totalBytes / (1024 * 1024)).toFixed(2)} MB`;
    } else {
      storageUsed = `${(totalBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }

    // Get database size estimate (count records in major tables)
    const [auditLogCount, documentCount, versionCount, userCount] = await Promise.all([
      prisma.auditLog.count(),
      prisma.document.count(),
      prisma.documentVersion.count(),
      prisma.user.count()
    ]);
    
    const totalRecords = auditLogCount + documentCount + versionCount + userCount;
    // Rough estimate: ~1KB per record average
    const dbSizeBytes = totalRecords * 1024;
    let databaseSize;
    if (dbSizeBytes < 1024 * 1024) {
      databaseSize = `${(dbSizeBytes / 1024).toFixed(2)} KB`;
    } else if (dbSizeBytes < 1024 * 1024 * 1024) {
      databaseSize = `${(dbSizeBytes / (1024 * 1024)).toFixed(2)} MB`;
    } else {
      databaseSize = `${(dbSizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }

    // Calculate capacity percentage (assuming 100GB max storage)
    const maxStorageGB = config.maxStorageGB || 100;
    const storageUsedGB = totalBytes / (1024 * 1024 * 1024);
    const capacityPercent = Math.round((storageUsedGB / maxStorageGB) * 100);

    const systemInfo = {
      version: config.systemVersion,
      totalUsers: totalUsers,
      activeUsers: activeUsers,
      totalDocuments: totalDocuments,
      totalVersions: versions.length,
      storageUsed: storageUsed,
      databaseSize: databaseSize,
      capacityPercent: capacityPercent > 100 ? 100 : capacityPercent
    };

    return ResponseFormatter.success(
      res,
      { systemInfo },
      'System information retrieved successfully'
    );
  } catch (error) {
    console.error('Error fetching system info:', error);
    
    // Return fallback data if database query fails
    return ResponseFormatter.success(res, {
      systemInfo: {
        version: config.systemVersion,
        totalUsers: 0,
        activeUsers: 0,
        totalDocuments: 0,
        totalVersions: 0,
        storageUsed: '0 KB',
        databaseSize: '0 KB',
        capacityPercent: 0
      }
    }, 'System information retrieved (fallback data)');
  }
}));

/**
 * @route   GET /api/system/health
 * @desc    Get system health status
 * @access  Public
 */
router.get('/health', asyncHandler(async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: 'connected'
  };

  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;
    health.database = 'connected';
  } catch (error) {
    health.database = 'disconnected';
    health.status = 'unhealthy';
  }

  return ResponseFormatter.success(res, { health }, 'Health check completed');
}));

/**
 * Backup & Recovery Routes
 */
// Create a new backup
router.post('/backups', authenticate, backupController.createBackup);

// List all backups
router.get('/backups', authenticate, backupController.listBackups);

// Download a backup
router.get('/backups/:id/download', authenticate, backupController.downloadBackup);

// Restore from a backup
router.post('/backups/:id/restore', authenticate, backupController.restoreBackup);

// Delete a backup
router.delete('/backups/:id', authenticate, backupController.deleteBackup);

/**
 * Master Data Management Routes (Config)
 */
// Document Types
router.get('/config/document-types', authenticate, configController.getDocumentTypes);
router.post('/config/document-types', authenticate, configController.createDocumentType);
router.put('/config/document-types/:id', authenticate, configController.updateDocumentType);
router.patch('/config/document-types/:id/restore', authenticate, configController.restoreDocumentType);
router.delete('/config/document-types/:id', authenticate, configController.deleteDocumentType);

// Project Categories
router.get('/config/project-categories', authenticate, configController.getProjectCategories);
router.post('/config/project-categories', authenticate, configController.createProjectCategory);
router.put('/config/project-categories/:id', authenticate, configController.updateProjectCategory);
router.delete('/config/project-categories/:id', authenticate, configController.deleteProjectCategory);

// Departments
router.get('/config/departments', authenticate, configController.getDepartments);
router.post('/config/departments', authenticate, configController.createDepartment);
router.put('/config/departments/:id', authenticate, configController.updateDepartment);
router.patch('/config/departments/:id/restore', authenticate, configController.restoreDepartment);
router.delete('/config/departments/:id', authenticate, configController.deleteDepartment);

// Document Numbering Settings
router.get('/config/document-numbering', authenticate, configController.getDocumentNumberingSettings);
router.put('/config/document-numbering', authenticate, configController.updateDocumentNumberingSettings);

// File Upload Settings
router.get('/config/file-upload', authenticate, configController.getFileUploadSettings);
router.put('/config/file-upload', authenticate, configController.updateFileUploadSettings);

// Version Control Settings
router.get('/config/version-control', authenticate, configController.getVersionControlSettings);
router.put('/config/version-control', authenticate, configController.updateVersionControlSettings);

// RFID EPC Registry Settings
router.get('/config/rfid-epc-registry', authenticate, configController.getRfidEpcRegistrySettings);
router.put('/config/rfid-epc-registry', authenticate, configController.updateRfidEpcRegistrySettings);

// Retention Policy Settings
router.get('/config/retention-policy', authenticate, configController.getRetentionPolicySettings);
router.put('/config/retention-policy', authenticate, configController.updateRetentionPolicySettings);

// Expiry Tracking Settings
router.get('/config/expiry-tracking', authenticate, configController.getExpiryTrackingSettings);
router.put('/config/expiry-tracking', authenticate, configController.updateExpiryTrackingSettings);
router.post('/config/expiry-tracking/apply-existing', authenticate, configController.applyExpiryTrackingSettingsToExistingProfiles);

// Notification Settings
router.get('/config/notification-settings', authenticate, configController.getNotificationSettings);
router.put('/config/notification-settings', authenticate, configController.updateNotificationSettings);
router.post('/config/notification-settings/test-email', authenticate, configController.testEmailSettings);

// Landing Page Settings (global)
router.get('/config/landing-page-settings', authenticate, configController.getLandingPageSettings);
router.put('/config/landing-page-settings', authenticate, configController.updateLandingPageSettings);
router.post('/config/landing-page/footer-pdf', authenticate, uploadLandingPdf, configController.uploadLandingFooterPdf);

// Branding (global)
router.get('/config/company-info', authenticate, configController.getCompanyInfo);
router.put('/config/company-info', authenticate, configController.updateCompanyInfo);
router.get('/config/theme-settings', authenticate, configController.getThemeSettings);
router.put('/config/theme-settings', authenticate, configController.updateThemeSettings);

// Security Settings
router.get('/config/security-settings', authenticate, asyncHandler(async (req, res) => {
  const settings = await securityService.getSecuritySettings();
  return ResponseFormatter.success(res, { settings }, 'Security settings retrieved successfully');
}));

router.put('/config/security-settings', authenticate, asyncHandler(async (req, res) => {
  const settings = await securityService.saveSecuritySettings(req.body);
  return ResponseFormatter.success(res, { settings }, 'Security settings saved successfully');
}));

// Validate password against current policy (for frontend validation)
router.post('/config/validate-password', authenticate, asyncHandler(async (req, res) => {
  const { password } = req.body;
  const result = await securityService.validatePassword(password || '');
  return ResponseFormatter.success(res, result, 'Password validation completed');
}));

/**
 * Database Cleanup Routes (Admin Only)
 */
// Get cleanup statistics
router.get('/cleanup/stats', authenticate, authorize('admin'), cleanupController.getCleanupStats);

// Verify admin password
router.post('/cleanup/verify-password', authenticate, authorize('admin'), cleanupController.verifyPassword);

// Perform database cleanup (preserves master data)
router.post('/cleanup/database', authenticate, authorize('admin'), cleanupController.cleanupDatabase);

// Perform testing data cleanup (preserves configuration)
router.post('/cleanup/testing-data', authenticate, authorize('admin'), cleanupController.cleanupTestingData);

// Perform full system reset (removes everything)
router.post('/cleanup/full-reset', authenticate, authorize('admin'), cleanupController.fullSystemReset);

module.exports = router;
