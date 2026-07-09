const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config/app');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const ResponseFormatter = require('./utils/responseFormatter');

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
const epcRegistryRoutes = require('./routes/epcRegistry');
const projectTrackingRoutes = require('./routes/projectTracking');
const expiryTrackingRoutes = require('./routes/expiryTracking');
const notificationService = require('./services/notificationService');

const app = express();
app.set('trust proxy', 1);

// CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow all localhost origins
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    
    // Allow configured origin
    if (config.corsOrigin === '*' || origin === config.corsOrigin) {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Disposition', 'Content-Type', 'Content-Length']
}));

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

app.use('/uploads/branding', express.static(path.join(config.uploadDir, 'branding'), { maxAge: '30d', immutable: true }));
app.use('/uploads', express.static(config.uploadDir));

// Health check
app.get('/', (req, res) => {
  ResponseFormatter.success(res, {
    service: 'DMS Backend API',
    version: '1.0.0',
    status: 'running'
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
      expiryTracking: '/api/expiry-tracking'
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
app.use('/api/epc-registry', epcRegistryRoutes);
app.use('/api/project-tracking', projectTrackingRoutes);
app.use('/api/expiry-tracking', expiryTrackingRoutes);
app.use('/api/public', require('./routes/public'));

// Alias routes for easier frontend access
const configService = require('./services/configService');
const { authenticate } = require('./middleware/auth');
const asyncHandler = require('./utils/asyncHandler');

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

module.exports = app;
