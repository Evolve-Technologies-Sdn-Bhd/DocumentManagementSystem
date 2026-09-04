const asyncHandler = require('../utils/asyncHandler');
const ResponseFormatter = require('../utils/responseFormatter');
const prisma = require('../config/database');
const fs = require('fs/promises');
const path = require('path');
const appConfig = require('../config/app');

const resolveBrandingFile = async (pathOrUrl) => {
  // #region debug-point E:publicResolveBrandingFile
  const traceId = `pub-logo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  console.log(`[DEBUG-PUB-BRANDING:${traceId}] ===== resolveBrandingFile (publicController) START =====`)
  console.log(`[DEBUG-PUB-BRANDING:${traceId}] raw input:`, JSON.stringify(pathOrUrl), typeof pathOrUrl)
  // #endregion
  if (!pathOrUrl || typeof pathOrUrl !== 'string') {
    // #region debug-point E:publicResolveBrandingFile
    console.log(`[DEBUG-PUB-BRANDING:${traceId}] early return null (empty/invalid)`)
    // #endregion
    return null;
  }
  const trimmed = pathOrUrl.trim();
  if (!trimmed) {
    // #region debug-point E:publicResolveBrandingFile
    console.log(`[DEBUG-PUB-BRANDING:${traceId}] early return null (trimmed empty)`)
    // #endregion
    return null;
  }
  if (trimmed.startsWith('data:')) {
    // #region debug-point E:publicResolveBrandingFile
    console.log(`[DEBUG-PUB-BRANDING:${traceId}] is data: URL, return as-is (len=${trimmed.length})`)
    // #endregion
    return trimmed;
  }
  const normalized = trimmed
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/+/, '');
  // #region debug-point E:publicResolveBrandingFile
  console.log(`[DEBUG-PUB-BRANDING:${traceId}] trimmed:`, JSON.stringify(trimmed))
  console.log(`[DEBUG-PUB-BRANDING:${traceId}] normalized (strip domain/leading slashes):`, JSON.stringify(normalized))
  // #endregion
  const match = normalized.match(/^uploads\/branding\/([^/?#]+)(?:[?#].*)?$/i);
  // #region debug-point E:publicResolveBrandingFile
  console.log(`[DEBUG-PUB-BRANDING:${traceId}] match (uploads/branding regex):`, match ? `OK -> fileName=${match[1]}` : 'NO MATCH')
  // #endregion
  if (!match) {
    const legacyMatch = trimmed.match(/(?:^|\/)branding\/([^/?#]+)(?:[?#].*)?$/i);
    // #region debug-point E:publicResolveBrandingFile
    console.log(`[DEBUG-PUB-BRANDING:${traceId}] legacyMatch (branding regex):`, legacyMatch ? `OK -> fileName=${legacyMatch[1]}` : 'NO MATCH')
    // #endregion
    if (!legacyMatch) {
      // #region debug-point E:publicResolveBrandingFile
      console.log(`[DEBUG-PUB-BRANDING:${traceId}] NO MATCH either regex, returning trimmed=`, JSON.stringify(trimmed))
      // #endregion
      return trimmed;
    }
  }
  const fileName = (match ? match[1] : null) || (trimmed.match(/(?:^|\/)([^\/?#]+)(?:[?#].*)?$/) || [])[1] || null;
  if (!fileName) {
    // #region debug-point E:publicResolveBrandingFile
    console.log(`[DEBUG-PUB-BRANDING:${traceId}] fileName extraction FAILED, return null`)
    // #endregion
    return null;
  }
  // #region debug-point E:publicResolveBrandingFile
  console.log(`[DEBUG-PUB-BRANDING:${traceId}] FINAL fileName=`, JSON.stringify(fileName))
  // #endregion
  const baseDir = appConfig && appConfig.uploadDir ? appConfig.uploadDir : path.resolve(process.cwd(), 'uploads');
  const filePath = path.join(baseDir, 'branding', fileName);
  const fsConst = require('fs').constants;
  // #region debug-point E:publicResolveBrandingFile
  console.log(`[DEBUG-PUB-BRANDING:${traceId}] baseDir=`, JSON.stringify(baseDir), `checking filePath=`, JSON.stringify(filePath))
  // #endregion
  try {
    await fs.access(filePath, fsConst.R_OK);
    // #region debug-point E:publicResolveBrandingFile
    console.log(`[DEBUG-PUB-BRANDING:${traceId}] ✅ baseDir FOUND, return /uploads/branding/${fileName}`)
    // #endregion
    return `/uploads/branding/${fileName}`;
  } catch (err) {
    // #region debug-point E:publicResolveBrandingFile
    console.log(`[DEBUG-PUB-BRANDING:${traceId}] ❌ baseDir NOT FOUND (${err.code}), trying altDirs...`)
    // #endregion
    let foundPath = null;
    try {
      const processCwd = process.cwd();
      let osHomedir = processCwd;
      try { osHomedir = require('os').homedir(); } catch {}
      const altDirs = [
        path.resolve(processCwd, 'uploads'),
        path.resolve(processCwd, '..', 'uploads'),
        path.resolve(processCwd, 'public', 'uploads'),
        path.resolve(processCwd, '..', 'backend', 'uploads'),
        path.resolve(processCwd, 'backend', 'uploads'),
        // aaPanel standard paths (demo + generic)
        '/www/wwwroot/dms.demo.clbgroups.com/backend/uploads',
        '/www/wwwroot/dms.demo.clbgroups.com/uploads',
        '/www/wwwroot/dms.demo.clbgroups.com/backend/public/uploads',
        '/www/wwwroot/dms.demo.clbgroups.com/public/uploads',
        '/www/wwwroot/default/backend/uploads',
        '/www/wwwroot/default/uploads',
        // Docker on-prem bind mount paths
        '/var/www/html/backend/uploads',
        '/var/www/html/uploads',
        '/app/backend/uploads',
        '/app/uploads',
        '/data/backend/uploads',
        '/data/uploads',
        // Home dir fallback
        path.resolve(osHomedir, 'dms', 'uploads'),
        path.resolve(osHomedir, 'dms', 'backend', 'uploads')
      ];
      for (const dir of altDirs) {
        const altPath = path.join(dir, 'branding', fileName);
        try {
          await fs.access(altPath, fsConst.R_OK);
          // #region debug-point E:publicResolveBrandingFile
          console.log(`[DEBUG-PUB-BRANDING:${traceId}] ✅ altDir FOUND: dir=${JSON.stringify(dir)} altPath=${JSON.stringify(altPath)} -> return /uploads/branding/${fileName}`)
          // #endregion
          foundPath = `/uploads/branding/${fileName}`;
          break;
        } catch (e2) {
          // #region debug-point E:publicResolveBrandingFile
          console.log(`[DEBUG-PUB-BRANDING:${traceId}] ❌ altDir MISS: dir=${JSON.stringify(dir)} (${e2.code})`)
          // #endregion
        }
      }
    } catch (outerErr) {
      // #region debug-point E:publicResolveBrandingFile
      console.log(`[DEBUG-PUB-BRANDING:${traceId}] ❌ altDirs loop EXCEPTION:`, outerErr.message)
      // #endregion
    }
    if (foundPath) return foundPath;
    // 🌟 CRITICAL FALLBACK (same as configService): return RELATIVE PATH instead of NULL
    // This prevents frontend global state null override race.
    const relativeReturn = `/uploads/branding/${fileName}`;
    // #region debug-point E:publicResolveBrandingFile
    console.log(`%c[DEBUG-PUB-BRANDING:${traceId}] ❌❌ ALL DIRS FAILED — returning RELATIVE PATH FALLBACK: ${JSON.stringify(relativeReturn)} INSTEAD OF NULL (prevents global state null override)`, 'color:#B45309;font-weight:bold');
    // #endregion
    return relativeReturn;
  }
};

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
  let config = null
  try {
    config = await prisma.configuration.findUnique({
      where: { key: 'landing_page_settings' }
    })
  } catch {
    config = null
  }

  const stamp = config?.updatedAt instanceof Date ? config.updatedAt.getTime() : 0
  const etag = `W/"landing-page-settings-${stamp}"`
  res.set('ETag', etag)
  res.set('Cache-Control', 'public, max-age=0, must-revalidate')
  res.set('Vary', 'Accept-Encoding')
  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end()
  }

  let settings = null
  if (config?.value) {
    try {
      settings = JSON.parse(config.value)
    } catch {
      settings = null
    }
  }

  return ResponseFormatter.success(res, { settings }, 'Landing page settings retrieved successfully')
})

exports.getLoginPageSettings = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.set('Pragma', 'no-cache')
  res.set('Expires', '0')

  let config = null
  try {
    config = await prisma.configuration.findUnique({
      where: { key: 'login_page_settings' }
    })
  } catch {
    config = null
  }

  let settings = null
  if (config?.value) {
    try {
      settings = JSON.parse(config.value)
    } catch {
      settings = null
    }
  }

  return ResponseFormatter.success(res, { settings }, 'Login page settings retrieved successfully')
})

exports.getBranding = asyncHandler(async (req, res) => {
  let companyConfig = null
  let themeConfig = null
  try {
    ;[companyConfig, themeConfig] = await Promise.all([
      prisma.configuration.findUnique({ where: { key: 'company_info' } }),
      prisma.configuration.findUnique({ where: { key: 'theme_settings' } })
    ])
  } catch {
    companyConfig = null
    themeConfig = null
  }

  const companyStamp = companyConfig?.updatedAt instanceof Date ? companyConfig.updatedAt.getTime() : 0
  const themeStamp = themeConfig?.updatedAt instanceof Date ? themeConfig.updatedAt.getTime() : 0
  const etag = `W/"branding-${companyStamp}-${themeStamp}"`

  res.set('ETag', etag)
  res.set('Cache-Control', 'public, max-age=0, must-revalidate')
  res.set('Vary', 'Accept-Encoding')

  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end()
  }

  let companyInfo = null
  if (companyConfig?.value) {
    try {
      companyInfo = JSON.parse(companyConfig.value)
    } catch {
      companyInfo = null
    }
  }

  let theme = null
  if (themeConfig?.value) {
    try {
      theme = JSON.parse(themeConfig.value)
      if (theme && typeof theme === 'object') {
        theme.mainLogo = await resolveBrandingFile(theme.mainLogo)
        theme.favicon = await resolveBrandingFile(theme.favicon)
        theme.bgImage = await resolveBrandingFile(theme.bgImage)
      }
    } catch {
      theme = null
    }
  }

  return ResponseFormatter.success(res, { companyInfo, theme }, 'Branding retrieved successfully')
})

exports.getMaintenanceStatus = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.set('Pragma', 'no-cache')
  res.set('Expires', '0')

  let config = null
  try {
    config = await prisma.configuration.findUnique({
      where: { key: 'maintenance_settings' }
    })
  } catch {
    config = null
  }

  let parsed = null
  if (config?.value) {
    try {
      parsed = JSON.parse(config.value)
    } catch {
      parsed = null
    }
  }

  const enabled = Boolean(parsed?.enabled)
  const message =
    typeof parsed?.message === 'string' && parsed.message.trim()
      ? parsed.message.trim()
      : 'System is under maintenance'

  return ResponseFormatter.success(res, { enabled, message }, 'Maintenance status retrieved successfully')
})

exports.getSmartDocumentStatus = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.set('Pragma', 'no-cache')
  res.set('Expires', '0')

  let config = null
  try {
    config = await prisma.configuration.findUnique({
      where: { key: 'smart_document_settings' }
    })
  } catch {
    config = null
  }

  let parsed = null
  if (config?.value) {
    try {
      parsed = JSON.parse(config.value)
    } catch {
      parsed = null
    }
  }

  const enabled = parsed?.enabled === undefined ? true : Boolean(parsed.enabled)

  return ResponseFormatter.success(res, { enabled }, 'Smart Document status retrieved successfully')
})
