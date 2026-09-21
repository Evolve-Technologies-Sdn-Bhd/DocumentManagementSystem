const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');
const config = require('../config/app');

class CleanupService {
  /**
   * Verify admin password before allowing cleanup
   */
  async verifyAdminPassword(userId, password) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        password: true,
        roles: {
          include: {
            role: true
          }
        }
      }
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Only admin can perform cleanup
    const hasAdminRole = user.roles.some(ur => ur.role.name === 'admin');
    
    if (!hasAdminRole) {
      throw new Error('Only administrators can perform database cleanup');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new Error('Invalid password');
    }

    return true;
  }

  /**
   * Get cleanup statistics before cleanup
   */
  async getCleanupStats() {
    const [
      totalUsers,
      totalDocuments,
      totalFolders,
      totalTemplates,
      totalWorkflows,
      totalAuditLogs,
      totalNotifications,
      totalComments,
      totalReports
    ] = await Promise.all([
      prisma.user.count(),
      prisma.document.count(),
      prisma.folder.count(),
      prisma.template.count(),
      prisma.workflow.count(),
      prisma.auditLog.count(),
      prisma.notification.count(),
      prisma.documentComment.count(),
      prisma.generatedReport.count()
    ]);

    return {
      users: totalUsers,
      documents: totalDocuments,
      folders: totalFolders,
      templates: totalTemplates,
      workflows: totalWorkflows,
      auditLogs: totalAuditLogs,
      notifications: totalNotifications,
      comments: totalComments,
      reports: totalReports,
      totalRecords: totalUsers + totalDocuments + totalFolders + totalTemplates + 
                    totalWorkflows + totalAuditLogs + totalNotifications + 
                    totalComments + totalReports
    };
  }

  /**
   * Clean all database tables except system configuration
   * Preserves: DocumentTypes, ProjectCategories, SystemConfiguration
   * Keeps: One admin user (the one performing cleanup)
   */
  async cleanupDatabase(adminUserId) {
    const results = {
      success: false,
      cleaned: {},
      errors: [],
      timestamp: new Date().toISOString()
    };

    try {
      // Start transaction
      await prisma.$transaction(async (tx) => {
        // 1. Delete WorkflowSteps (depends on Workflow)
        const workflowSteps = await tx.workflowStep.deleteMany({});
        results.cleaned.workflowSteps = workflowSteps.count;

        // 2. Delete Workflows
        const workflows = await tx.workflow.deleteMany({});
        results.cleaned.workflows = workflows.count;

        // 3. Delete Comments
        const comments = await tx.documentComment.deleteMany({});
        results.cleaned.comments = comments.count;

        // 4. Delete Notifications
        const notifications = await tx.notification.deleteMany({});
        results.cleaned.notifications = notifications.count;

        // 5. Delete AuditLogs
        const auditLogs = await tx.auditLog.deleteMany({});
        results.cleaned.auditLogs = auditLogs.count;

        // 6. Delete Generated Reports
        const reports = await tx.generatedReport.deleteMany({});
        results.cleaned.reports = reports.count;

        // 7. Delete DocumentVersions
        const versions = await tx.documentVersion.deleteMany({});
        results.cleaned.documentVersions = versions.count;

        // 8. Delete Documents
        const documents = await tx.document.deleteMany({});
        results.cleaned.documents = documents.count;
        
        // 8a. Delete Master Record Registers
        results.cleaned.documentRegister = (await tx.documentRegister.deleteMany({})).count;
        results.cleaned.versionRegister = (await tx.versionRegister.deleteMany({})).count;
        results.cleaned.obsoleteRegister = (await tx.obsoleteRegister.deleteMany({})).count;
        results.cleaned.archiveRegister = (await tx.archiveRegister.deleteMany({})).count;

        // 9. Delete Templates
        const templates = await tx.template.deleteMany({});
        results.cleaned.templates = templates.count;

        // 10. Delete Folders (except root folders)
        const folders = await tx.folder.deleteMany({
          where: {
            parentId: { not: null } // Keep root folders
          }
        });
        results.cleaned.folders = folders.count;

        // 11. Delete all users except the admin performing cleanup
        const users = await tx.user.deleteMany({
          where: {
            id: { not: adminUserId }
          }
        });
        results.cleaned.users = users.count;

        // 12. Clear user sessions/tokens (if you have a session table)
        // Add here if needed

        results.success = true;
        results.message = 'Database cleanup completed successfully';
      });

      // Log the cleanup action
      await this.logCleanupAction(adminUserId, results);

      return results;

    } catch (error) {
      results.errors.push(error.message);
      throw new Error(`Database cleanup failed: ${error.message}`);
    }
  }

  /**
   * Clean testing data while preserving configuration.
   * Preserves: master data + configuration (DocumentTypes, ProjectCategories, Departments, Templates, Workflows, Folders, Roles/Permissions, SystemConfiguration)
   * Deletes: documents + activity + logs/reports/master registers, and all users except the admin performing cleanup.
   */
  async cleanupTestingData(adminUserId) {
    const results = {
      success: false,
      cleaned: {},
      errors: [],
      timestamp: new Date().toISOString()
    }

    try {
      await prisma.$transaction(async (tx) => {
        results.cleaned.generatedReports = (await tx.generatedReport.deleteMany({})).count
        results.cleaned.notifications = (await tx.notification.deleteMany({})).count
        results.cleaned.auditLogs = (await tx.auditLog.deleteMany({})).count

        results.cleaned.documentRegister = (await tx.documentRegister.deleteMany({})).count
        results.cleaned.versionRegister = (await tx.versionRegister.deleteMany({})).count
        results.cleaned.obsoleteRegister = (await tx.obsoleteRegister.deleteMany({})).count
        results.cleaned.archiveRegister = (await tx.archiveRegister.deleteMany({})).count

        results.cleaned.documentVersions = (await tx.documentVersion.deleteMany({})).count
        results.cleaned.documents = (await tx.document.deleteMany({})).count

        results.cleaned.users = (await tx.user.deleteMany({
          where: { id: { not: adminUserId } }
        })).count

        results.success = true
        results.message = 'Testing data cleanup completed successfully'
      })

      return results
    } catch (error) {
      results.errors.push(error.message)
      throw new Error(`Testing data cleanup failed: ${error.message}`)
    }
  }

  /**
   * Log cleanup action for audit trail
   */
  async logCleanupAction(userId, results) {
    try {
      await prisma.auditLog.create({
        data: {
          userId,
          entity: 'SYSTEM',
          entityId: 0,
          action: 'DATABASE_CLEANUP',
          description: 'Database cleanup performed',
          metadata: {
            cleaned: results.cleaned,
            timestamp: results.timestamp,
            totalRecordsCleaned: Object.values(results.cleaned).reduce((sum, count) => sum + count, 0)
          }
        }
      });
    } catch (error) {
      console.error('Failed to log cleanup action:', error);
    }
  }

  /**
   * Perform full system reset (including master data)
   * WARNING: This removes EVERYTHING except the admin user
   */
  async fullSystemReset(adminUserId) {
    const results = {
      success: false,
      cleaned: {},
      errors: [],
      timestamp: new Date().toISOString()
    };

    try {
      await prisma.$transaction(async (tx) => {
        // Delete all data (in correct order due to foreign keys)
        results.cleaned.workflowSteps = (await tx.workflowStep.deleteMany({})).count;
        results.cleaned.workflows = (await tx.workflow.deleteMany({})).count;
        results.cleaned.comments = (await tx.documentComment.deleteMany({})).count;
        results.cleaned.notifications = (await tx.notification.deleteMany({})).count;
        results.cleaned.auditLogs = (await tx.auditLog.deleteMany({})).count;
        results.cleaned.reports = (await tx.generatedReport.deleteMany({})).count;
        results.cleaned.documentVersions = (await tx.documentVersion.deleteMany({})).count;
        results.cleaned.documents = (await tx.document.deleteMany({})).count;
        results.cleaned.templates = (await tx.template.deleteMany({})).count;
        
        // Delete Master Record Registers
        results.cleaned.documentRegister = (await tx.documentRegister.deleteMany({})).count;
        results.cleaned.versionRegister = (await tx.versionRegister.deleteMany({})).count;
        results.cleaned.obsoleteRegister = (await tx.obsoleteRegister.deleteMany({})).count;
        results.cleaned.archiveRegister = (await tx.archiveRegister.deleteMany({})).count;
        
        // Delete folders: must delete child folders first due to self-referential FK
        // Delete in multiple passes until no folders remain
        let totalFoldersDeleted = 0;
        let foldersDeleted = 0;
        do {
          // Delete folders that have no children (leaf nodes)
          const folderResult = await tx.folder.deleteMany({
            where: {
              children: {
                none: {}
              }
            }
          });
          foldersDeleted = folderResult.count;
          totalFoldersDeleted += foldersDeleted;
        } while (foldersDeleted > 0);
        results.cleaned.folders = totalFoldersDeleted;
        
        results.cleaned.projectCategories = (await tx.projectCategory.deleteMany({})).count;
        results.cleaned.documentTypes = (await tx.documentType.deleteMany({})).count;
        results.cleaned.users = (await tx.user.deleteMany({
          where: { id: { not: adminUserId } }
        })).count;

        results.success = true;
        results.message = 'Full system reset completed successfully';
      });

      // Log the reset action
      await this.logCleanupAction(adminUserId, {
        ...results,
        action: 'FULL_SYSTEM_RESET'
      });

      return results;

    } catch (error) {
      results.errors.push(error.message);
      throw new Error(`Full system reset failed: ${error.message}`);
    }
  }

  /**
   * Delete uploaded files from filesystem
   * WARNING: This will delete all uploaded files
   */
  async cleanupUploadedFiles() {
    const fs = require('fs').promises;
    const path = require('path');
    
    const uploadsDir = config.uploadDir;
    const results = {
      deletedFiles: 0,
      deletedFolders: 0,
      errors: []
    };

    try {
      // Check if uploads directory exists
      try {
        await fs.access(uploadsDir);
      } catch {
        return results; // Directory doesn't exist, nothing to clean
      }

      // Get all subdirectories in uploads
      const subdirs = ['documents', 'profiles', 'templates'];

      for (const subdir of subdirs) {
        const subdirPath = path.join(uploadsDir, subdir);
        try {
          await fs.access(subdirPath);
          const files = await fs.readdir(subdirPath);
          
          for (const file of files) {
            try {
              await fs.unlink(path.join(subdirPath, file));
              results.deletedFiles++;
            } catch (error) {
              results.errors.push(`Failed to delete ${subdir}/${file}: ${error.message}`);
            }
          }
        } catch {
          // Subdirectory doesn't exist, skip
        }
      }

      return results;
    } catch (error) {
      throw new Error(`Failed to cleanup uploaded files: ${error.message}`);
    }
  }

  async cleanupTestingUploadedFiles(adminUserId) {
    const fs = require('fs').promises
    const path = require('path')

    const uploadsDir = config.uploadDir
    const results = {
      deletedFiles: 0,
      deletedFolders: 0,
      errors: []
    }

    const rmRecursive = async (targetPath) => {
      try {
        const stat = await fs.lstat(targetPath)
        if (stat.isDirectory()) {
          const entries = await fs.readdir(targetPath)
          for (const entry of entries) {
            await rmRecursive(path.join(targetPath, entry))
          }
          await fs.rmdir(targetPath)
          results.deletedFolders++
        } else {
          await fs.unlink(targetPath)
          results.deletedFiles++
        }
      } catch (error) {
        results.errors.push(`Failed to delete ${targetPath}: ${error.message}`)
      }
    }

    const clearDir = async (dirPath) => {
      try {
        await fs.access(dirPath)
      } catch {
        return
      }

      try {
        const entries = await fs.readdir(dirPath)
        for (const entry of entries) {
          await rmRecursive(path.join(dirPath, entry))
        }
      } catch (error) {
        results.errors.push(`Failed to clear ${dirPath}: ${error.message}`)
      }
    }

    await clearDir(path.join(uploadsDir, 'documents'))
    await clearDir(path.join(uploadsDir, 'temp'))

    const profilesDir = path.join(uploadsDir, 'profiles')
    try {
      await fs.access(profilesDir)
      const profileEntries = await fs.readdir(profilesDir)
      for (const entry of profileEntries) {
        if (String(entry) === String(adminUserId)) continue
        await rmRecursive(path.join(profilesDir, entry))
      }
    } catch {
    }

    return results
  }
}

module.exports = new CleanupService();
