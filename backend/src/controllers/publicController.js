const asyncHandler = require('../utils/asyncHandler');
const ResponseFormatter = require('../utils/responseFormatter');
const prisma = require('../config/database');

/**
 * Get system features and information for landing page
 */
exports.getFeatures = asyncHandler(async (req, res) => {
  const features = {
    systemInfo: {
      title: 'Document Management System',
      description: 'Streamlined solution for document lifecycle management with version control, approval workflows, and secure storage.',
      version: '1.0.0'
    },
    keyFeatures: [
      {
        id: 1,
        title: 'Drafting, Review & Approval Flow',
        description: 'Automated workflow for document creation, review, and multi-level approval with real-time notifications.',
        icon: 'document-text'
      },
      {
        id: 2,
        title: 'Version Control & Tracking',
        description: 'Complete version history with automated tracking of changes, supersessions, and document obsolescence.',
        icon: 'clock'
      },
      {
        id: 3,
        title: 'Supersession & Obsolescence Management',
        description: 'Streamlined process for document supersession with controlled workflows and proper archival.',
        icon: 'archive'
      },
      {
        id: 4,
        title: 'Template Repository',
        description: 'Centralized template library with standardized formats for consistent document creation.',
        icon: 'document-duplicate'
      },
      {
        id: 5,
        title: 'Role-Based Access Control',
        description: 'Granular permissions and RBAC to secure sensitive documents and control user access levels.',
        icon: 'shield-check'
      },
      {
        id: 6,
        title: 'Notification System',
        description: 'Real-time alerts via email and in-app notifications for pending actions and document updates.',
        icon: 'bell'
      },
      {
        id: 7,
        title: 'Logs & Audit Trail',
        description: 'Complete audit logs tracking all document activities, user actions, and system events.',
        icon: 'clipboard-list'
      },
      {
        id: 8,
        title: 'Reports & Analytics',
        description: 'Comprehensive reporting with dashboard analytics, master records, and export capabilities.',
        icon: 'chart-bar'
      }
    ],
    userTypes: [
      {
        id: 1,
        role: 'Admin',
        description: 'Full system control, user management, and configuration. Manages roles, workflows, and system settings.',
        color: 'blue'
      },
      {
        id: 2,
        role: 'Document Controller',
        description: 'Oversees document lifecycle, manages master records, handles supersessions and archival processes.',
        color: 'purple'
      },
      {
        id: 3,
        role: 'Reviewer',
        description: 'Reviews and provides feedback on draft documents before approval stage.',
        color: 'green'
      },
      {
        id: 4,
        role: 'Approver',
        description: 'Final approval authority for document publication. Multi-level approval supported.',
        color: 'yellow'
      },
      {
        id: 5,
        role: 'Viewer',
        description: 'Read-only access to published documents. Can acknowledge and download approved documents.',
        color: 'gray'
      }
    ],
    workflow: [
      {
        step: 1,
        title: 'Draft Creation',
        description: 'User creates new document or uploads draft. Can use templates for standardization.',
        status: 'active'
      },
      {
        step: 2,
        title: 'Review',
        description: 'Assigned reviewers examine document and provide feedback or approve for next stage.',
        status: 'pending'
      },
      {
        step: 3,
        title: 'Approval',
        description: 'Designated approvers review and grant final approval for publication.',
        status: 'pending'
      },
      {
        step: 4,
        title: 'Published',
        description: 'Document is published and accessible to authorized users based on permissions.',
        status: 'completed'
      },
      {
        step: 5,
        title: 'Superseded/Obsolete',
        description: 'Document reaches end of lifecycle and is superseded by newer version or marked obsolete.',
        status: 'archived'
      }
    ]
  };

  return ResponseFormatter.success(res, features, 'Features retrieved successfully');
});

/**
 * Submit contact/inquiry form from landing page
 */
exports.submitContactForm = asyncHandler(async (req, res) => {
  const { name, email, subject, message, organizationType } = req.body;

  // Validation
  if (!name || !email || !message) {
    return ResponseFormatter.error(res, 'Name, email, and message are required', 400);
  }

  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return ResponseFormatter.error(res, 'Invalid email address', 400);
  }

  // Store inquiry in database
  const inquiry = await prisma.inquiry.create({
    data: {
      name,
      email,
      subject: subject || 'General Inquiry',
      message,
      organizationType: organizationType || 'Other',
      status: 'new',
      submittedAt: new Date()
    }
  });

  // TODO: Send email notification to admin
  // You can integrate with your notification service here

  return ResponseFormatter.success(
    res, 
    { inquiryId: inquiry.id },
    'Thank you for your inquiry. We will get back to you shortly.'
  );
});

/**
 * Get system statistics for landing page
 */
exports.getStatistics = asyncHandler(async (req, res) => {
  // Public-facing statistics (not sensitive data)
  const stats = {
    totalDocuments: await prisma.document.count({
      where: { status: 'published' }
    }),
    totalUsers: await prisma.user.count({
      where: { isActive: true }
    }),
    activeWorkflows: await prisma.workflow.count({
      where: { isActive: true }
    }),
    documentTypes: await prisma.documentType.count({
      where: { isActive: true }
    })
  };

  return ResponseFormatter.success(res, stats, 'Statistics retrieved successfully');
});

/**
 * Get landing page settings (global)
 */
exports.getLandingPageSettings = asyncHandler(async (req, res) => {
  const config = await prisma.configuration.findUnique({
    where: { key: 'landing_page_settings' }
  });

  let settings = null;
  if (config?.value) {
    try {
      settings = JSON.parse(config.value);
    } catch {
      settings = null;
    }
  }

  return ResponseFormatter.success(res, { settings }, 'Landing page settings retrieved successfully');
});

exports.getBranding = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  const [companyConfig, themeConfig] = await Promise.all([
    prisma.configuration.findUnique({ where: { key: 'company_info' } }),
    prisma.configuration.findUnique({ where: { key: 'theme_settings' } })
  ]);

  let companyInfo = null;
  if (companyConfig?.value) {
    try {
      companyInfo = JSON.parse(companyConfig.value);
    } catch {
      companyInfo = null;
    }
  }

  let theme = null;
  if (themeConfig?.value) {
    try {
      theme = JSON.parse(themeConfig.value);
    } catch {
      theme = null;
    }
  }

  return ResponseFormatter.success(res, { companyInfo, theme }, 'Branding retrieved successfully');
});
