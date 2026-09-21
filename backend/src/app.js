const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const config = require('./config/app');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const ResponseFormatter = require('./utils/responseFormatter');

const isProd = process.env.NODE_ENV === 'production';
const MEM_GUARD_THRESHOLD_MB = isProd ? 820 : 4000;

// Import routes
const authRoutes = require('./routes/auth');
const docRoutes = require('./routes/documents');
const folderRoutes = require('./routes/folders');
const workflowRoutes = require('./routes/workflow');
const supersedeRequestRoutes = require('./routes/supersedeRequests');
const notificationRoutes = require('./routes/notifications');
const reportsRoutes = require('./routes/reports');
const templatesRoutes = require('./routes/templates');
const auditRoutes = require('./routes/audit');
const systemRoutes = require('./routes/system');
const usersRoutes = require('./routes/users');
const rolesRoutes = require('./routes/roles');
const divisionsRoutes = require('./routes/divisions');
const epcRegistryRoutes = require('./routes/epcRegistry');
const projectTrackingRoutes = require('./routes/projectTracking');
const expiryTrackingRoutes = require('./routes/expiryTracking');
const crmRoutes = require('./routes/crm');
const smartTemplatesRoutes = require('./routes/smartTemplates');
const smartDocumentStyleRoutes = require('./routes/smartDocumentStyle');
const smartDocumentsRoutes = require('./routes/smartDocuments');
const aiRoutes = require('./routes/ai');
const notificationService = require('./services/notificationService');
const configService = require('./services/configService');

const app = express();
app.set('trust proxy', 1);

const parseAllowedOrigins = (value) => {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const allowedOrigins = parseAllowedOrigins(config.corsOrigin);

const isLocalOrigin = (origin) => origin.includes('localhost') || origin.includes('127.0.0.1');

const isSameOriginAsProxyHost = (req, origin) => {
  try {
    const parsedOrigin = new URL(origin);
    const forwardedHost = req.headers['x-forwarded-host'];
    const hostHeader = forwardedHost || req.headers.host;

    if (!hostHeader) return false;

    const normalizedHost = String(hostHeader).split(',')[0].trim().toLowerCase();
    return parsedOrigin.host.toLowerCase() === normalizedHost;
  } catch {
    return false;
  }
};

const corsOptionsDelegate = (req, callback) => {
  const origin = req.header('Origin');

  // Allow requests with no origin (like mobile apps or curl requests)
  if (!origin) {
    return callback(null, {
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      exposedHeaders: ['Content-Disposition', 'Content-Type', 'Content-Length']
    });
  }

  const isAllowed =
    isLocalOrigin(origin) ||
    config.corsOrigin === '*' ||
    allowedOrigins.includes(origin) ||
    isSameOriginAsProxyHost(req, origin);

  callback(isAllowed ? null : new Error('Not allowed by CORS'), {
    origin: isAllowed,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Disposition', 'Content-Type', 'Content-Length']
  });
};

// CORS configuration
app.use(cors(corsOptionsDelegate));

// Request logging middleware (development only)
if (config.nodeEnv === 'development') {
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

// Body parsing middleware
app.use(express.json({ limit: config.jsonBodyLimit }));
app.use(express.urlencoded({ extended: true, limit: config.jsonBodyLimit }));

// Memory usage guard: reject incoming requests with 503 when Node heap is dangerously high
// Prevents OOM kill on low-RAM servers (3-5GB instances)
app.use((req, res, next) => {
  try {
    const mem = process.memoryUsage();
    const heapMB = Math.round(mem.heapUsed / 1048576);
    if (heapMB > MEM_GUARD_THRESHOLD_MB) {
      const url = String(req.originalUrl || req.url || '');
      if (url.includes('/api/system/health') || url === '/healthz' || url === '/readyz') return next();
      console.warn(`[MEM_GUARD] Heap=${heapMB}MB > threshold=${MEM_GUARD_THRESHOLD_MB}MB, rejecting ${req.method} ${url}`);
      res.setHeader('Retry-After', '3');
      return res.status(503).json({
        success: false,
        message: 'Server is currently under high load, please retry in a moment.',
        code: 'HIGH_MEMORY_LOAD'
      });
    }
  } catch (_err) {}
  next();
});

app.use('/uploads/branding', express.static(path.join(config.uploadDir, 'branding'), { maxAge: '30d', immutable: true }));
app.use('/uploads/landing', express.static(path.join(config.uploadDir, 'landing'), { maxAge: '30d' }));
app.use('/uploads/profiles', express.static(path.join(config.uploadDir, 'profiles'), { maxAge: '1d' }));

// 🌟 FALLBACK CATCH-ALL: Serve branding/landing/profiles files when they exist
// in alternative directories (fixes aaPanel volume not shared / backend save path
// differs from web server docroot — the L4 "root root" of demo logo 404)
(function installUploadsFallbackServe() {
  const buildAltDirs = (subDir) => {
    const processCwd = process.cwd();
    const osHomedir = os.homedir ? os.homedir() : '';
    const baseDir = config && config.uploadDir ? config.uploadDir : path.resolve(processCwd, 'uploads');
    const primary = path.join(baseDir, subDir);
    const dirs = [];
    const dirCandidates = [
      primary,
      path.resolve(processCwd, 'uploads', subDir),
      path.resolve(processCwd, '..', 'uploads', subDir),
      path.resolve(processCwd, 'public', 'uploads', subDir),
      path.resolve(processCwd, '..', 'backend', 'uploads', subDir),
      path.resolve(processCwd, 'backend', 'uploads', subDir),
      `/www/wwwroot/dms.demo.clbgroups.com/backend/uploads/${subDir}`,
      `/www/wwwroot/dms.demo.clbgroups.com/uploads/${subDir}`,
      `/www/wwwroot/dms.demo.clbgroups.com/backend/public/uploads/${subDir}`,
      `/www/wwwroot/dms.demo.clbgroups.com/public/uploads/${subDir}`,
      `/www/wwwroot/default/backend/uploads/${subDir}`,
      `/www/wwwroot/default/uploads/${subDir}`,
      `/var/www/html/backend/uploads/${subDir}`,
      `/var/www/html/uploads/${subDir}`,
      `/app/backend/uploads/${subDir}`,
      `/app/uploads/${subDir}`,
      `/data/backend/uploads/${subDir}`,
      `/data/uploads/${subDir}`
    ];
    if (osHomedir) {
      dirCandidates.push(path.resolve(osHomedir, 'dms', 'uploads', subDir));
      dirCandidates.push(path.resolve(osHomedir, 'dms', 'backend', 'uploads', subDir));
    }
    // De-duplicate while preserving order
    const seen = new Set();
    for (const d of dirCandidates) {
      if (!d || seen.has(d)) continue;
      seen.add(d);
      dirs.push(d);
    }
    return dirs;
  };

  const safeBasename = (name) => {
    if (!name) return null;
    const base = String(name).split(/[?#]/)[0];
    if (!/^[A-Za-z0-9._-]+$/.test(base)) return null;
    return base;
  };

  const makeFallbackRoute = (mountPath, subDir) => {
    const dirs = buildAltDirs(subDir);
    app.get(`${mountPath}/*`, (req, res, next) => {
      // express.static already served if file existed in primary dir; reach here means 404
      const wildcard = req.params && req.params[0] ? String(req.params[0]) : '';
      const fname = safeBasename(path.basename(wildcard));
      if (!fname) return next();
      const traceId = Math.random().toString(36).slice(2, 8);
      let served = false;
      for (const dir of dirs) {
        try {
          const candidate = path.join(dir, fname);
          if (!fs.existsSync(candidate)) continue;
          const stat = fs.statSync(candidate);
          if (!stat.isFile()) continue;
          console.log(`%c[DEBUG-UPLOADS-FALLBACK:${traceId}] ✅ Found ${fname} in altDir: ${dir} → serving via sendFile (mountPath=${mountPath})`, 'color:#065F46;font-weight:bold');
          served = true;
          res.sendFile(candidate, {
            maxAge: mountPath === '/uploads/branding' ? '30d' : mountPath === '/uploads/landing' ? '30d' : '1d',
            immutable: mountPath === '/uploads/branding',
            headers: {
              'X-DMS-Uploads-Fallback': 'true',
              'X-DMS-AltDir': dir
            }
          });
          return;
        } catch (_e) { /* continue scanning */ }
      }
      if (!served) {
        console.log(`%c[DEBUG-UPLOADS-FALLBACK:${traceId}] ❌ ${fname} NOT FOUND in ANY dir (mountPath=${mountPath}, dirs count=${dirs.length}) → next() 404`, 'color:#DC2626;font-weight:bold');
      }
      next();
    });
  };

  makeFallbackRoute('/uploads/branding', 'branding');
  makeFallbackRoute('/uploads/landing', 'landing');
  makeFallbackRoute('/uploads/profiles', 'profiles');
})();

// Health check
app.get(['/healthz', '/readyz'], (req, res) => { res.status(200).type('text/plain').send('ok'); });
app.get('/', (req, res) => {
  const mem = process.memoryUsage();
  ResponseFormatter.success(res, {
    service: 'DMS Backend API',
    version: '1.0.0',
    status: 'running',
    memory: {
      heapUsedMB: Math.round(mem.heapUsed / 1048576),
      heapTotalMB: Math.round(mem.heapTotal / 1048576),
      rssMB: Math.round(mem.rss / 1048576)
    }
  }, 'Service is healthy');
});

app.get(['/api', '/api/'], (req, res) => {
  return ResponseFormatter.success(res, {
    service: 'DMS Backend API',
    endpoints: {
      health: '/api/system/health',
      auth: '/api/auth',
      users: '/api/users',
      roles: '/api/roles',
      documents: '/api/documents',
      folders: '/api/folders',
      workflow: '/api/workflow',
      reports: '/api/reports',
      templates: '/api/templates',
      notifications: '/api/notifications',
      epcRegistry: '/api/epc-registry',
      projectTracking: '/api/project-tracking',
      expiryTracking: '/api/expiry-tracking',
      crm: '/api/crm',
      smartTemplates: '/api/smart-templates',
      smartDocumentStyle: '/api/smart-document-style'
    }
  }, 'API root');
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/documents', docRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/workflow', workflowRoutes);
app.use('/api/supersede-requests', supersedeRequestRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/divisions', divisionsRoutes);
app.use('/api/epc-registry', epcRegistryRoutes);
app.use('/api/project-tracking', projectTrackingRoutes);
app.use('/api/expiry-tracking', expiryTrackingRoutes);
app.use('/api/crm', crmRoutes);

// Alias routes helpers (require BEFORE first use to avoid TDZ)
const { authenticate, authorizePermission } = require('./middleware/auth');
const asyncHandler = require('./utils/asyncHandler');
const documentController = require('./controllers/documentController');
const { uploadDocument } = require('./middleware/upload');

// Smart Document feature gating middleware
const requireSmartDocumentEnabled = asyncHandler(async (req, res, next) => {
  try {
    const settings = await configService.getSmartDocumentSettings()
    if (!settings.enabled) {
      return ResponseFormatter.error(
        res,
        'Smart Document feature is currently disabled. Please contact your administrator.',
        403,
        { code: 'SMART_DOCUMENT_DISABLED' }
      )
    }
    next()
  } catch (error) {
    console.error('Smart Document gating error:', error)
    next()
  }
})

app.use('/api/smart-templates', requireSmartDocumentEnabled, smartTemplatesRoutes);
app.use('/api/smart-document-style', requireSmartDocumentEnabled, smartDocumentStyleRoutes);
app.use('/api/smart-documents', requireSmartDocumentEnabled, smartDocumentsRoutes);

// AI routes: mount SAFELY. If aiRoutes is invalid or has undefined handlers, expose stubs instead of crashing the server.
(function mountAIRoutesSafely() {
  try {
    const routerType = typeof aiRoutes;
    if (routerType !== 'function') {
      throw new Error(`aiRoutes is ${routerType}, expected Express router function`);
    }
    // Verify known public endpoints exist so "undefined callback" error cannot happen
    const testStack = aiRoutes.stack || [];
    let hasHealth = false;
    let hasConfig = false;
    for (const layer of testStack) {
      const route = layer && layer.route;
      if (!route || !route.path || !Array.isArray(route.methods)) continue;
      if (route.path === '/health' && route.methods.get) hasHealth = true;
      if (route.path === '/config' && route.methods.get) hasConfig = true;
    }
    if (!hasHealth || !hasConfig) {
      throw new Error('aiRoutes missing /health or /config public endpoint (undefined callback risk)');
    }
    app.use('/api/ai', aiRoutes);
    console.log('✅ AI routes mounted safely');
  } catch (mountErr) {
    console.warn('⚠️  [AI_ROUTES] Skipping AI mount:', mountErr.message);
    // Stubs: MUST match expected frontend endpoints
    app.get('/api/ai/health', (req, res) => {
      res.status(200).json({
        success: true,
        data: {
          enabled: false,
          status: 'unavailable',
          model: 'none',
          message: 'AI module is unavailable on this server instance'
        }
      });
    });
    app.get('/api/ai/config', (req, res) => {
      res.status(200).json({ success: true, data: { enabled: false, model: null } });
    });
    app.use('/api/ai/*', (req, res) => {
      return res.status(501).json({
        success: false,
        message: 'AI endpoints are currently unavailable.',
        code: 'AI_MODULE_DISABLED'
      });
    });
  }
})();

app.use('/api/public', require('./routes/public'));

app.post(
  '/api/files/upload',
  authenticate,
  authorizePermission('documents.published', 'create'),
  uploadDocument.array('files'),
  documentController.bulkImportPublished
);

app.get('/api/workflows', authenticate, asyncHandler(async (req, res) => {
  const workflows = await configService.getWorkflows();
  return ResponseFormatter.success(res, { workflows });
}));

// Master record aliases (frontend calls /api/master-record, backend has /api/reports/master-record)
const reportsService = require('./services/reportsService');
const prisma = require('./config/database');

app.get('/api/master-record/new-documents', authenticate, asyncHandler(async (req, res) => {
  const { dateFrom, dateTo, type, owner, search } = req.query;
  const records = await reportsService.getDocumentRegister({ 
    documentType: type !== 'all' ? type : undefined, 
    startDate: dateFrom, 
    endDate: dateTo 
  });
  
  // Format for frontend
  let formattedRecords = records.map(record => ({
    id: record.id,
    fileCode: record.fileCode,
    title: record.documentTitle,
    type: record.documentType,
    version: record.version,
    owner: record.owner,
    department: record.department,
    status: record.status,
    dateCreated: record.createdAt ? new Date(record.createdAt).toLocaleDateString('en-GB') : ''
  }));
  
  // Filter by owner
  if (owner && owner !== 'all') {
    formattedRecords = formattedRecords.filter(r => r.owner.includes(owner));
  }
  
  // Search filter
  if (search) {
    formattedRecords = formattedRecords.filter(r => 
      r.fileCode.toLowerCase().includes(search.toLowerCase()) ||
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.owner.toLowerCase().includes(search.toLowerCase())
    );
  }
  
  return ResponseFormatter.success(res, { documents: formattedRecords });
}));

// User profile aliases (frontend calls /api/user, backend has /api/auth)
app.put('/api/user/profile', authenticate, require('./middleware/upload').uploadProfileImage.single('profileImage'), asyncHandler(async (req, res) => {
  const authService = require('./services/authService');
  const { firstName, lastName, phone, department, position, employeeId, dateJoined } = req.body;

  const updateData = {};
  if (firstName !== undefined) updateData.firstName = firstName;
  if (lastName !== undefined) updateData.lastName = lastName;
  if (phone !== undefined) updateData.phone = phone;
  if (department !== undefined) updateData.department = department;
  if (position !== undefined) updateData.position = position;
  if (employeeId !== undefined) updateData.employeeId = employeeId;
  if (dateJoined !== undefined) updateData.createdAt = new Date(dateJoined);

  // Handle profile image if uploaded
  if (req.file) {
    const profileImagePath = `/uploads/profiles/${req.user.id}/${req.file.filename}`;
    updateData.profileImage = profileImagePath;
  }

  const user = await authService.updateProfile(req.user.id, updateData);

  return ResponseFormatter.success(
    res,
    { user },
    'Profile updated successfully'
  );
}));

app.get('/api/user/notification-settings', authenticate, asyncHandler(async (req, res) => {
  // Get user notification preferences
  const userPref = await prisma.userPreference.findUnique({
    where: { userId: req.user.id }
  });
  
  const settings = notificationService.normalizeUserNotificationSettings(userPref?.notifications || null);
  
  return ResponseFormatter.success(res, settings, 'Notification settings retrieved successfully');
}));

app.put('/api/user/notification-settings', authenticate, asyncHandler(async (req, res) => {
  const settings = notificationService.normalizeUserNotificationSettings(req.body);
  // Store in user preferences
  await prisma.userPreference.upsert({
    where: { userId: req.user.id },
    update: { notifications: settings },
    create: {
      userId: req.user.id,
      notifications: settings
    }
  });
  
  return ResponseFormatter.success(res, { settings }, 'Notification settings updated successfully');
}));

app.get('/api/user/preferences', authenticate, asyncHandler(async (req, res) => {
  const userPref = await prisma.userPreference.findUnique({
    where: { userId: req.user.id }
  });
  
  const preferences = userPref ? {
    language: userPref.language || 'en',
    timezone: userPref.timezone || 'Asia/Kuala_Lumpur',
    dateFormat: userPref.dateFormat || 'DD/MM/YYYY',
    timeFormat: userPref.timeFormat || '24h',
    itemsPerPage: userPref.itemsPerPage || 15,
    defaultView: userPref.defaultView || 'list'
  } : null;
  
  return ResponseFormatter.success(res, preferences, 'Preferences retrieved successfully');
}));

app.put('/api/user/preferences', authenticate, asyncHandler(async (req, res) => {
  const { language, timezone, dateFormat, timeFormat, itemsPerPage, defaultView } = req.body;
  
  const preferences = await prisma.userPreference.upsert({
    where: { userId: req.user.id },
    update: {
      language,
      timezone,
      dateFormat,
      timeFormat,
      itemsPerPage,
      defaultView
    },
    create: {
      userId: req.user.id,
      language,
      timezone,
      dateFormat,
      timeFormat,
      itemsPerPage,
      defaultView
    }
  });
  
  return ResponseFormatter.success(res, { preferences }, 'Preferences updated successfully');
}));

// 404 handler (must be after all routes)
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// PM2 ready signal + periodic manual GC hint (when --expose-gc enabled)
if (typeof process.send === 'function') {
  try {
    process.nextTick(() => {
      try { process.send('ready'); } catch (_e) {}
    });
  } catch (_e) {}
}
setInterval(() => {
  try { if (global.gc) global.gc(); } catch (_e) {}
}, 20000);

module.exports = app;
