const express = require('express');
const prisma = require('../config/database');
const configService = require('../services/configService');
const reportsService = require('../services/reportsService');
const documentService = require('../services/documentService')
const codeRegistryService = require('../services/codeRegistryService');
const auditLogService = require('../services/auditLogService');
const documentAssignmentService = require('../services/documentAssignmentService')
const confidentialAccessService = require('../services/confidentialAccessService')
const folderPermissionService = require('../services/folderPermissionService')
const { authenticate, authorize } = require('../middleware/auth');
const ResponseFormatter = require('../utils/responseFormatter');
const asyncHandler = require('../utils/asyncHandler');
const { ForbiddenError } = require('../utils/errors')

const router = express.Router();

router.use(authenticate);

const requirePermission = (moduleKey, action = 'view') => {
  return (req, res, next) => {
    const allowed = !!req.user?.permissions?.[moduleKey]?.[action]
    if (!allowed) return next(new ForbiddenError("You don't have permission to perform this action"))
    next()
  }
}

router.use('/master-record', requirePermission('masterRecord', 'view'));
router.use('/activity-logs', requirePermission('logsReport.activityLogs', 'view'));

// Config endpoints
router.get('/config/document-types', asyncHandler(async (req, res) => {
  const documentTypes = await configService.getDocumentTypes();
  return ResponseFormatter.success(res, { documentTypes });
}));

router.get('/config/roles', asyncHandler(async (req, res) => {
  const roles = await configService.getRoles();
  return ResponseFormatter.success(res, { roles });
}));

router.get('/config/workflows', asyncHandler(async (req, res) => {
  const workflows = await configService.getWorkflows();
  return ResponseFormatter.success(res, { workflows });
}));

router.get('/config/users', authorize('admin'), asyncHandler(async (req, res) => {
  const { status, roleId } = req.query;
  const users = await configService.getUsers({ status, roleId });
  return ResponseFormatter.success(res, { users });
}));

router.get('/config/settings', authorize('admin'), asyncHandler(async (req, res) => {
  const { key } = req.query;
  const settings = await configService.getConfiguration(key);
  return ResponseFormatter.success(res, { settings });
}));

// Master records
router.get('/master-record/new-documents', asyncHandler(async (req, res) => {
  const { dateFrom, dateTo, type, owner, search, projectCategoryId, documentTypeId, ownerId } = req.query;
  let documentType = type && type !== 'all' ? type : undefined
  let resolvedDocumentTypeId
  if (documentTypeId && documentTypeId !== 'all') {
    const docTypes = await configService.getDocumentTypes()
    const match = docTypes.find((dt) => String(dt.id) === String(documentTypeId))
    documentType = match?.name || documentType
    resolvedDocumentTypeId = match?.id ? parseInt(match.id, 10) : undefined
  } else if (documentType) {
    const docTypes = await configService.getDocumentTypes()
    const match = docTypes.find((dt) => String(dt.name || '').toLowerCase() === String(documentType).toLowerCase())
    resolvedDocumentTypeId = match?.id ? parseInt(match.id, 10) : undefined
  }

  let ownerName = owner && owner !== 'all' ? owner : undefined
  let resolvedOwnerId
  if (ownerId && ownerId !== 'all') {
    const user = await prisma.user.findUnique({
      where: { id: parseInt(ownerId, 10) },
      select: { firstName: true, lastName: true, email: true }
    })
    if (user) {
      ownerName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || ownerName
      resolvedOwnerId = parseInt(ownerId, 10)
    }
  }
  const roleIds = req.user ? await folderPermissionService.getRoleIdsByNames(req.user.roles || []) : []
  const where = {
    AND: [
      documentAssignmentService.buildAccessWhereClause(req.user.id, roleIds),
      confidentialAccessService.buildConfidentialWhereClause(req.user, roleIds)
    ]
  }
  if (resolvedDocumentTypeId) where.documentTypeId = resolvedDocumentTypeId
  if (resolvedOwnerId) where.ownerId = resolvedOwnerId
  if (projectCategoryId && projectCategoryId !== 'all') {
    const pcId = parseInt(projectCategoryId, 10)
    if (!Number.isNaN(pcId)) where.projectCategoryId = pcId
  }
  if (dateFrom || dateTo) {
    where.createdAt = {}
    if (dateFrom) where.createdAt.gte = new Date(dateFrom)
    if (dateTo) where.createdAt.lte = new Date(dateTo)
  }
  if (search) {
    where.AND.push({
      OR: [
        { fileCode: { contains: search } },
        { title: { contains: search } },
        { description: { contains: search } },
        { versions: { some: { fileName: { contains: search } } } }
      ]
    })
  }

  const allCandidateDocuments = await prisma.document.findMany({
    where,
    include: {
      documentType: true,
      projectCategory: true,
      owner: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          department: true
        }
      },
      versions: {
        select: { fileName: true },
        orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
        take: 1
      }
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
  })
  const documents = allCandidateDocuments.filter((doc) => {
    const versionSegment = reportsService.extractVersionSegmentFromFileCode(doc.fileCode)
    return !versionSegment || versionSegment === '01'
  })
  // #region debug-point A:new-documents-mapping
  fetch('http://127.0.0.1:7777/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'master-record-preview-link',
      runId: 'pre-fix',
      hypothesisId: 'A',
      location: 'reports.js:/master-record/new-documents',
      msg: '[DEBUG] Built master record document mapping',
      data: {
        userId: req.user?.id ?? null,
        roleNames: req.user?.roles || [],
        totalCandidateDocuments: allCandidateDocuments.length,
        totalVersion01Documents: documents.length,
        sampleMappings: documents.slice(0, 10).map((doc) => ({
          documentId: doc.id,
          fileCode: doc.fileCode,
          projectCategoryId: doc.projectCategoryId ?? null,
          title: doc.title,
          status: doc.status,
          fileName: doc.versions?.[0]?.fileName ?? null
        }))
      },
      ts: Date.now()
    })
  }).catch(() => {})
  // #endregion
  
  // Format for frontend
  let formattedRecords = documents.map(doc => ({
    id: doc.id,
    documentId: doc.id,
    fileCode: doc.fileCode,
    title: doc.title,
    fileName: doc.versions?.[0]?.fileName || null,
    type: doc.documentType?.name || documentType || '',
    projectCategoryId: doc.projectCategoryId ?? null,
    projectCategory: doc.projectCategory?.name || '',
    version: reportsService.extractVersionSegmentFromFileCode(doc.fileCode) || doc.version,
    owner: `${doc.owner?.firstName || ''} ${doc.owner?.lastName || ''}`.trim() || doc.owner?.email || '',
    department: doc.owner?.department || '',
    status: doc.status,
    registeredDate: doc.createdAt ? new Date(doc.createdAt).toLocaleDateString('en-GB') : ''
  }));
  
  // Filter by owner
  if (ownerName) {
    const needle = String(ownerName).toLowerCase()
    formattedRecords = formattedRecords.filter(r => String(r.owner || '').toLowerCase().includes(needle));
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

router.get('/master-record/document-register', asyncHandler(async (req, res) => {
  const { documentType, status, startDate, endDate } = req.query;
  const records = await reportsService.getDocumentRegister({ documentType, status, startDate, endDate });
  return ResponseFormatter.success(res, { records });
}));

router.get('/master-record/version-register', asyncHandler(async (req, res) => {
  const { fileCode, startDate, endDate, dateFrom, dateTo, search, type, owner, previousVersion, projectCategoryId } = req.query;
  const records = await reportsService.getVersionRegister({
    fileCode: search || fileCode,
    startDate: startDate || dateFrom,
    endDate: endDate || dateTo,
    previousVersion: previousVersion || (type !== 'all' ? type : undefined),
    owner: owner && owner !== 'all' ? owner : undefined,
    projectCategoryId: projectCategoryId && projectCategoryId !== 'all' ? projectCategoryId : undefined
  });
  return ResponseFormatter.success(res, { records });
}));

router.get('/master-record/obsolete-register', asyncHandler(async (req, res) => {
  const { documentType, type, startDate, endDate, dateFrom, dateTo, projectCategoryId, reason } = req.query;
  // Support both 'documentType' and 'type' parameter names, and date filters
  const effectiveType = documentType || (type !== 'all' ? type : undefined);
  const effectiveStartDate = startDate || dateFrom;
  const effectiveEndDate = endDate || dateTo;
  const records = await reportsService.getObsoleteRegister({ 
    documentType: effectiveType, 
    startDate: effectiveStartDate, 
    endDate: effectiveEndDate,
    reason: reason && reason !== 'all' ? reason : undefined
  });

  const fileCodes = Array.from(new Set(records.map((r) => r.fileCode).filter(Boolean)))
  const docs = fileCodes.length
    ? await reportsService.getDocumentsByFileCodes(fileCodes)
    : []
  const docByFileCode = new Map(docs.map((d) => [d.fileCode, d]))
  const pcId = projectCategoryId && projectCategoryId !== 'all' ? parseInt(projectCategoryId, 10) : null

  const enriched = records
    .map((r) => {
      const d = docByFileCode.get(r.fileCode)
      return {
        ...r,
        projectCategoryId: d?.projectCategoryId ?? null,
        projectCategory: d?.projectCategory?.name || ''
      }
    })
    .filter((r) => (pcId && !Number.isNaN(pcId) ? r.projectCategoryId === pcId : true))

  return ResponseFormatter.success(res, { records: enriched });
}));

router.get('/master-record/archive-register', asyncHandler(async (req, res) => {
  const { fileCode, startDate, endDate, dateFrom, dateTo, type, owner, search, projectCategoryId } = req.query;
  // Support frontend parameter names
  const effectiveStartDate = startDate || dateFrom;
  const effectiveEndDate = endDate || dateTo;
  const records = await reportsService.getArchiveRegister({ 
    fileCode: search || fileCode,  // search can be used to filter by fileCode
    startDate: effectiveStartDate, 
    endDate: effectiveEndDate,
    version: type !== 'all' ? type : undefined,
    currentVersion: owner !== 'all' ? owner : undefined
  });

  const fileCodes = Array.from(new Set(records.map((r) => r.fileCode).filter(Boolean)))
  const docs = fileCodes.length
    ? await reportsService.getDocumentsByFileCodes(fileCodes)
    : []
  const docByFileCode = new Map(docs.map((d) => [d.fileCode, d]))
  const pcId = projectCategoryId && projectCategoryId !== 'all' ? parseInt(projectCategoryId, 10) : null

  const enriched = records
    .map((r) => {
      const d = docByFileCode.get(r.fileCode)
      return {
        ...r,
        projectCategoryId: d?.projectCategoryId ?? null,
        projectCategory: d?.projectCategory?.name || ''
      }
    })
    .filter((r) => (pcId && !Number.isNaN(pcId) ? r.projectCategoryId === pcId : true))

  return ResponseFormatter.success(res, { records: enriched });
}));

router.get('/master-record/consolidated', asyncHandler(async (req, res) => {
  const { search, page, limit, export: exportFlag, projectCategoryId } = req.query;
  const result = await codeRegistryService.getConsolidatedMasterRecord(
    { search, export: exportFlag, projectCategoryId: projectCategoryId && projectCategoryId !== 'all' ? projectCategoryId : undefined },
    { page, limit }
  );
  return ResponseFormatter.success(res, { rows: result.rows, pagination: result.pagination });
}));

router.post('/master-record/consolidated/import', authorize('admin'), asyncHandler(async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const result = await codeRegistryService.importLegacyRows(rows, req.user?.id);
  return ResponseFormatter.success(res, result, 'Import completed');
}));

// Analytics
router.get('/dashboard', asyncHandler(async (req, res) => {
  const stats = await reportsService.getDashboardStats();
  const recentActivity = await reportsService.getRecentActivity();
  
  // Format for frontend expectations
  const metrics = {
    drafts: stats.documents.draft,
    pendingReviews: stats.documents.pendingReview,
    published: stats.documents.published,
    superseded: stats.documents.obsolete
  };
  
  return ResponseFormatter.success(res, { metrics, recentActivity });
}));

router.get('/dashboard-stats', asyncHandler(async (req, res) => {
  const stats = await reportsService.getDashboardStats();
  return ResponseFormatter.success(res, { stats });
}));

router.get('/document-type-stats', asyncHandler(async (req, res) => {
  const stats = await reportsService.getDocumentTypeStats();
  return ResponseFormatter.success(res, { stats });
}));

// Activity Logs endpoints
router.get('/activity-logs', asyncHandler(async (req, res) => {
  const { userId, user, module, action, search, dateRange, startDate, endDate, page = 1, limit = 50 } = req.query;
  const effectiveUserId = userId || user; // Support both parameter names
  
  // Calculate date range
  let calculatedStartDate = startDate;
  let calculatedEndDate = endDate;
  
  if (dateRange && !startDate && !endDate) {
    const now = new Date();
    switch (dateRange) {
      case 'today':
        calculatedStartDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'yesterday':
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        calculatedStartDate = new Date(yesterday.setHours(0, 0, 0, 0));
        calculatedEndDate = new Date(yesterday.setHours(23, 59, 59, 999));
        break;
      case '7days':
      case 'last7days':
        calculatedStartDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case '30days':
      case 'last30days':
        calculatedStartDate = new Date(now.setDate(now.getDate() - 30));
        break;
      case '90days':
      case 'last90days':
        calculatedStartDate = new Date(now.setDate(now.getDate() - 90));
        break;
      case 'thisMonth':
        calculatedStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'lastMonth':
        calculatedStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        calculatedEndDate = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
    }
  }
  
  const result = await auditLogService.getLogs({
    userId: effectiveUserId,
    entity: module,
    action,
    search,
    startDate: calculatedStartDate,
    endDate: calculatedEndDate,
    page: parseInt(page),
    limit: parseInt(limit)
  });
  
  return ResponseFormatter.success(res, result);
}));

router.get('/activity-logs/filters', asyncHandler(async (req, res) => {
  const filters = await auditLogService.getFilterOptions();
  return ResponseFormatter.success(res, filters);
}));

router.get('/activity-logs/export', asyncHandler(async (req, res) => {
  const { userId, user, module, action, search, dateRange, startDate, endDate, format = 'csv' } = req.query;
  const effectiveUserId = userId || user; // Support both parameter names
  
  // Calculate date range
  let calculatedStartDate = startDate;
  let calculatedEndDate = endDate;
  
  if (dateRange && !startDate && !endDate) {
    const now = new Date();
    switch (dateRange) {
      case 'today':
        calculatedStartDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case '7days':
      case 'last7days':
        calculatedStartDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case '30days':
      case 'last30days':
        calculatedStartDate = new Date(now.setDate(now.getDate() - 30));
        break;
      case '90days':
      case 'last90days':
        calculatedStartDate = new Date(now.setDate(now.getDate() - 90));
        break;
    }
  }
  
  const result = await auditLogService.getLogs({
    userId: effectiveUserId,
    entity: module,
    action,
    search,
    startDate: calculatedStartDate,
    endDate: calculatedEndDate,
    page: 1,
    limit: 10000 // Export up to 10k records
  });
  
  if (format === 'csv') {
    // Format date for CSV export
    const formatCSVDate = (timestamp) => {
      const d = new Date(timestamp);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const seconds = String(d.getSeconds()).padStart(2, '0');
      return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
    };

    const csv = [
      'Timestamp,User,Module,Action,Description,IP Address,Status',
      ...result.logs.map(log => 
        `"${formatCSVDate(log.timestamp)}","${log.user}","${log.module}","${log.action}","${log.description || ''}","${log.ipAddress || ''}","${log.status}"`
      )
    ].join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=activity-logs-${new Date().toISOString().split('T')[0]}.csv`);
    return res.send(csv);
  }
  
  return ResponseFormatter.success(res, result);
}));

router.get('/audit-logs', authorize('admin'), asyncHandler(async (req, res) => {
  const { userId, entity, action, startDate, endDate, limit } = req.query;
  const logs = await reportsService.getAuditLogs({ userId, entity, action, startDate, endDate, limit });
  return ResponseFormatter.success(res, { logs });
}));

// System Reports
router.get('/system/stats', requirePermission('logsReport.reports', 'view'), asyncHandler(async (req, res) => {
  const stats = await reportsService.getSystemReportStats();
  return ResponseFormatter.success(res, { stats });
}));

router.get('/system/recent', requirePermission('logsReport.reports', 'view'), asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const reports = await reportsService.getRecentReports({
    page: parseInt(page),
    limit: parseInt(limit),
    userId: req.user.id
  });
  return ResponseFormatter.success(res, reports);
}));

router.post('/system/generate', requirePermission('logsReport.reports', 'generate'), asyncHandler(async (req, res) => {
  const { reportType, config } = req.body;
  
  if (!reportType) {
    return ResponseFormatter.validationError(res, [
      { field: 'reportType', message: 'Report type is required' }
    ]);
  }
  
  const report = await reportsService.generateReport({
    reportType,
    config,
    userId: req.user.id
  });
  
  return ResponseFormatter.success(res, { report }, 'Report generated successfully', 201);
}));

// Get report data for viewing (not file download)
router.get('/system/data/:reportType', requirePermission('logsReport.reports', 'view'), asyncHandler(async (req, res) => {
  const { reportType } = req.params;
  const { dateFrom, dateTo, documentTypeId, department, status } = req.query;

  const config = {
    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
    filters: {
      documentTypeId: documentTypeId ? parseInt(documentTypeId) : null,
      department,
      status
    }
  };

  const reportData = await reportsService.getReportData(reportType, config);
  // #region debug-point B:reports-route-response
  fetch('http://127.0.0.1:7777/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'document-request-report',
      runId: 'pre-fix',
      hypothesisId: 'B',
      location: 'backend/src/routes/reports.js:519',
      msg: '[DEBUG] Reports route returning report payload',
      data: {
        reportType,
        dateFrom: config.dateFrom,
        dateTo: config.dateTo,
        summaryKeys: Object.keys(reportData?.summary || {}),
        total: reportData?.summary?.total ?? null,
        rowCount: Array.isArray(reportData?.rows) ? reportData.rows.length : null,
        rowTypes: Array.isArray(reportData?.rows)
          ? Array.from(new Set(reportData.rows.map((row) => row?.requestType).filter(Boolean)))
          : []
      },
      ts: Date.now()
    })
  }).catch(() => {});
  // #endregion
  // Return report data directly (with config merged in)
  return ResponseFormatter.success(res, { ...reportData, appliedConfig: config }, 'Report data retrieved successfully');
}));

router.get('/system/:id/download', requirePermission('logsReport.reports', 'download'), asyncHandler(async (req, res) => {
  const fs = require('fs');
  const reportId = parseInt(req.params.id);
  const result = await reportsService.downloadReport(reportId, req.user.id);
  
  if (!result) {
    return ResponseFormatter.notFound(res, 'Report');
  }

  // Verify file exists
  if (!fs.existsSync(result.filePath)) {
    console.error('Report file not found:', result.filePath);
    return ResponseFormatter.error(res, 'Report file not found on server', 404);
  }

  // Set headers for CSV download
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
  
  // Stream the file
  const fileStream = fs.createReadStream(result.filePath);
  fileStream.pipe(res);
}));

module.exports = router;
