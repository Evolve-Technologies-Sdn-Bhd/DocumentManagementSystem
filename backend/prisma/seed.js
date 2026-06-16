const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // ============================================
  // 1. SEED ROLES
  // ============================================
  console.log('📋 Seeding roles...');
  
  // Complete permissions for Administrator - all 80 permissions
  const adminPermissions = {
    // Dashboard (1 permission)
    dashboard: { view: true },
    
    // Document Management (20 permissions)
    'documents.draft': { view: true, create: true, update: true, delete: true },
    'documents.review': { view: true, read: true, review: true, approve: true, reject: true },
    'documents.published': { view: true, read: true, create: true, update: true, delete: true, download: true },
    'documents.superseded': { view: true, read: true, create: true, update: true, download: true },
    
    // New Document Request (3 permissions)
    newDocumentRequest: { view: true, create: true, acknowledge: true },
    
    // My Documents Status (1 permission)
    myDocumentsStatus: { view: true },
    
    // Configuration (36 permissions)
    'configuration.users': { view: true, create: true, edit: true, delete: true, activate: true, deactivate: true },
    'configuration.roles': { view: true, create: true, edit: true, delete: true, assign: true },
    'configuration.templates': { view: true, read: true, create: true, update: true, delete: true, download: true },
    'configuration.documentTypes': { view: true, create: true, edit: true, delete: true },
    'configuration.masterData': { view: true, create: true, edit: true, delete: true },
    'configuration.settings': { view: true, edit: true },
    'configuration.backup': { view: true, backup: true, restore: true, download: true },
    'configuration.cleanup': { view: true, analyze: true, cleanup: true },
    'configuration.auditSettings': { view: true, edit: true },
    
    // Logs & Reports (11 permissions)
    'logsReport.activityLogs': { view: true, filter: true, export: true },
    'logsReport.userActivity': { view: true, filter: true, export: true },
    'logsReport.reports': { view: true, generate: true, export: true, download: true },
    'logsReport.analytics': { view: true },
    
    // Master Record (5 permissions)
    masterRecord: { view: true, search: true, filter: true, export: true, download: true },

    // RFID EPC Registry (3 permissions)
    'documents.rfidRegistry': { view: true, export: true, manage: true },

    // Project Tracking (8 permissions)
    projectTracking: { view: true, create: true, edit: true, delete: true, manageTemplates: true, linkDocument: true, advanceStage: true, viewConfidential: true },
    
    // Profile Settings (3 permissions)
    profileSettings: { view: true, edit: true, changePassword: true }
  };

  const roles = [
    {
      name: 'admin',
      displayName: 'Administrator',
      description: 'Full system access and configuration',
      isSystem: true,
      permissions: JSON.stringify(adminPermissions)
    },
    {
      name: 'document_controller',
      displayName: 'Document Controller',
      description: 'Manages document lifecycle and can acknowledge requests',
      isSystem: true,
      permissions: JSON.stringify({
        dashboard: { view: true },
        'documents.draft': { view: true, create: true, update: true, delete: true },
        'documents.review': { view: true, read: true, review: true, approve: true, reject: true },
        'documents.published': { view: true, read: true, create: true, update: true, delete: true, download: true },
        'documents.superseded': { view: true, read: true, create: true, update: true, download: true },
        newDocumentRequest: { view: true, create: true, acknowledge: true },
        myDocumentsStatus: { view: true },
        'configuration.templates': { view: true, read: true, download: true },
        'logsReport.activityLogs': { view: true, filter: true, export: true },
        masterRecord: { view: true, search: true, filter: true, export: true, download: true },
        'documents.rfidRegistry': { view: true, export: true },
        profileSettings: { view: true, edit: true, changePassword: true }
      })
    },
    {
      name: 'reviewer',
      displayName: 'Reviewer',
      description: 'Can review and provide feedback on documents',
      isSystem: true,
      permissions: JSON.stringify({
        dashboard: { view: true },
        'documents.draft': { view: true },
        'documents.review': { view: true, read: true, review: true },
        'documents.published': { view: true, read: true, download: true },
        'documents.superseded': { view: true, read: true, download: true },
        myDocumentsStatus: { view: true },
        masterRecord: { view: true, search: true, filter: true },
        profileSettings: { view: true, edit: true, changePassword: true }
      })
    },
    {
      name: 'approver',
      displayName: 'Approver',
      description: 'Can approve or reject documents',
      isSystem: true,
      permissions: JSON.stringify({
        dashboard: { view: true },
        'documents.draft': { view: true },
        'documents.review': { view: true, read: true, approve: true, reject: true },
        'documents.published': { view: true, read: true, download: true },
        'documents.superseded': { view: true, read: true, download: true },
        myDocumentsStatus: { view: true },
        masterRecord: { view: true, search: true, filter: true },
        profileSettings: { view: true, edit: true, changePassword: true }
      })
    },
    {
      name: 'acknowledger',
      displayName: 'Acknowledger',
      description: 'Can acknowledge new document requests',
      isSystem: true,
      permissions: JSON.stringify({
        dashboard: { view: true },
        'documents.draft': { view: true },
        'documents.review': { view: true, read: true },
        'documents.published': { view: true, read: true, download: true },
        newDocumentRequest: { view: true, acknowledge: true },
        myDocumentsStatus: { view: true },
        masterRecord: { view: true, search: true, filter: true },
        profileSettings: { view: true, edit: true, changePassword: true }
      })
    },
    {
      name: 'drafter',
      displayName: 'Drafter',
      description: 'Can create and edit draft documents',
      isSystem: true,
      permissions: JSON.stringify({
        dashboard: { view: true },
        'documents.draft': { view: true, create: true, update: true, delete: true },
        'documents.review': { view: true, read: true },
        'documents.published': { view: true, read: true, download: true },
        newDocumentRequest: { view: true, create: true },
        myDocumentsStatus: { view: true },
        'configuration.templates': { view: true, read: true, download: true },
        masterRecord: { view: true, search: true, filter: true },
        profileSettings: { view: true, edit: true, changePassword: true }
      })
    },
    {
      name: 'viewer',
      displayName: 'Viewer',
      description: 'Can only view published documents',
      isSystem: true,
      permissions: JSON.stringify({
        dashboard: { view: true },
        'documents.published': { view: true, read: true, download: true },
        'documents.superseded': { view: true, read: true, download: true },
        myDocumentsStatus: { view: true },
        masterRecord: { view: true, search: true, filter: true },
        profileSettings: { view: true, edit: true, changePassword: true }
      })
    }
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: role,
      create: role
    });
  }

  console.log('✅ Roles seeded successfully');

  // ============================================
  // 2. SEED DOCUMENT TYPES
  // ============================================
  console.log('📄 Seeding document types...');

  const documentTypes = [
    { name: 'Policy', prefix: 'P', description: 'Company policies and guidelines' },
    { name: 'Business Case', prefix: 'BC', description: 'Business case documents' },
    { name: 'Process & Procedure', prefix: 'PP', description: 'Standard operating procedures' },
    { name: 'Minutes of Meeting', prefix: 'MoM', description: 'Meeting minutes and notes' },
    { name: 'Project Risk Assessment', prefix: 'PRA', description: 'Risk assessment reports' },
    { name: 'Design Document', prefix: 'DD', description: 'Technical design specifications' },
    { name: 'Risk Management Plan', prefix: 'RMP', description: 'Risk management strategies' },
    { name: 'WBS Dictionary', prefix: 'WBS', description: 'Work breakdown structure definitions' }
  ];

  for (const docType of documentTypes) {
    await prisma.documentType.upsert({
      where: { name: docType.name },
      update: docType,
      create: docType
    });
  }

  console.log('✅ Document types seeded successfully');

  // ============================================
  // 3. SEED PROJECT STAGES
  // ============================================
  console.log('🗂️ Seeding project stage definitions...');

  const projectStages = [
    { key: 'PRE_SALES', name: 'Pre-Sales', sortOrder: 1 },
    { key: 'SALES', name: 'Sales', sortOrder: 2 },
    { key: 'PLANNING', name: 'Planning', sortOrder: 3 },
    { key: 'DEVELOPMENT', name: 'Development', sortOrder: 4 },
    { key: 'TESTING', name: 'Testing', sortOrder: 5 },
    { key: 'DELIVERY', name: 'Delivery', sortOrder: 6 },
    { key: 'CLOSED', name: 'Closed', sortOrder: 7 }
  ];

  for (const stage of projectStages) {
    await prisma.projectStageDefinition.upsert({
      where: { key: stage.key },
      update: stage,
      create: stage
    });
  }

  console.log('✅ Project stage definitions seeded successfully');

  // ============================================
  // 4. SEED DEFAULT ADMIN USER
  // ============================================
  console.log('👤 Seeding default admin user...');

  const adminRole = await prisma.role.findUnique({
    where: { name: 'admin' }
  });

  const hashedPassword = await bcrypt.hash('Admin@123', 10);

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@company.com' },
    update: {},
    create: {
      email: 'admin@company.com',
      password: hashedPassword,
      firstName: 'System',
      lastName: 'Administrator',
      employeeId: 'EMP001',
      department: 'IT',
      position: 'System Administrator',
      status: 'ACTIVE'
    }
  });

  // Assign admin role
  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: adminUser.id,
        roleId: adminRole.id
      }
    },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: adminRole.id
    }
  });

  // Create user preferences
  await prisma.userPreference.upsert({
    where: { userId: adminUser.id },
    update: {},
    create: {
      userId: adminUser.id,
      language: 'en',
      timezone: 'Asia/Kuala_Lumpur',
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '24h',
      itemsPerPage: 15,
      defaultView: 'list',
      emailDigest: 'daily',
      notifications: JSON.stringify({
        email: {
          documentAssigned: true,
          reviewRequired: true,
          approvalRequired: true,
          statusChanged: true
        },
        inApp: {
          documentAssigned: true,
          reviewRequired: true,
          approvalRequired: true,
          statusChanged: true
        }
      })
    }
  });

  console.log('✅ Admin user created: admin@company.com / Admin@123');

  // ============================================
  // 4. SEED DEFAULT WORKFLOWS
  // ============================================
  console.log('🔄 Seeding default workflows...');

  const reviewerRole = await prisma.role.findUnique({ where: { name: 'reviewer' } });
  const approverRole = await prisma.role.findUnique({ where: { name: 'approver' } });
  const acknowledgerRole = await prisma.role.findUnique({ where: { name: 'acknowledger' } });

  // Get all document types to create workflows
  const allDocTypes = await prisma.documentType.findMany();

  for (const docType of allDocTypes) {
    // Check if workflow already exists
    const existingWorkflow = await prisma.workflow.findUnique({
      where: { documentTypeId: docType.id }
    });

    if (existingWorkflow) {
      console.log(`  - Workflow for ${docType.name} already exists, skipping...`);
      continue;
    }

    // Create new workflow
    const workflow = await prisma.workflow.create({
      data: {
        name: `${docType.name} Standard Workflow`,
        description: `Standard approval workflow for ${docType.name} documents`,
        documentTypeId: docType.id,
        isActive: true
      }
    });

    // Create workflow steps
    await prisma.workflowStep.createMany({
      data: [
        {
          workflowId: workflow.id,
          stepOrder: 1,
          stepName: 'Review',
          roleId: reviewerRole.id,
          isRequired: true,
          dueInDays: 3
        },
        {
          workflowId: workflow.id,
          stepOrder: 2,
          stepName: 'Approval',
          roleId: approverRole.id,
          isRequired: true,
          dueInDays: 5
        },
        {
          workflowId: workflow.id,
          stepOrder: 3,
          stepName: 'Acknowledgment',
          roleId: acknowledgerRole.id,
          isRequired: true,
          dueInDays: 2
        }
      ]
    });

    console.log(`  - Created workflow for ${docType.name}`);
  }

  console.log('✅ Workflows created for all document types');

  // ============================================
  // 5. SEED SYSTEM CONFIGURATIONS
  // ============================================
  console.log('⚙️ Seeding system configurations...');

  const configurations = [
    {
      key: 'system.name',
      value: 'Document Management System',
      description: 'System name displayed in the application'
    },
    {
      key: 'system.version',
      value: '1.0.0',
      description: 'Current system version'
    },
    {
      key: 'document.fileCodePattern',
      value: '{PREFIX}-{YEAR}-{SEQUENCE}',
      description: 'Pattern for generating document file codes'
    },
    {
      key: 'document.versioningScheme',
      value: 'major.minor',
      description: 'Document versioning scheme (e.g., 1.0, 1.1, 2.0)'
    },
    {
      key: 'document.maxFileSize',
      value: '52428800',
      description: 'Maximum file size in bytes (50MB default)'
    },
    {
      key: 'document.allowedFileTypes',
      value: 'pdf,doc,docx,xls,xlsx,ppt,pptx,txt',
      description: 'Comma-separated list of allowed file extensions'
    },
    {
      key: 'email.enabled',
      value: 'false',
      description: 'Enable email notifications'
    },
    {
      key: 'email.smtp.host',
      value: 'smtp.example.com',
      description: 'SMTP server host'
    },
    {
      key: 'email.smtp.port',
      value: '587',
      description: 'SMTP server port'
    },
    {
      key: 'email.from',
      value: 'noreply@company.com',
      description: 'Default sender email address'
    },
    {
      key: 'session.timeout',
      value: '28800',
      description: 'Session timeout in seconds (8 hours default)'
    },
    {
      key: 'password.minLength',
      value: '8',
      description: 'Minimum password length'
    },
    {
      key: 'password.requireSpecialChar',
      value: 'true',
      description: 'Require special characters in password'
    },
    {
      key: 'audit.retentionDays',
      value: '365',
      description: 'Number of days to retain audit logs'
    }
  ];

  for (const config of configurations) {
    await prisma.configuration.upsert({
      where: { key: config.key },
      update: { value: config.value, description: config.description },
      create: config
    });
  }

  console.log('✅ System configurations seeded successfully');

  // ============================================
  // SUMMARY
  // ============================================
  console.log('\n🎉 Database seeding completed successfully!\n');
  console.log('📊 Summary:');
  console.log(`   - ${roles.length} roles created`);
  console.log(`   - ${documentTypes.length} document types created`);
  console.log(`   - ${allDocTypes.length} workflows created`);
  console.log(`   - ${configurations.length} system configurations set`);
  console.log(`   - 1 admin user created\n`);
  console.log('🔑 Default Admin Credentials:');
  console.log('   Email: admin@company.com');
  console.log('   Password: Admin@123');
  console.log('   ⚠️  Please change this password after first login!\n');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
