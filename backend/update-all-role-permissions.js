const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// All role permissions - must match EditSystemRolePermissionsModal.jsx
const rolePermissions = {
  // Administrator
  admin: {
    dashboard: { view: true },
    'documents.draft': { view: true, create: true, update: true },
    'documents.review': { view: true, read: true, review: true, approve: true, reject: true },
    'documents.published': { view: true, read: true, create: true, publish: true, update: true, delete: true, download: true },
    'documents.superseded': { view: true, read: true, create: true, update: true, download: true },
    newDocumentRequest: { view: true, create: true, acknowledge: true },
    myDocumentsStatus: { view: true },
    'configuration.users': { view: true, create: true, edit: true, delete: true, activate: true, deactivate: true },
    'configuration.roles': { view: true, create: true, edit: true, delete: true, assign: true },
    'configuration.templates': { view: true, read: true, create: true, update: true, delete: true, download: true },
    'configuration.templateRequests': { view: true, read: true, create: true, update: true },
    'configuration.documentTypes': { view: true, create: true, edit: true, delete: true },
    'configuration.masterData': { view: true, create: true, edit: true, delete: true },
    'configuration.settings': { view: true, edit: true },
    'configuration.backup': { view: true, backup: true, restore: true, download: true },
    'configuration.cleanup': { view: true, analyze: true, cleanup: true },
    'configuration.auditSettings': { view: true, edit: true },
    'logsReport.activityLogs': { view: true, filter: true, export: true },
    'logsReport.userActivity': { view: true, filter: true, export: true },
    'logsReport.reports': { view: true, generate: true, export: true, download: true },
    'logsReport.analytics': { view: true },
    masterRecord: { view: true, search: true, filter: true, export: true, download: true },
    'documents.rfidRegistry': { view: true, export: true, manage: true },
    profileSettings: { view: true, edit: true, changePassword: true },
    projectTracking: { view: true, searchProject: true, create: true, edit: true, delete: true, projectSetup: true, linkDocument: true, advanceStage: true, manageConfidentialAccess: true, projectControls: true, activityLogs: true, keyInChangeRequest: true, editProject: true, addNextPhase: true, moveToNextStage: true },
    expiryTracking: { view: true, edit: true, renew: true, export: true }
  },

  // Document Controller - manages document lifecycle
  document_controller: {
    dashboard: { view: true },
    'documents.draft': { view: true, create: true, update: true },
    'documents.review': { view: true, read: true, review: true, approve: true, reject: true },
    'documents.published': { view: true, read: true, create: true, publish: true, update: true, delete: true, download: true },
    'documents.superseded': { view: true, read: true, create: true, update: true, download: true },
    newDocumentRequest: { view: true, create: true, acknowledge: true },
    myDocumentsStatus: { view: true },
    'configuration.templates': { view: true, read: true, download: true },
    'configuration.templateRequests': { view: true, read: true, update: true },
    'logsReport.activityLogs': { view: true, filter: true, export: true },
    masterRecord: { view: true, search: true, filter: true, export: true, download: true },
    'documents.rfidRegistry': { view: true, export: true },
  profileSettings: { view: true, edit: true, changePassword: true },
    expiryTracking: { view: true, edit: true, renew: true, export: true }
  },

  // Reviewer - can review documents
  reviewer: {
    dashboard: { view: true },
    'documents.draft': { view: true },
    'documents.review': { view: true, read: true, review: true },
    'documents.published': { view: true, read: true, download: true },
    'documents.superseded': { view: true, read: true, download: true },
    myDocumentsStatus: { view: true },
    masterRecord: { view: true, search: true, filter: true },
    profileSettings: { view: true, edit: true, changePassword: true },
    expiryTracking: { view: true }
  },

  // Approver - can approve/reject documents
  approver: {
    dashboard: { view: true },
    'documents.draft': { view: true },
    'documents.review': { view: true, read: true, approve: true, reject: true },
    'documents.published': { view: true, read: true, download: true },
    'documents.superseded': { view: true, read: true, download: true },
    myDocumentsStatus: { view: true },
    masterRecord: { view: true, search: true, filter: true },
    profileSettings: { view: true, edit: true, changePassword: true },
    expiryTracking: { view: true }
  },

  // Acknowledger - can acknowledge document requests
  acknowledger: {
    dashboard: { view: true },
    'documents.draft': { view: true },
    'documents.review': { view: true, read: true },
    'documents.published': { view: true, read: true, download: true },
    newDocumentRequest: { view: true, acknowledge: true },
    myDocumentsStatus: { view: true },
    masterRecord: { view: true, search: true, filter: true },
    profileSettings: { view: true, edit: true, changePassword: true },
    expiryTracking: { view: true }
  },

  // Drafter - can create and edit drafts
  drafter: {
    dashboard: { view: true },
    'documents.draft': { view: true, create: true, update: true },
    'documents.review': { view: true, read: true },
    'documents.published': { view: true, read: true, download: true },
    newDocumentRequest: { view: true, create: true },
    myDocumentsStatus: { view: true },
    'configuration.templates': { view: true, read: true, download: true },
    'configuration.templateRequests': { view: true, create: true, read: true },
    masterRecord: { view: true, search: true, filter: true },
    profileSettings: { view: true, edit: true, changePassword: true },
    expiryTracking: { view: true }
  },

  // Viewer - read-only access
  viewer: {
    dashboard: { view: true },
    'documents.published': { view: true, read: true, download: true },
    'documents.superseded': { view: true, read: true, download: true },
    myDocumentsStatus: { view: true },
    masterRecord: { view: true, search: true, filter: true },
    profileSettings: { view: true, edit: true, changePassword: true },
    expiryTracking: { view: true }
  }
};

// Count permissions for a role
function countPermissions(perms) {
  let count = 0;
  Object.values(perms).forEach(modulePerms => {
    count += Object.keys(modulePerms).length;
  });
  return count;
}

async function main() {
  console.log('🔄 Updating ALL role permissions...\n');

  try {
    // Get all existing roles
    const existingRoles = await prisma.role.findMany();
    console.log(`Found ${existingRoles.length} roles in database\n`);

    for (const role of existingRoles) {
      const permissions = rolePermissions[role.name];
      
      if (permissions) {
        const permCount = countPermissions(permissions);
        
        await prisma.role.update({
          where: { id: role.id },
          data: {
            permissions: JSON.stringify(permissions),
            isSystem: true // Mark all predefined roles as system roles
          }
        });
        
        console.log(`✅ ${role.displayName} (${role.name}): ${permCount} permissions`);
      } else {
        console.log(`⚠️  ${role.displayName} (${role.name}): No predefined permissions - skipped`);
      }
    }

    // Also create document_controller if it doesn't exist
    const docController = existingRoles.find(r => r.name === 'document_controller');
    if (!docController) {
      console.log('\n📝 Creating Document Controller role...');
      await prisma.role.create({
        data: {
          name: 'document_controller',
          displayName: 'Document Controller',
          description: 'Manages document lifecycle and can acknowledge requests',
          isSystem: true,
          permissions: JSON.stringify(rolePermissions.document_controller)
        }
      });
      console.log(`✅ Document Controller created: ${countPermissions(rolePermissions.document_controller)} permissions`);
    }

    console.log('\n🎉 All role permissions updated successfully!');
    console.log('\n⚠️  Note: Users need to re-login to see updated permissions.');

  } catch (error) {
    console.error('❌ Error updating permissions:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
