const express = require('express');
const { authenticate, authorizePermission } = require('../middleware/auth');
const ResponseFormatter = require('../utils/responseFormatter');
const asyncHandler = require('../utils/asyncHandler');
const prisma = require('../config/database');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

const formatDuration = (durationMs, isActive) => {
  const safe = Math.max(0, Number(durationMs) || 0)
  const hours = Math.floor(safe / (1000 * 60 * 60));
  const minutes = Math.floor((safe % (1000 * 60 * 60)) / (1000 * 60));
  return isActive ? `${hours}h ${minutes}m (Active)` : `${hours}h ${minutes}m`;
};

const getNextLoginTime = async (userId, loginAt) => {
  const nextLogin = await prisma.auditLog.findFirst({
    where: {
      userId,
      action: 'LOGIN',
      createdAt: { gt: loginAt }
    },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true }
  })
  return nextLogin?.createdAt || null
}

/**
 * Get audit logs
 * GET /api/audit/logs
 */
router.get('/logs', authorizePermission('logsReport.activityLogs', 'view'), asyncHandler(async (req, res) => {
  const { page = 1, limit = 15, dateRange, module, action, user, search } = req.query;
  
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const where = {};

  // Date range filter
  if (dateRange && dateRange !== 'all') {
    const now = new Date();
    const daysMap = { '7days': 7, '30days': 30, '90days': 90 };
    const days = daysMap[dateRange] || 7;
    where.createdAt = {
      gte: new Date(now.setDate(now.getDate() - days))
    };
  }

  // Module filter
  if (module && module !== 'all') {
    where.entity = module;
  }

  // Action filter
  if (action && action !== 'all') {
    where.action = action;
  }

  // User filter
  if (user && user !== 'all') {
    where.userId = parseInt(user);
  }

  // Search filter
  if (search) {
    where.OR = [
      { entity: { contains: search } },
      { action: { contains: search } },
      { details: { contains: search } }
    ];
  }

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: parseInt(limit)
    })
  ]);

  const formattedLogs = logs.map(log => ({
    id: log.id,
    timestamp: log.createdAt.toISOString(),
    user: log.user ? `${log.user.firstName || ''} ${log.user.lastName || ''}`.trim() || log.user.email : 'System',
    module: log.entity,
    action: log.action,
    description: log.details || `${log.action} ${log.entity}`,
    ipAddress: log.ipAddress || 'N/A',
    status: 'Success'
  }));

  return ResponseFormatter.paginated(
    res,
    formattedLogs,
    parseInt(page),
    parseInt(limit),
    total,
    'Audit logs retrieved successfully'
  );
}));

/**
 * Get user activity logs (session-based view)
 * GET /api/audit/user-activities
 */
router.get('/user-activities', authorizePermission('logsReport.userActivity', 'view'), asyncHandler(async (req, res) => {
  const { page = 1, limit = 15, dateRange = '7days', user, department, status, search } = req.query;
  
  const skip = (parseInt(page) - 1) * parseInt(limit);
  
  // Build date filter
  const now = new Date();
  let startDate = new Date();
  if (dateRange === 'today') {
    startDate.setHours(0, 0, 0, 0);
  } else {
    const daysMap = { '7days': 7, '30days': 30, '90days': 90 };
    const days = daysMap[dateRange] || 7;
    startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }

  // Get all sessions (login events) in the date range
  const sessionWhere = {
    action: 'LOGIN',
    createdAt: { gte: startDate }
  };

  if (user && user !== 'all') {
    sessionWhere.userId = parseInt(user);
  }

  if (search) {
    sessionWhere.OR = [
      { user: { email: { contains: search } } },
      { user: { firstName: { contains: search } } },
      { user: { lastName: { contains: search } } },
      { ipAddress: { contains: search } }
    ];
  }

  // Get sessions
  const sessions = await prisma.auditLog.findMany({
    where: sessionWhere,
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          department: true,
          roles: {
            include: {
              role: { select: { displayName: true } }
            }
          }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  // Filter by department if needed
  let filteredSessions = sessions;
  if (department && department !== 'all') {
    filteredSessions = sessions.filter(s => s.user?.department === department);
  }

  // Build session activities
  const sessionActivities = await Promise.all(
    filteredSessions.slice(skip, skip + parseInt(limit)).map(async (session) => {
      if (!session.user) return null;

      const nowForSession = new Date()
      const nextLoginAt = await getNextLoginTime(session.userId, session.createdAt)
      const upperBound = nextLoginAt || nowForSession

      // Get all activities for this user after login
      const userActivities = await prisma.auditLog.findMany({
        where: {
          userId: session.userId,
          createdAt: { gte: session.createdAt, lt: upperBound }
        },
        orderBy: { createdAt: 'asc' }
      });

      // Find logout or calculate duration
      const logoutEvent = userActivities.find(a => a.action === 'LOGOUT' && a.createdAt > session.createdAt);
      const nonLoginNonLogout = userActivities.filter(a => a.action !== 'LOGIN' && a.action !== 'LOGOUT');
      const lastActivityAt = nonLoginNonLogout.length > 0 ? nonLoginNonLogout[nonLoginNonLogout.length - 1].createdAt : session.createdAt
      const endTime = logoutEvent ? logoutEvent.createdAt : lastActivityAt
      const durationMs = endTime.getTime() - session.createdAt.getTime();
      const durationStr = formatDuration(durationMs, !logoutEvent);

      const userName = `${session.user.firstName || ''} ${session.user.lastName || ''}`.trim() || session.user.email;
      const roleName = session.user.roles?.[0]?.role?.displayName || 'User';

      return {
        id: session.id,
        userName,
        email: session.user.email,
        role: roleName,
        department: session.user.department || 'N/A',
        loginTime: session.createdAt.toISOString(), // Return full ISO timestamp for proper timezone conversion
        logoutTime: logoutEvent ? logoutEvent.createdAt.toISOString() : null,
        duration: durationStr,
        ipAddress: session.ipAddress || 'N/A',
        device: session.userAgent || 'Unknown Device',
        actionsPerformed: nonLoginNonLogout.length,
        status: logoutEvent ? 'Completed' : 'Active',
        pagesViewed: nonLoginNonLogout.filter(a => a.action === 'VIEW').length,
        documentsAccessed: nonLoginNonLogout.filter(a => a.entity === 'Document' && a.action === 'VIEW').length,
        downloads: nonLoginNonLogout.filter(a => a.action === 'DOWNLOAD').length,
        recentActions: nonLoginNonLogout.slice(-5).reverse().map(a => ({
          action: a.action,
          entityName: a.description || `${a.entity} ${a.entityId || ''}`,
          module: a.entity || 'System',
          time: a.createdAt.toISOString() // Return full ISO for proper conversion
        }))
      };
    })
  );

  const validActivities = sessionActivities.filter(a => a !== null);

  return ResponseFormatter.success(
    res,
    {
      activities: validActivities,
      total: filteredSessions.length
    },
    'User activities retrieved successfully'
  );
}));

/**
 * Get user activity statistics
 * GET /api/audit/user-activities/stats
 */
router.get('/user-activities/stats', authorizePermission('logsReport.userActivity', 'view'), asyncHandler(async (req, res) => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Get today's sessions (logins)
  const todayLogins = await prisma.auditLog.count({
    where: {
      action: 'LOGIN',
      createdAt: { gte: todayStart }
    }
  });

  // Get active sessions (logged in but not logged out)
  const allLogins = await prisma.auditLog.findMany({
    where: {
      action: 'LOGIN',
      createdAt: { gte: todayStart }
    },
    select: { userId: true, id: true, createdAt: true },
    orderBy: { createdAt: 'asc' }
  });

  const logouts = await prisma.auditLog.findMany({
    where: {
      action: 'LOGOUT',
      createdAt: { gte: todayStart }
    },
    select: { userId: true, createdAt: true }
  });

  const loginsByUser = new Map()
  for (const login of allLogins) {
    if (!loginsByUser.has(login.userId)) loginsByUser.set(login.userId, [])
    loginsByUser.get(login.userId).push(login)
  }
  const logoutsByUser = new Map()
  for (const l of logouts) {
    if (!logoutsByUser.has(l.userId)) logoutsByUser.set(l.userId, [])
    logoutsByUser.get(l.userId).push(l.createdAt)
  }
  for (const [userId, arr] of logoutsByUser.entries()) {
    arr.sort((a, b) => a.getTime() - b.getTime())
    logoutsByUser.set(userId, arr)
  }

  const activeUserIds = new Set()
  let totalDuration = 0;

  await Promise.all(allLogins.map(async (login) => {
    const userLogins = loginsByUser.get(login.userId) || []
    const idx = userLogins.findIndex(l => l.id === login.id)
    const nextLoginAt = idx >= 0 && idx < userLogins.length - 1 ? userLogins[idx + 1].createdAt : null
    const upperBound = nextLoginAt || now

    const userLogouts = logoutsByUser.get(login.userId) || []
    const logoutTime = userLogouts.find(t => t > login.createdAt && t < upperBound) || null

    if (logoutTime) {
      totalDuration += (logoutTime.getTime() - login.createdAt.getTime());
      return
    }

    activeUserIds.add(login.userId)
    const lastActivity = await prisma.auditLog.findFirst({
      where: {
        userId: login.userId,
        createdAt: { gte: login.createdAt, lt: upperBound },
        action: { notIn: ['LOGIN', 'LOGOUT'] }
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true }
    })
    const endTime = lastActivity?.createdAt || login.createdAt
    totalDuration += (endTime.getTime() - login.createdAt.getTime());
  }))

  const avgDuration = allLogins.length > 0 ? totalDuration / allLogins.length : 0;
  const avgHours = Math.floor(avgDuration / (1000 * 60 * 60));
  const avgMinutes = Math.floor((avgDuration % (1000 * 60 * 60)) / (1000 * 60));

  // Total actions today
  const totalActions = await prisma.auditLog.count({
    where: {
      createdAt: { gte: todayStart },
      action: { not: 'LOGIN' }
    }
  });

  return ResponseFormatter.success(
    res,
    {
      stats: {
        activeUsers: activeUserIds.size,
        totalSessionsToday: todayLogins,
        avgSessionDuration: `${avgHours}h ${avgMinutes}m`,
        totalActionsToday: totalActions
      }
    },
    'Statistics retrieved successfully'
  );
}));

/**
 * Export user activities as CSV
 * GET /api/audit/user-activities/export
 */
router.get('/user-activities/export', authorizePermission('logsReport.userActivity', 'view', 'export'), asyncHandler(async (req, res) => {
  const { dateRange = '7days', user, department, status, search } = req.query;
  
  // Build date filter
  const now = new Date();
  let startDate = new Date();
  if (dateRange === 'today') {
    startDate.setHours(0, 0, 0, 0);
  } else {
    const daysMap = { '7days': 7, '30days': 30, '90days': 90 };
    const days = daysMap[dateRange] || 7;
    startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }

  // Get sessions
  const sessionWhere = {
    action: 'LOGIN',
    createdAt: { gte: startDate }
  };

  if (user && user !== 'all') {
    sessionWhere.userId = parseInt(user);
  }

  const sessions = await prisma.auditLog.findMany({
    where: sessionWhere,
    include: {
      user: {
        select: {
          email: true,
          firstName: true,
          lastName: true,
          department: true,
          roles: { include: { role: { select: { displayName: true } } } }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  // Filter by department
  let filteredSessions = sessions;
  if (department && department !== 'all') {
    filteredSessions = sessions.filter(s => s.user?.department === department);
  }

  // Build CSV
  const csvRows = [
    ['User', 'Email', 'Role', 'Department', 'Login Time', 'Logout Time', 'Duration', 'IP Address', 'Actions', 'Status']
  ];

  for (const session of filteredSessions) {
    if (!session.user) continue;

    const nowForSession = new Date()
    const nextLoginAt = await getNextLoginTime(session.userId, session.createdAt)
    const upperBound = nextLoginAt || nowForSession

    const userActivities = await prisma.auditLog.findMany({
      where: {
        userId: session.userId,
        createdAt: { gte: session.createdAt, lt: upperBound }
      }
    });

    const logoutEvent = userActivities.find(a => a.action === 'LOGOUT' && a.createdAt > session.createdAt);
    const nonLoginNonLogout = userActivities.filter(a => a.action !== 'LOGIN' && a.action !== 'LOGOUT');
    const lastActivityAt = nonLoginNonLogout.length > 0 ? nonLoginNonLogout[nonLoginNonLogout.length - 1].createdAt : session.createdAt
    const endTime = logoutEvent ? logoutEvent.createdAt : lastActivityAt
    const durationMs = endTime.getTime() - session.createdAt.getTime();
    const durationStr = formatDuration(durationMs, !logoutEvent)

    const userName = `${session.user.firstName || ''} ${session.user.lastName || ''}`.trim() || session.user.email;
    const roleName = session.user.roles?.[0]?.role?.displayName || 'User';

    // Format timestamps for CSV export in local time
    const formatCSVDate = (date) => {
      const d = new Date(date);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const seconds = String(d.getSeconds()).padStart(2, '0');
      return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
    };

    csvRows.push([
      userName,
      session.user.email,
      roleName,
      session.user.department || 'N/A',
      formatCSVDate(session.createdAt),
      logoutEvent ? formatCSVDate(logoutEvent.createdAt) : 'Still Active',
      durationStr,
      session.ipAddress || 'N/A',
      nonLoginNonLogout.length,
      logoutEvent ? 'Completed' : 'Active'
    ]);
  }

  const csv = csvRows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=user_activities_${new Date().toISOString().split('T')[0]}.csv`);
  res.send(csv);
}));

/**
 * Get analytics data
 * GET /api/audit/analytics
 */
router.get('/analytics', authorizePermission('logsReport.analytics', 'view'), asyncHandler(async (req, res) => {
  const { range = '30days' } = req.query;
  
  const now = new Date();
  const daysMap = { '7days': 7, '30days': 30, '90days': 90, 'year': 365 };
  const days = daysMap[range] || 30;
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  // Previous period for trend comparison
  const prevStartDate = new Date(startDate.getTime() - days * 24 * 60 * 60 * 1000);

  // Get 7-day activity timeline
  const last7Days = [];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);

    const [events, documents] = await Promise.all([
      prisma.auditLog.count({
        where: {
          createdAt: { gte: date, lt: nextDay }
        }
      }),
      prisma.auditLog.count({
        where: {
          createdAt: { gte: date, lt: nextDay },
          entity: 'Document'
        }
      })
    ]);

    last7Days.push({
      day: dayNames[date.getDay()],
      events,
      documents
    });
  }

  // Get various analytics for current period
  const [
    totalLogs,
    failedLogins,
    successfulLogins,
    totalUsers,
    totalDocuments,
    documentsByStatus,
    topUsers,
    actionsByType,
    moduleUsage,
    // Previous period data for trends
    prevTotalLogs,
    prevFailedLogins,
    prevDocuments
  ] = await Promise.all([
    prisma.auditLog.count({
      where: { createdAt: { gte: startDate } }
    }),
    prisma.auditLog.count({
      where: {
        createdAt: { gte: startDate },
        action: 'LOGIN_FAILED'
      }
    }),
    prisma.auditLog.count({
      where: {
        createdAt: { gte: startDate },
        action: 'LOGIN'
      }
    }),
    prisma.user.count({
      where: { status: 'ACTIVE' }
    }),
    prisma.document.count(),
    prisma.document.groupBy({
      by: ['status'],
      _count: true
    }),
    prisma.auditLog.groupBy({
      by: ['userId'],
      where: {
        createdAt: { gte: startDate },
        userId: { not: null }
      },
      _count: true,
      orderBy: { _count: { userId: 'desc' } },
      take: 5
    }),
    prisma.auditLog.groupBy({
      by: ['action'],
      where: { createdAt: { gte: startDate } },
      _count: true,
      orderBy: { _count: { action: 'desc' } },
      take: 8
    }),
    prisma.auditLog.groupBy({
      by: ['entity'],
      where: {
        createdAt: { gte: startDate },
        entity: { not: null }
      },
      _count: true
    }),
    // Previous period counts
    prisma.auditLog.count({
      where: { createdAt: { gte: prevStartDate, lt: startDate } }
    }),
    prisma.auditLog.count({
      where: { createdAt: { gte: prevStartDate, lt: startDate }, action: 'LOGIN_FAILED' }
    }),
    prisma.document.count({
      where: { createdAt: { gte: prevStartDate, lt: startDate } }
    })
  ]);

  // Calculate trends
  const calcTrend = (current, previous) => {
    if (previous === 0) return current > 0 ? { percent: 100, direction: 'up' } : { percent: 0, direction: 'same' };
    const change = ((current - previous) / previous) * 100;
    return {
      percent: Math.abs(Math.round(change)),
      direction: change > 0 ? 'up' : change < 0 ? 'down' : 'same'
    };
  };

  const eventsTrend = calcTrend(totalLogs, prevTotalLogs);
  const failedLoginsTrend = calcTrend(failedLogins, prevFailedLogins);
  const documentsTrend = calcTrend(totalDocuments, prevDocuments);

  // Format top users with names
  const topUsersFormatted = await Promise.all(
    topUsers.map(async (item) => {
      const user = await prisma.user.findUnique({
        where: { id: item.userId },
        select: { firstName: true, lastName: true, email: true }
      });
      const name = user
        ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email
        : 'Unknown';
      const initials = user
        ? `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || user.email.substring(0, 2).toUpperCase()
        : 'UK';
      return {
        name,
        avatar: initials,
        actions: item._count,
        trend: 'same'
      };
    })
  );

  // Calculate module usage percentages with different colors
  const moduleColors = {
    'Auth': 'bg-indigo-500',
    'Document': 'bg-blue-500',
    'Workflow': 'bg-purple-500',
    'User': 'bg-green-500',
    'Role': 'bg-yellow-500',
    'System': 'bg-gray-500',
    'Configuration': 'bg-orange-500',
    'Backup': 'bg-teal-500'
  };
  const totalModuleLogs = moduleUsage.reduce((sum, m) => sum + m._count, 0);
  const moduleUsageFormatted = moduleUsage
    .sort((a, b) => b._count - a._count)
    .map(m => ({
      name: m.entity,
      value: totalModuleLogs > 0 ? Math.round((m._count / totalModuleLogs) * 100) : 0,
      color: moduleColors[m.entity] || 'bg-gray-400'
    }));

  // Calculate top activities percentages
  const totalActions = actionsByType.reduce((sum, a) => sum + a._count, 0);
  const topActivities = actionsByType.map(a => ({
    name: a.action,
    count: a._count,
    percentage: totalActions > 0 ? Math.round((a._count / totalActions) * 100) : 0
  }));

  // Format document status with all possible statuses
  const documentStatus = documentsByStatus.map(ds => {
    const statusMap = {
      'PUBLISHED': { label: 'Published', color: 'bg-green-500' },
      'DRAFT': { label: 'Draft', color: 'bg-gray-400' },
      'PENDING_REVIEW': { label: 'Pending Review', color: 'bg-yellow-500' },
      'IN_REVIEW': { label: 'In Review', color: 'bg-blue-500' },
      'PENDING_APPROVAL': { label: 'Pending Approval', color: 'bg-orange-500' },
      'REJECTED': { label: 'Rejected', color: 'bg-red-500' },
      'OBSOLETE': { label: 'Obsolete', color: 'bg-gray-600' },
      'SUPERSEDED': { label: 'Superseded', color: 'bg-purple-500' }
    };
    const mapped = statusMap[ds.status] || { label: ds.status, color: 'bg-gray-500' };
    return {
      status: ds.status,
      label: mapped.label,
      count: ds._count,
      color: mapped.color
    };
  });

  // Format analytics data with trends
  const analytics = {
    overview: {
      totalEvents: totalLogs,
      totalEventsTrend: eventsTrend,
      activeUsers: totalUsers,
      successfulLogins,
      failedLogins,
      failedLoginsTrend,
      documentsProcessed: totalDocuments,
      documentsTrend
    },
    activityTimeline: last7Days,
    moduleUsage: moduleUsageFormatted.slice(0, 6),
    documentStatus,
    topUsers: topUsersFormatted,
    topActivities
  };

  return ResponseFormatter.success(
    res,
    { analytics },
    'Analytics retrieved successfully'
  );
}));

/**
 * Get audit settings
 * GET /api/audit/settings
 */
router.get('/settings', authorizePermission('configuration.auditSettings', 'view'), asyncHandler(async (req, res) => {
  const auditSettingsService = require('../services/auditSettingsService');
  const settings = await auditSettingsService.getSettings();

  return ResponseFormatter.success(
    res,
    { settings },
    'Audit settings retrieved successfully'
  );
}));

/**
 * Update audit settings (admin only)
 * PUT /api/audit/settings
 */
router.put('/settings', authorizePermission('configuration.auditSettings', 'edit'), asyncHandler(async (req, res) => {
  const auditSettingsService = require('../services/auditSettingsService');
  const {
    retentionDays,
    autoArchiveDays,
    permanentRetention,
    trackAuth,
    trackDocuments,
    trackConfig,
    trackUsers,
    trackDownloads,
    trackPermissions,
    trackFailures,
    alertFailedLogins,
    alertUnauthorized,
    alertBulkExports,
    alertConfigChanges,
    alertEmail
  } = req.body;

  const settingsToSave = {
    retentionDays: parseInt(retentionDays) || 90,
    autoArchiveDays: parseInt(autoArchiveDays) || 365,
    permanentRetention: permanentRetention || false,
    trackAuth: trackAuth !== false,
    trackDocuments: trackDocuments !== false,
    trackConfig: trackConfig !== false,
    trackUsers: trackUsers !== false,
    trackDownloads: trackDownloads !== false,
    trackPermissions: trackPermissions !== false,
    trackFailures: trackFailures !== false,
    alertFailedLogins: alertFailedLogins !== false,
    alertUnauthorized: alertUnauthorized !== false,
    alertBulkExports: alertBulkExports !== false,
    alertConfigChanges: alertConfigChanges !== false,
    alertEmail: alertEmail || ''
  };

  const settings = await auditSettingsService.saveSettings(settingsToSave);

  // Trigger config change alert
  await auditSettingsService.checkSecurityAlert('configChanges', {
    userName: req.user?.email || 'Unknown',
    setting: 'Audit & Log Settings',
    description: 'Audit logging settings were updated'
  });

  return ResponseFormatter.success(
    res,
    { settings },
    'Audit settings updated successfully'
  );
}));

/**
 * Run manual log cleanup
 * POST /api/audit/cleanup
 */
router.post('/cleanup', authorizePermission('configuration.cleanup', 'cleanup'), asyncHandler(async (req, res) => {
  const auditSettingsService = require('../services/auditSettingsService');
  const result = await auditSettingsService.runLogCleanup();

  return ResponseFormatter.success(
    res,
    result,
    `Cleanup complete: ${result.deleted} logs deleted, ${result.archived} logs archived`
  );
}));

module.exports = router;
