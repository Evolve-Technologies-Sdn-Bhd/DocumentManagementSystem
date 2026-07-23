const prisma = require('../config/database');
const { normalizeIp } = require('../utils/clientIp')

class ReportsService {
  async getProjectCategoriesByIds(ids = []) {
    const list = Array.isArray(ids) ? ids : []
    const norm = Array.from(new Set(list.map((x) => parseInt(x, 10)).filter((x) => !Number.isNaN(x))))
    if (norm.length === 0) return []
    return prisma.projectCategory.findMany({
      where: { id: { in: norm } },
      select: { id: true, name: true, code: true }
    })
  }

  async getDocumentsByFileCodes(fileCodes = []) {
    const list = Array.isArray(fileCodes) ? fileCodes : []
    const norm = Array.from(new Set(list.map((x) => String(x || '').trim()).filter(Boolean)))
    if (norm.length === 0) return []
    return prisma.document.findMany({
      where: { fileCode: { in: norm } },
      select: {
        fileCode: true,
        projectCategoryId: true,
        projectCategory: { select: { id: true, name: true, code: true } }
      }
    })
  }

  normalizeVersionSegment(versionSegment) {
    const raw = String(versionSegment || '').trim()
    if (!raw) return ''
    const m = /^(\d+)([a-zA-Z]*)$/.exec(raw)
    if (!m) return raw
    const digitsStr = m[1]
    const suffix = (m[2] || '').toLowerCase()
    const digitsLen = Math.max(2, digitsStr.length)
    return `${digitsStr.padStart(digitsLen, '0')}${suffix}`
  }

  extractVersionSegmentFromFileCode(fileCode) {
    const parts = String(fileCode || '').split('/')
    return this.normalizeVersionSegment(parts[1] || '')
  }

  buildPreviousVersion(versionSegment) {
    const seg = this.normalizeVersionSegment(versionSegment)
    const m = /^(\d+)([a-z]*)$/.exec(seg)
    if (!m) return ''
    const digitsStr = m[1]
    const suffix = m[2] || ''
    const digitsLen = Math.max(2, digitsStr.length)
    if (suffix) return digitsStr.padStart(digitsLen, '0')
    const n = parseInt(digitsStr, 10)
    if (!Number.isFinite(n) || n <= 1) return '01'
    return String(n - 1).padStart(digitsLen, '0')
  }

  buildDateRangeFilter(fieldName, dateFrom, dateTo) {
    const range = {}
    if (dateFrom) range.gte = dateFrom
    if (dateTo) range.lte = dateTo
    return Object.keys(range).length > 0 ? { [fieldName]: range } : {}
  }

  formatOptionalDateRange(dateFrom, dateTo) {
    if (!dateFrom && !dateTo) return null
    return {
      from: dateFrom ? dateFrom.toISOString().split('T')[0] : null,
      to: dateTo ? dateTo.toISOString().split('T')[0] : null
    }
  }

  /**
   * Get report data as JSON for viewing
   */
  async getReportData(reportType, config) {
    const dateFrom = config?.dateFrom ? new Date(config.dateFrom) : null;
    const dateTo = config?.dateTo ? new Date(config.dateTo) : null;
    if (dateTo) {
      dateTo.setHours(23, 59, 59, 999);
    }

    switch (reportType) {
      case 'document-stats':
        return await this.getDocumentStatsData(dateFrom, dateTo, config.filters);
      case 'user-activity':
        return await this.getUserActivityData(dateFrom, dateTo, config.filters);
      case 'document-request':
        return await this.getDocumentRequestData(dateFrom, dateTo, config.filters);
      case 'security-audit':
        return await this.getSecurityAuditData(dateFrom, dateTo, config.filters);
      case 'template-usage':
        return await this.getTemplateUsageData(dateFrom, dateTo);
      case 'storage-usage':
        return await this.getStorageUsageData(config.filters);
      default:
        throw new Error('Unknown report type');
    }
  }

  /**
   * Get document statistics data
   */
  async getDocumentStatsData(dateFrom, dateTo, filters = {}) {
    const where = this.buildDateRangeFilter('createdAt', dateFrom, dateTo);

    if (filters.documentTypeId) {
      where.documentTypeId = filters.documentTypeId;
    }
    if (filters.status) {
      where.status = filters.status;
    }

    const documents = await prisma.document.findMany({
      where,
      include: {
        documentType: true,
        owner: {
          select: { firstName: true, lastName: true, email: true, department: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Calculate summary
    const summary = {
      total: documents.length,
      byStatus: {},
      byType: {}
    };

    documents.forEach(doc => {
      summary.byStatus[doc.status] = (summary.byStatus[doc.status] || 0) + 1;
      const typeName = doc.documentType?.name || 'Unknown';
      summary.byType[typeName] = (summary.byType[typeName] || 0) + 1;
    });

    const rows = documents.map(doc => ({
      id: doc.id,
      fileCode: doc.fileCode,
      title: doc.title,
      documentType: doc.documentType?.name || 'N/A',
      status: doc.status,
      stage: doc.stage,
      version: doc.version,
      owner: doc.owner ? `${doc.owner.firstName || ''} ${doc.owner.lastName || ''}`.trim() || doc.owner.email : 'N/A',
      department: doc.owner?.department || 'N/A',
      createdAt: doc.createdAt.toISOString().split('T')[0],
      updatedAt: doc.updatedAt.toISOString().split('T')[0]
    }));

    return {
      reportType: 'document-stats',
      title: 'Document Statistics Report',
      generatedAt: new Date().toISOString(),
      dateRange: this.formatOptionalDateRange(dateFrom, dateTo),
      summary,
      columns: [
        { key: 'fileCode', label: 'File Code' },
        { key: 'title', label: 'Title' },
        { key: 'documentType', label: 'Document Type' },
        { key: 'status', label: 'Status' },
        { key: 'stage', label: 'Stage' },
        { key: 'version', label: 'Version' },
        { key: 'owner', label: 'Owner' },
        { key: 'department', label: 'Department' },
        { key: 'createdAt', label: 'Created Date' }
      ],
      rows
    };
  }

  /**
   * Get user activity data
   */
  async getUserActivityData(dateFrom, dateTo, filters = {}) {
    const where = this.buildDateRangeFilter('createdAt', dateFrom, dateTo);

    const activities = await prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true, department: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 1000
    });

    // Filter by department if specified
    let filteredActivities = activities;
    if (filters.department && filters.department !== 'all') {
      filteredActivities = activities.filter(a => a.user?.department === filters.department);
    }

    // Calculate summary
    const userActions = {};
    const actionTypes = {};
    filteredActivities.forEach(a => {
      const userName = a.user ? `${a.user.firstName || ''} ${a.user.lastName || ''}`.trim() || a.user.email : 'System';
      userActions[userName] = (userActions[userName] || 0) + 1;
      actionTypes[a.action] = (actionTypes[a.action] || 0) + 1;
    });

    const summary = {
      totalActivities: filteredActivities.length,
      uniqueUsers: Object.keys(userActions).length,
      topUsers: Object.entries(userActions).sort((a, b) => b[1] - a[1]).slice(0, 5),
      actionBreakdown: actionTypes
    };

    const rows = filteredActivities.map(a => ({
      id: a.id,
      timestamp: a.createdAt.toISOString().replace('T', ' ').substring(0, 19),
      user: a.user ? `${a.user.firstName || ''} ${a.user.lastName || ''}`.trim() || a.user.email : 'System',
      email: a.user?.email || 'N/A',
      department: a.user?.department || 'N/A',
      action: a.action,
      module: a.entity || 'System',
      ipAddress: (a.ipAddress ? normalizeIp(a.ipAddress) : '') || 'N/A'
    }));

    return {
      reportType: 'user-activity',
      title: 'User Activity Summary',
      generatedAt: new Date().toISOString(),
      dateRange: this.formatOptionalDateRange(dateFrom, dateTo),
      summary,
      columns: [
        { key: 'timestamp', label: 'Timestamp' },
        { key: 'user', label: 'User' },
        { key: 'department', label: 'Department' },
        { key: 'action', label: 'Action' },
        { key: 'module', label: 'Module' },
        { key: 'ipAddress', label: 'IP Address' }
      ],
      rows
    };
  }

  /**
   * Get security audit data - shows all audit log activities
   */
  async getSecurityAuditData(dateFrom, dateTo, filters = {}) {
    // Get ALL audit logs, not just security-specific ones
    const where = this.buildDateRangeFilter('createdAt', dateFrom, dateTo);

    // Filter by action type if specified
    if (filters.action && filters.action !== 'all') {
      where.action = filters.action;
    }

    // Filter by entity/module if specified
    if (filters.module && filters.module !== 'all') {
      where.entity = filters.module;
    }

    const logs = await prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 1000 // Limit for performance
    });

    const summary = {
      totalEvents: logs.length,
      logins: logs.filter(l => l.action === 'LOGIN').length,
      failedLogins: logs.filter(l => l.action === 'LOGIN_FAILED').length,
      permissionChanges: logs.filter(l => ['ROLE_CREATE', 'ROLE_UPDATE', 'ROLE_DELETE', 'ROLE_ASSIGN', 'ROLE_REMOVE'].includes(l.action)).length
    };

    const rows = logs.map(log => ({
      id: log.id,
      timestamp: log.createdAt.toISOString().replace('T', ' ').substring(0, 19),
      user: log.user ? `${log.user.firstName || ''} ${log.user.lastName || ''}`.trim() || log.user.email : 'System',
      module: log.entity || 'System',
      action: log.action,
      description: log.description || '-',
      ipAddress: (log.ipAddress ? normalizeIp(log.ipAddress) : '') || '::1',
      status: log.action.includes('FAILED') || log.action.includes('REJECT') ? 'Failed' : 'Success'
    }));

    return {
      reportType: 'security-audit',
      title: 'Security & Audit Report',
      generatedAt: new Date().toISOString(),
      dateRange: this.formatOptionalDateRange(dateFrom, dateTo),
      summary,
      columns: [
        { key: 'timestamp', label: 'Timestamp' },
        { key: 'user', label: 'User' },
        { key: 'module', label: 'Module' },
        { key: 'action', label: 'Action' },
        { key: 'description', label: 'Description' },
        { key: 'ipAddress', label: 'IP Address' },
        { key: 'status', label: 'Status' }
      ],
      rows
    };
  }

  /**
   * Get document request data (Version Requests)
   */
  formatRequestLabel(value) {
    return String(value || '')
      .toLowerCase()
      .split('_')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ') || 'N/A'
  }

  formatDocumentRequestStatus(status, source) {
    const statusMaps = {
      ndr: {
        PENDING_ACKNOWLEDGMENT: 'Pending Acknowledgment',
        ACKNOWLEDGED: 'Acknowledged',
        REJECTED: 'Rejected'
      },
      version: {
        PENDING_REVIEW: 'Pending Acknowledgment',
        IN_REVIEW: 'In Review',
        PENDING_APPROVAL: 'Pending Approval',
        IN_APPROVAL: 'In Approval',
        APPROVED: 'Acknowledged',
        REJECTED: 'Rejected'
      },
      supersede: {
        PENDING_REVIEW: 'Pending Review',
        IN_REVIEW: 'In Review',
        PENDING_APPROVAL: 'Pending Approval',
        IN_APPROVAL: 'In Approval',
        APPROVED: 'Approved',
        REJECTED: 'Rejected'
      }
    }

    return statusMaps[source]?.[status] || this.formatRequestLabel(status)
  }

  formatDocumentRequestStage(stage) {
    const stageMap = {
      ACKNOWLEDGMENT: 'Pending Acknowledgment',
      REVIEW: 'Review',
      APPROVAL: 'Approval',
      COMPLETED: 'Completed',
      DRAFT: 'Draft',
      PUBLISHED: 'Published',
      SUPERSEDED: 'Superseded',
      OBSOLETE: 'Obsolete'
    }

    return stageMap[stage] || this.formatRequestLabel(stage)
  }

  formatReportUserName(user) {
    if (!user) return 'N/A'
    const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim()
    return fullName || user.email || 'N/A'
  }

  formatDisplayFileCode(fileCode) {
    if (!fileCode || String(fileCode).startsWith('PENDING-')) return '-'
    return fileCode
  }

  async buildDocumentRequestReport(dateFrom, dateTo, filters = {}) {
    const requestWindow = this.buildDateRangeFilter('createdAt', dateFrom, dateTo)

    const ndrWhere = {
      ...requestWindow,
      OR: [
        { status: { in: ['PENDING_ACKNOWLEDGMENT', 'ACKNOWLEDGED', 'REJECTED'] } },
        { stage: 'ACKNOWLEDGMENT' }
      ]
    }

    if (filters.status) {
      ndrWhere.OR = [{ status: filters.status }, { stage: filters.status }]
    }

    const requestWhere = { ...requestWindow }
    if (filters.status) {
      requestWhere.status = filters.status
    }

    const [newDocumentRequests, versionRequests, supersedeRequests] = await Promise.all([
      prisma.document.findMany({
        where: ndrWhere,
        include: {
          documentType: true,
          createdBy: {
            select: { firstName: true, lastName: true, email: true, department: true }
          }
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
      }),
      prisma.versionRequest.findMany({
        where: requestWhere,
        include: {
          requestedBy: {
            select: { firstName: true, lastName: true, email: true, department: true }
          },
          document: {
            include: {
              documentType: true
            }
          }
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
      }),
      prisma.supersedeObsoleteRequest.findMany({
        where: requestWhere,
        include: {
          requestedBy: {
            select: { firstName: true, lastName: true, email: true, department: true }
          },
          document: {
            include: {
              documentType: true
            }
          }
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
      })
    ])

    const supersedeOnlyCount = supersedeRequests.filter((req) => req.actionType === 'SUPERSEDE').length
    const obsoleteOnlyCount = supersedeRequests.filter((req) => req.actionType === 'OBSOLETE').length

    const summary = {
      total: newDocumentRequests.length + versionRequests.length + supersedeRequests.length,
      newDocumentRequests: newDocumentRequests.length,
      versionRequests: versionRequests.length,
      supersedeRequests: supersedeOnlyCount,
      obsoleteRequests: obsoleteOnlyCount,
      supersedeObsoleteRequests: supersedeRequests.length,
      byStatus: {}
    }

    const rows = [
      ...newDocumentRequests.map((doc) => ({
        id: `ndr-${doc.id}`,
        requestNumber: `NDR-${doc.id}`,
        requestType: 'New Document Request',
        documentCode: this.formatDisplayFileCode(doc.fileCode),
        documentTitle: doc.title || 'N/A',
        documentType: doc.documentType?.name || 'N/A',
        reason: doc.description?.substring(0, 50) + (doc.description?.length > 50 ? '...' : ''),
        status: this.formatDocumentRequestStatus(doc.status, 'ndr'),
        stage: this.formatDocumentRequestStage(doc.stage),
        requestedBy: this.formatReportUserName(doc.createdBy),
        department: doc.createdBy?.department || 'N/A',
        createdAt: doc.createdAt.toISOString().split('T')[0],
        sortTimestamp: doc.createdAt.getTime()
      })),
      ...versionRequests.map((req) => ({
        id: `nvr-${req.id}`,
        requestNumber: `NVR-${req.id}`,
        requestType: 'Version Request',
        documentCode: this.formatDisplayFileCode(req.document?.fileCode),
        documentTitle: req.document?.title || 'N/A',
        documentType: req.document?.documentType?.name || 'N/A',
        reason: req.reasonForRevision?.substring(0, 50) + (req.reasonForRevision?.length > 50 ? '...' : ''),
        status: this.formatDocumentRequestStatus(req.status, 'version'),
        stage: this.formatDocumentRequestStage(req.stage),
        requestedBy: this.formatReportUserName(req.requestedBy),
        department: req.requestedBy?.department || 'N/A',
        createdAt: req.createdAt.toISOString().split('T')[0],
        sortTimestamp: req.createdAt.getTime()
      })),
      ...supersedeRequests.map((req) => ({
        id: `${req.actionType === 'SUPERSEDE' ? 'sup' : 'obs'}-${req.id}`,
        requestNumber: `${req.actionType === 'SUPERSEDE' ? 'SUP' : 'OBS'}-${req.id}`,
        requestType: req.actionType === 'SUPERSEDE' ? 'Supersede Request' : 'Obsolete Request',
        documentCode: this.formatDisplayFileCode(req.document?.fileCode),
        documentTitle: req.document?.title || 'N/A',
        documentType: req.document?.documentType?.name || 'N/A',
        reason: req.reason?.substring(0, 50) + (req.reason?.length > 50 ? '...' : ''),
        status: this.formatDocumentRequestStatus(req.status, 'supersede'),
        stage: this.formatDocumentRequestStage(req.stage),
        requestedBy: this.formatReportUserName(req.requestedBy),
        department: req.requestedBy?.department || 'N/A',
        createdAt: req.createdAt.toISOString().split('T')[0],
        sortTimestamp: req.createdAt.getTime()
      }))
    ]
      .sort((a, b) => b.sortTimestamp - a.sortTimestamp)
      .map(({ sortTimestamp, ...row }) => row)

    rows.forEach((row) => {
      summary.byStatus[row.status] = (summary.byStatus[row.status] || 0) + 1
    })

    return { summary, rows }
  }

  async getDocumentRequestData(dateFrom, dateTo, filters = {}) {
    const { summary, rows } = await this.buildDocumentRequestReport(dateFrom, dateTo, filters);

    return {
      reportType: 'document-request',
      title: 'Document Request Report',
      generatedAt: new Date().toISOString(),
      dateRange: this.formatOptionalDateRange(dateFrom, dateTo),
      summary,
      columns: [
        { key: 'requestNumber', label: 'Request #' },
        { key: 'requestType', label: 'Type' },
        { key: 'documentCode', label: 'Document Code' },
        { key: 'documentTitle', label: 'Document Title' },
        { key: 'documentType', label: 'Document Type' },
        { key: 'status', label: 'Status' },
        { key: 'stage', label: 'Stage' },
        { key: 'requestedBy', label: 'Requested By' },
        { key: 'createdAt', label: 'Created Date' }
      ],
      rows
    };
  }

  /**
   * Get storage usage data
   */
  async getStorageUsageData(filters = {}) {
    const versions = await prisma.documentVersion.findMany({
      include: {
        document: {
          include: {
            documentType: true,
            owner: {
              select: { firstName: true, lastName: true, department: true }
            }
          }
        }
      }
    });

    const formatBytes = (bytes) => {
      if (!bytes || bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    };

    let totalStorage = 0;
    const storageByDept = {};
    const storageByType = {};

    versions.forEach(v => {
      const size = v.fileSize || 0;
      totalStorage += size;
      const dept = v.document?.owner?.department || 'Unknown';
      storageByDept[dept] = (storageByDept[dept] || 0) + size;
      const ext = v.fileName?.split('.').pop()?.toUpperCase() || 'OTHER';
      storageByType[ext] = (storageByType[ext] || 0) + size;
    });

    const summary = {
      totalStorage: formatBytes(totalStorage),
      totalStorageBytes: totalStorage,
      totalFiles: versions.length,
      averageFileSize: formatBytes(versions.length > 0 ? totalStorage / versions.length : 0),
      byDepartment: Object.entries(storageByDept).map(([dept, size]) => ({ department: dept, size: formatBytes(size), bytes: size })),
      byFileType: Object.entries(storageByType).map(([type, size]) => ({ type, size: formatBytes(size), bytes: size }))
    };

    const rows = versions
      .sort((a, b) => (b.fileSize || 0) - (a.fileSize || 0))
      .slice(0, 100)
      .map(v => ({
        id: v.id,
        fileName: v.fileName,
        documentTitle: v.document?.title || 'N/A',
        fileCode: v.document?.fileCode || 'N/A',
        size: formatBytes(v.fileSize),
        sizeBytes: v.fileSize || 0,
        fileType: v.fileName?.split('.').pop()?.toUpperCase() || 'N/A',
        department: v.document?.owner?.department || 'N/A',
        uploadedAt: v.uploadedAt?.toISOString().split('T')[0] || 'N/A'
      }));

    return {
      reportType: 'storage-usage',
      title: 'Storage Usage Report',
      generatedAt: new Date().toISOString(),
      summary,
      columns: [
        { key: 'fileName', label: 'File Name' },
        { key: 'documentTitle', label: 'Document' },
        { key: 'fileCode', label: 'File Code' },
        { key: 'size', label: 'Size' },
        { key: 'fileType', label: 'Type' },
        { key: 'department', label: 'Department' },
        { key: 'uploadedAt', label: 'Uploaded' }
      ],
      rows
    };
  }

  /**
   * Get template usage data
   */
  async getTemplateUsageData(dateFrom, dateTo) {
    const documentsWhere = this.buildDateRangeFilter('createdAt', dateFrom, dateTo)
    const documentTypes = await prisma.documentType.findMany({
      include: {
        _count: { select: { documents: true } },
        documents: {
          where: documentsWhere,
          select: { status: true, createdAt: true }
        }
      }
    });

    const summary = {
      totalTemplates: documentTypes.length,
      totalDocumentsCreated: documentTypes.reduce((sum, dt) => sum + dt.documents.length, 0)
    };

    const rows = documentTypes.map(dt => ({
      id: dt.id,
      name: dt.name,
      prefix: dt.prefix,
      totalDocuments: dt._count.documents,
      documentsInPeriod: dt.documents.length,
      published: dt.documents.filter(d => d.status === 'PUBLISHED').length,
      draft: dt.documents.filter(d => d.status === 'DRAFT').length
    }));

    return {
      reportType: 'template-usage',
      title: 'Template Usage Report',
      generatedAt: new Date().toISOString(),
      dateRange: this.formatOptionalDateRange(dateFrom, dateTo),
      summary,
      columns: [
        { key: 'name', label: 'Template Name' },
        { key: 'prefix', label: 'Prefix' },
        { key: 'totalDocuments', label: 'Total Documents' },
        { key: 'documentsInPeriod', label: 'In Period' },
        { key: 'published', label: 'Published' },
        { key: 'draft', label: 'Draft' }
      ],
      rows
    };
  }

  /**
   * Get compliance audit data
   */
  async getComplianceAuditData(dateFrom, dateTo, filters = {}) {
    const logs = await prisma.auditLog.findMany({
      where: {
        createdAt: { gte: dateFrom, lte: dateTo }
      },
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true, department: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 2000
    });

    const actionCounts = {};
    logs.forEach(l => {
      actionCounts[l.action] = (actionCounts[l.action] || 0) + 1;
    });

    const summary = {
      totalRecords: logs.length,
      actionBreakdown: Object.entries(actionCounts).map(([action, count]) => ({ action, count }))
    };

    const rows = logs.map(log => ({
      id: log.id,
      timestamp: log.createdAt.toISOString().replace('T', ' ').substring(0, 19),
      user: log.user ? `${log.user.firstName || ''} ${log.user.lastName || ''}`.trim() || log.user.email : 'System',
      department: log.user?.department || 'N/A',
      action: log.action,
      entity: log.entity || 'N/A',
      entityId: log.entityId || 'N/A',
      ipAddress: (log.ipAddress ? normalizeIp(log.ipAddress) : '') || 'N/A'
    }));

    return {
      reportType: 'compliance-audit',
      title: 'Compliance Audit Trail',
      generatedAt: new Date().toISOString(),
      dateRange: { from: dateFrom.toISOString().split('T')[0], to: dateTo.toISOString().split('T')[0] },
      summary,
      columns: [
        { key: 'timestamp', label: 'Timestamp' },
        { key: 'user', label: 'User' },
        { key: 'department', label: 'Department' },
        { key: 'action', label: 'Action' },
        { key: 'entity', label: 'Entity' },
        { key: 'entityId', label: 'Entity ID' },
        { key: 'ipAddress', label: 'IP Address' }
      ],
      rows
    };
  }

  /**
   * Get performance metrics data
   */
  async getPerformanceMetricsData(dateFrom, dateTo) {
    const [totalDocs, totalUsers, activeUsers, logins, failedLogins, docsCreated] = await Promise.all([
      prisma.document.count(),
      prisma.user.count(),
      prisma.user.count({ where: { status: 'ACTIVE' } }),
      prisma.auditLog.count({ where: { action: 'LOGIN', createdAt: { gte: dateFrom, lte: dateTo } } }),
      prisma.auditLog.count({ where: { action: 'FAILED_LOGIN', createdAt: { gte: dateFrom, lte: dateTo } } }),
      prisma.document.count({ where: { createdAt: { gte: dateFrom, lte: dateTo } } })
    ]);

    const summary = {
      totalDocuments: totalDocs,
      totalUsers,
      activeUsers,
      logins,
      failedLogins,
      loginSuccessRate: logins + failedLogins > 0 ? ((logins / (logins + failedLogins)) * 100).toFixed(1) + '%' : '100%',
      documentsCreatedInPeriod: docsCreated
    };

    // Daily activity for the period
    const dailyActivity = [];
    const daysDiff = Math.ceil((dateTo.getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24));
    const daysToShow = Math.min(daysDiff, 30);

    for (let i = daysToShow - 1; i >= 0; i--) {
      const date = new Date(dateTo);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);

      const count = await prisma.auditLog.count({
        where: { createdAt: { gte: date, lt: nextDay } }
      });

      dailyActivity.push({
        date: date.toISOString().split('T')[0],
        events: count
      });
    }

    return {
      reportType: 'performance-metrics',
      title: 'System Performance Metrics',
      generatedAt: new Date().toISOString(),
      dateRange: { from: dateFrom.toISOString().split('T')[0], to: dateTo.toISOString().split('T')[0] },
      summary,
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'events', label: 'Events' }
      ],
      rows: dailyActivity
    };
  }

  /**
   * Get document register
   */
  async getDocumentRegister(filters = {}) {
    const { documentType, status, startDate, endDate, projectCategoryId } = filters;
    const where = {};

    if (documentType) where.documentType = documentType;
    if (status) where.status = status;
    if (projectCategoryId !== undefined && projectCategoryId !== null) {
      const pcId = parseInt(projectCategoryId, 10)
      if (!Number.isNaN(pcId)) where.projectCategoryId = pcId
    }
    if (startDate || endDate) {
      where.registeredDate = {};
      if (startDate) where.registeredDate.gte = new Date(startDate);
      if (endDate) where.registeredDate.lte = new Date(endDate);
    }

    const rows = await prisma.documentRegister.findMany({
      where,
      orderBy: { registeredDate: 'desc' }
    })

    return rows.filter((r) => {
      const vSeg = this.extractVersionSegmentFromFileCode(r.fileCode)
      return !vSeg || vSeg === '01'
    })
  }

  /**
   * Get version register - queries approved VersionRequests which represent new versions
   */
  async getVersionRegister(filters = {}) {
    const { fileCode, startDate, endDate, previousVersion, owner, projectCategoryId } = filters;
    const where = {
      status: 'APPROVED',
      newDocumentId: { not: null }
    };

    if (startDate || endDate) {
      where.approvedAt = {};
      if (startDate) where.approvedAt.gte = new Date(startDate);
      if (endDate) where.approvedAt.lte = new Date(endDate);
    }

    // Get approved version requests
    const versionRequests = await prisma.versionRequest.findMany({
      where,
      include: {
        document: {
          include: {
            documentType: true,
            owner: true,
            projectCategory: true
          }
        },
        newDocument: {
          include: {
            documentType: true,
            projectCategory: true
          }
        },
        requestedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: { approvedAt: 'desc' }
    });

    // Format the data for version register
    let records = versionRequests.map(vr => {
      // Extract version from file code (e.g., MOM/01/... -> 01)
      const originalParts = vr.document?.fileCode?.split('/') || [];
      const newParts = vr.newDocument?.fileCode?.split('/') || [];
      const prevVersion = originalParts[1] ? this.normalizeVersionSegment(originalParts[1]) : this.extractVersionSegmentFromFileCode(vr.document?.fileCode);
      const newVersion = newParts[1] ? this.normalizeVersionSegment(newParts[1]) : this.extractVersionSegmentFromFileCode(vr.newDocument?.fileCode);
      
      return {
        id: vr.id,
        fileCode: vr.newDocument?.fileCode || vr.document?.fileCode,
        documentTitle: vr.newDocument?.title || vr.document?.title,
        projectCategoryId: vr.newDocument?.projectCategoryId ?? vr.document?.projectCategoryId ?? null,
        projectCategory: vr.newDocument?.projectCategory?.name || vr.document?.projectCategory?.name || '',
        previousVersion: prevVersion,
        newVersion: newVersion,
        versionDate: vr.approvedAt,
        updatedBy: vr.requestedBy ? `${vr.requestedBy.firstName} ${vr.requestedBy.lastName}` : 'Unknown',
        changeSummary: vr.reasonForRevision || vr.remarks || 'Version update'
      };
    });

    const versionRequestFileCodes = new Set(
      records
        .map((r) => String(r.fileCode || '').toLowerCase())
        .filter(Boolean)
    )

    const drWhere = {}
    if (projectCategoryId !== undefined && projectCategoryId !== null) {
      const pcId = parseInt(projectCategoryId, 10)
      if (!Number.isNaN(pcId)) drWhere.projectCategoryId = pcId
    }
    if (startDate || endDate) {
      drWhere.registeredDate = {}
      if (startDate) drWhere.registeredDate.gte = new Date(startDate)
      if (endDate) drWhere.registeredDate.lte = new Date(endDate)
    }

    const docRegisters = await prisma.documentRegister.findMany({
      where: drWhere,
      orderBy: { registeredDate: 'desc' }
    })

    const categoryIds = Array.from(
      new Set(
        docRegisters
          .map((r) => r.projectCategoryId)
          .filter((id) => id !== null && id !== undefined)
      )
    )
    const categories = categoryIds.length ? await this.getProjectCategoriesByIds(categoryIds) : []
    const categoryById = new Map(categories.map((c) => [c.id, c]))

    const supplemental = docRegisters
      .filter((r) => {
        const vSeg = this.extractVersionSegmentFromFileCode(r.fileCode)
        if (!vSeg || vSeg === '01') return false
        const fc = String(r.fileCode || '').toLowerCase()
        if (!fc) return false
        return !versionRequestFileCodes.has(fc)
      })
      .map((r) => {
        const vSeg = this.extractVersionSegmentFromFileCode(r.fileCode)
        return {
          id: `dr-${r.id}`,
          fileCode: r.fileCode,
          documentTitle: r.documentTitle,
          projectCategoryId: r.projectCategoryId ?? null,
          projectCategory: categoryById.get(r.projectCategoryId)?.name || '',
          previousVersion: this.buildPreviousVersion(vSeg),
          newVersion: this.normalizeVersionSegment(vSeg),
          versionDate: r.registeredDate,
          updatedBy: r.owner || 'Unknown',
          changeSummary: 'Registered as non-initial version'
        }
      })

    records = [...supplemental, ...records]

    // Apply additional filters
    if (fileCode) {
      records = records.filter(r => r.fileCode?.toLowerCase().includes(fileCode.toLowerCase()));
    }
    if (previousVersion && previousVersion !== 'all') {
      records = records.filter(r => r.previousVersion === previousVersion);
    }
    if (owner && owner !== 'all') {
      records = records.filter(r => r.updatedBy?.toLowerCase().includes(owner.toLowerCase()));
    }
    if (projectCategoryId !== undefined && projectCategoryId !== null) {
      const pcId = parseInt(projectCategoryId, 10)
      if (!Number.isNaN(pcId)) {
        records = records.filter(r => r.projectCategoryId === pcId)
      }
    }

    return records;
  }

  /**
   * Get obsolete register
   */
  async getObsoleteRegister(filters = {}) {
    const { documentType, startDate, endDate, reason } = filters;
    const where = {};

    if (documentType) where.documentType = documentType;
    if (reason) where.reason = { contains: reason };
    if (startDate || endDate) {
      where.obsoleteDate = {};
      if (startDate) where.obsoleteDate.gte = new Date(startDate);
      if (endDate) where.obsoleteDate.lte = new Date(endDate);
    }

    return await prisma.obsoleteRegister.findMany({
      where,
      orderBy: { obsoleteDate: 'desc' }
    });
  }

  /**
   * Get archive register
   */
  async getArchiveRegister(filters = {}) {
    const { fileCode, startDate, endDate, version, currentVersion } = filters;
    const where = {};

    if (fileCode) {
      where.fileCode = { contains: fileCode };
    }
    if (version) {
      where.version = { contains: version };
    }
    if (currentVersion) {
      where.currentVersion = { contains: currentVersion };
    }
    if (startDate || endDate) {
      where.archivedDate = {};
      if (startDate) where.archivedDate.gte = new Date(startDate);
      if (endDate) {
        const endDateObj = new Date(endDate);
        endDateObj.setHours(23, 59, 59, 999);
        where.archivedDate.lte = endDateObj;
      }
    }

    return await prisma.archiveRegister.findMany({
      where,
      orderBy: { archivedDate: 'desc' }
    });
  }

  /**
   * Get audit logs
   */
  async getAuditLogs(filters = {}) {
    const { userId, entity, action, startDate, endDate, limit = 100 } = filters;
    const where = {};

    if (userId) where.userId = parseInt(userId);
    if (entity) where.entity = entity;
    if (action) where.action = action;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    return await prisma.auditLog.findMany({
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
      take: limit
    });
  }

  /**
   * Get dashboard statistics
   */
  async getDashboardStats() {
    const [
      totalDocuments,
      draftCount,
      pendingReview,
      pendingApproval,
      published,
      obsolete,
      totalUsers,
      activeUsers
    ] = await Promise.all([
      prisma.document.count(),
      prisma.document.count({ where: { status: 'DRAFT' } }),
      prisma.document.count({ where: { stage: 'REVIEW' } }),
      prisma.document.count({ where: { stage: 'APPROVAL' } }),
      prisma.document.count({ where: { status: 'PUBLISHED' } }),
      prisma.document.count({ where: { status: 'OBSOLETE' } }),
      prisma.user.count(),
      prisma.user.count({ where: { status: 'ACTIVE' } })
    ]);

    return {
      documents: {
        total: totalDocuments,
        draft: draftCount,
        pendingReview,
        pendingApproval,
        published,
        obsolete
      },
      users: {
        total: totalUsers,
        active: activeUsers
      }
    };
  }

  /**
   * Get document type statistics
   */
  async getDocumentTypeStats() {
    const documentTypes = await prisma.documentType.findMany({
      include: {
        _count: {
          select: { documents: true }
        },
        documents: {
          select: {
            status: true
          }
        }
      }
    });

    return documentTypes.map(dt => ({
      id: dt.id,
      name: dt.name,
      prefix: dt.prefix,
      totalDocuments: dt._count.documents,
      published: dt.documents.filter(d => d.status === 'PUBLISHED').length,
      draft: dt.documents.filter(d => d.status === 'DRAFT').length
    }));
  }

  /**
   * Get recent activity for dashboard
   */
  async getRecentActivity(limit = 10) {
    const recentDocs = await prisma.document.findMany({
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: {
        owner: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            profileImage: true
          }
        }
      }
    });

    return recentDocs.map(doc => {
      const userName = doc.owner.firstName && doc.owner.lastName 
        ? `${doc.owner.firstName} ${doc.owner.lastName}`
        : doc.owner.email;
      
      const timeAgo = this.getTimeAgo(doc.updatedAt);
      
      let action = 'Updated';
      if (doc.status === 'PUBLISHED') action = 'Published';
      else if (doc.status === 'DRAFT') action = 'Created draft';
      else if (doc.stage === 'REVIEW') action = 'Submitted for review';
      else if (doc.stage === 'APPROVAL') action = 'Submitted for approval';
      
      return {
        user: userName,
        document: `${doc.fileCode} - ${doc.title}`,
        action: action,
        when: timeAgo,
        updatedAt: doc.updatedAt,
        profileImage: doc.owner.profileImage
      };
    });
  }

  /**
   * Helper to format time ago
   */
  getTimeAgo(date) {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hrs ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
    return new Date(date).toLocaleDateString();
  }

  /**
   * Get system report statistics
   */
  async getSystemReportStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [generatedToday, scheduledReports, reportsLast30Days] = await Promise.all([
      prisma.generatedReport.count({
        where: {
          createdAt: { gte: today },
          status: 'COMPLETED'
        }
      }),
      prisma.generatedReport.count({
        where: {
          status: 'PENDING'
        }
      }),
      prisma.generatedReport.findMany({
        where: {
          createdAt: { gte: thirtyDaysAgo },
          status: 'COMPLETED',
          fileSize: { not: null }
        },
        select: {
          fileSize: true
        }
      })
    ]);

    const totalSize = reportsLast30Days.reduce((sum, report) => sum + (report.fileSize || 0), 0);
    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(1);

    return {
      availableReports: 6, // Static count of available report types
      generatedToday,
      scheduledReports,
      totalSize: `${totalSizeMB} MB`
    };
  }

  /**
   * Get recent generated reports
   */
  async getRecentReports({ page = 1, limit = 10, userId }) {
    const skip = (page - 1) * limit;

    const [total, reports] = await Promise.all([
      prisma.generatedReport.count({
        where: { status: 'COMPLETED' }
      }),
      prisma.generatedReport.findMany({
        where: { status: 'COMPLETED' },
        include: {
          generatedBy: {
            select: {
              firstName: true,
              lastName: true,
              email: true
            }
          }
        },
        orderBy: { completedAt: 'desc' },
        skip,
        take: limit
      })
    ]);

    const formattedReports = reports.map(report => {
      const sizeMB = report.fileSize ? `${(report.fileSize / (1024 * 1024)).toFixed(1)} MB` : 'N/A';
      const sizeKB = report.fileSize && report.fileSize < 1024 * 1024 
        ? `${(report.fileSize / 1024).toFixed(0)} KB` 
        : sizeMB;

      return {
        id: report.id,
        name: report.reportName,
        generatedAt: report.completedAt 
          ? report.completedAt.toISOString().replace('T', ' ').substring(0, 19)
          : report.createdAt.toISOString().replace('T', ' ').substring(0, 19),
        format: report.format,
        size: report.fileSize < 1024 * 1024 ? sizeKB : sizeMB,
        status: report.status === 'COMPLETED' ? 'Completed' : report.status
      };
    });

    return {
      reports: formattedReports,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Generate report (creates CSV format for now)
   */
  async generateReport({ reportType, config, userId }) {
    const fs = require('fs');
    const path = require('path');

    // Create reports directory if it doesn't exist
    const reportsDir = path.join(__dirname, '../../uploads/reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    // Map report types to names
    const reportNames = {
      'document-stats': 'Document Statistics Report',
      'user-activity': 'User Activity Report',
      'document-request': 'Document Request Report',
      'security-audit': 'Security & Audit Report',
      'template-usage': 'Template Usage Report',
      'storage-usage': 'Storage Usage Report'
    };

    const reportName = reportNames[reportType] || 'System Report';
    // Always use CSV format since that's what we generate
    const format = 'csv';
    const timestamp = Date.now();
    const fileName = `${reportType}_${timestamp}.${format}`;
    const filePath = path.join(reportsDir, fileName);

    // Create report record
    const report = await prisma.generatedReport.create({
      data: {
        reportType,
        reportName,
        format: format.toUpperCase(),
        status: 'GENERATING',
        config: config || {},
        generatedById: userId
      }
    });

    try {
      // Generate report based on type
      let csvData = '';

      switch (reportType) {
        case 'document-stats':
          csvData = await this.generateDocumentStatsCSV(config);
          break;
        case 'user-activity':
          csvData = await this.generateUserActivityCSV(config);
          break;
        case 'document-request':
          csvData = await this.generateDocumentRequestCSV(config);
          break;
        case 'security-audit':
          csvData = await this.generateSecurityAuditCSV(config);
          break;
        case 'template-usage':
          csvData = await this.generateTemplateUsageCSV(config);
          break;
        case 'storage-usage':
          csvData = await this.generateStorageUsageCSV(config);
          break;
        default:
          csvData = 'Report Type,Status\n';
          csvData += `"${reportName}","Not yet implemented"\n`;
      }

      // Write file
      fs.writeFileSync(filePath, csvData);
      const fileSize = fs.statSync(filePath).size;

      // Update report record
      await prisma.generatedReport.update({
        where: { id: report.id },
        data: {
          filePath,
          fileSize,
          status: 'COMPLETED',
          completedAt: new Date()
        }
      });

      return {
        id: report.id,
        name: reportName,
        format: format.toUpperCase(),
        status: 'COMPLETED'
      };
    } catch (error) {
      // Mark report as failed
      await prisma.generatedReport.update({
        where: { id: report.id },
        data: { status: 'FAILED' }
      });
      throw error;
    }
  }

  /**
   * Download report
   */
  async downloadReport(reportId, userId) {
    const report = await prisma.generatedReport.findUnique({
      where: { id: reportId }
    });

    if (!report || !report.filePath || report.status !== 'COMPLETED') {
      return null;
    }

    const path = require('path');
    const fileName = path.basename(report.filePath);

    return {
      filePath: report.filePath,
      fileName: report.reportName.replace(/\s+/g, '_') + '.' + report.format.toLowerCase()
    };
  }

  /**
   * Generate Document Statistics CSV
   */
  async generateDocumentStatsCSV(config) {
    const stats = await this.getDashboardStats();
    const typeStats = await this.getDocumentTypeStats();

    let csv = 'Metric,Value\n';
    csv += `"Total Documents","${stats.documents.total}"\n`;
    csv += `"Draft Documents","${stats.documents.draft}"\n`;
    csv += `"Pending Review","${stats.documents.pendingReview}"\n`;
    csv += `"Pending Approval","${stats.documents.pendingApproval}"\n`;
    csv += `"Published Documents","${stats.documents.published}"\n`;
    csv += `"Obsolete Documents","${stats.documents.obsolete}"\n`;
    csv += `\n`;
    csv += `"Document Type","Total","Published","Draft"\n`;
    
    typeStats.forEach(type => {
      csv += `"${type.name}","${type.totalDocuments}","${type.published}","${type.draft}"\n`;
    });

    return csv;
  }

  /**
   * Generate User Activity CSV
   */
  async generateUserActivityCSV(config) {
    const dateFrom = config?.dateFrom || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const dateTo = config?.dateTo || new Date();

    const activities = await prisma.auditLog.findMany({
      where: {
        createdAt: {
          gte: new Date(dateFrom),
          lte: new Date(dateTo)
        }
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            department: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 1000
    });

    let csv = 'Timestamp,User,Email,Department,Action,Entity,IP Address\n';
    
    activities.forEach(activity => {
      const userName = activity.user 
        ? `${activity.user.firstName || ''} ${activity.user.lastName || ''}`.trim() || activity.user.email
        : 'System';
      const email = activity.user?.email || 'N/A';
      const dept = activity.user?.department || 'N/A';
      const timestamp = activity.createdAt.toISOString().replace('T', ' ').substring(0, 19);
      
      csv += `"${timestamp}","${userName}","${email}","${dept}","${activity.action}","${activity.entity || 'N/A'}","${activity.ipAddress || 'N/A'}"\n`;
    });

    return csv;
  }

  /**
   * Generate Document Request CSV
   */
  async generateDocumentRequestCSV(config) {
    const dateFrom = config?.dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dateTo = config?.dateTo || new Date();
    const normalizedDateFrom = new Date(dateFrom)
    const normalizedDateTo = new Date(dateTo)
    normalizedDateTo.setHours(23, 59, 59, 999)
    const { summary, rows } = await this.buildDocumentRequestReport(normalizedDateFrom, normalizedDateTo, config?.filters || {});

    let csv = 'Document Request Report\n';
    csv += `Report Generated,"${new Date().toISOString().replace('T', ' ').substring(0, 19)}"\n`;
    csv += `Date Range,"${new Date(dateFrom).toLocaleDateString()} - ${new Date(dateTo).toLocaleDateString()}"\n\n`;

    csv += 'Summary Statistics\n';
    csv += 'Metric,Value\n';
    csv += `"Total Requests","${summary.total}"\n`;
    csv += `"New Document Requests","${summary.newDocumentRequests}"\n`;
    csv += `"Version Requests","${summary.versionRequests}"\n`;
    csv += `"Supersede Requests","${summary.supersedeRequests}"\n`;
    csv += `"Obsolete Requests","${summary.obsoleteRequests}"\n`;
    csv += `"Supersede/Obsolete Requests","${summary.supersedeObsoleteRequests}"\n`;
    Object.entries(summary.byStatus).forEach(([status, count]) => {
      csv += `"${status}","${count}"\n`;
    });
    csv += '\n';

    csv += 'Request Details\n';
    csv += 'Request #,Type,Document Code,Document Title,Document Type,Requested By,Department,Status,Stage,Created Date\n';

    rows.forEach((row) => {
      csv += `"${row.requestNumber}","${row.requestType}","${row.documentCode}","${row.documentTitle}","${row.documentType}","${row.requestedBy}","${row.department}","${row.status}","${row.stage}","${row.createdAt}"\n`;
    });

    return csv;
  }

  /**
   * Generate Security Audit CSV - includes all audit log activities
   */
  async generateSecurityAuditCSV(config) {
    const dateFrom = config?.dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dateTo = config?.dateTo || new Date();

    // Get ALL audit logs for comprehensive security audit
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        createdAt: {
          gte: new Date(dateFrom),
          lte: new Date(dateTo)
        }
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    let csv = 'Timestamp,User,Module,Action,Description,IP Address,Status\n';
    
    auditLogs.forEach(log => {
      const userName = log.user 
        ? `${log.user.firstName || ''} ${log.user.lastName || ''}`.trim() || log.user.email
        : 'System';
      const timestamp = log.createdAt.toISOString().replace('T', ' ').substring(0, 19);
      const status = log.action.includes('FAILED') || log.action.includes('REJECT') ? 'Failed' : 'Success';
      const description = (log.description || '-').replace(/"/g, '""'); // Escape quotes for CSV
      
      csv += `"${timestamp}","${userName}","${log.entity || 'System'}","${log.action}","${description}","${log.ipAddress || '::1'}","${status}"\n`;
    });

    return csv;
  }

  /**
   * Generate Workflow Status Report CSV
   */
  async generateWorkflowStatusCSV(config) {
    const dateFrom = config?.dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dateTo = config?.dateTo || new Date();

    // Get documents by workflow stage
    const documents = await prisma.document.findMany({
      where: {
        updatedAt: {
          gte: new Date(dateFrom),
          lte: new Date(dateTo)
        }
      },
      include: {
        documentType: true,
        owner: {
          select: { firstName: true, lastName: true, email: true }
        },
        approvalHistory: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    // Calculate workflow statistics
    const stats = {
      pendingReview: documents.filter(d => d.stage === 'REVIEW').length,
      pendingApproval: documents.filter(d => d.stage === 'APPROVAL').length,
      published: documents.filter(d => d.status === 'PUBLISHED').length,
      rejected: documents.filter(d => d.status === 'REJECTED').length,
      draft: documents.filter(d => d.status === 'DRAFT').length
    };

    // Calculate average approval time
    const approvedDocs = documents.filter(d => d.status === 'PUBLISHED');
    let totalApprovalTime = 0;
    let approvedCount = 0;

    for (const doc of approvedDocs) {
      if (doc.publishedAt && doc.createdAt) {
        totalApprovalTime += (new Date(doc.publishedAt).getTime() - new Date(doc.createdAt).getTime());
        approvedCount++;
      }
    }

    const avgApprovalDays = approvedCount > 0 
      ? Math.round(totalApprovalTime / approvedCount / (1000 * 60 * 60 * 24) * 10) / 10 
      : 0;

    let csv = 'Workflow Status Report\n';
    csv += `Report Generated,"${new Date().toISOString().replace('T', ' ').substring(0, 19)}"\n`;
    csv += `Date Range,"${new Date(dateFrom).toLocaleDateString()} - ${new Date(dateTo).toLocaleDateString()}"\n\n`;
    
    csv += 'Summary Statistics\n';
    csv += `Metric,Value\n`;
    csv += `"Pending Review","${stats.pendingReview}"\n`;
    csv += `"Pending Approval","${stats.pendingApproval}"\n`;
    csv += `"Published","${stats.published}"\n`;
    csv += `"Rejected","${stats.rejected}"\n`;
    csv += `"Draft","${stats.draft}"\n`;
    csv += `"Average Approval Time (days)","${avgApprovalDays}"\n\n`;

    csv += 'Document Details\n';
    csv += 'File Code,Title,Document Type,Owner,Status,Stage,Created Date,Last Updated\n';
    
    documents.forEach(doc => {
      const ownerName = doc.owner 
        ? `${doc.owner.firstName || ''} ${doc.owner.lastName || ''}`.trim() || doc.owner.email
        : 'N/A';
      csv += `"${doc.fileCode}","${doc.title}","${doc.documentType?.name || 'N/A'}","${ownerName}","${doc.status}","${doc.stage}","${doc.createdAt.toISOString().split('T')[0]}","${doc.updatedAt.toISOString().split('T')[0]}"\n`;
    });

    return csv;
  }

  /**
   * Generate Storage Usage Report CSV
   */
  async generateStorageUsageCSV(config) {
    // Get all document versions with file sizes
    const versions = await prisma.documentVersion.findMany({
      include: {
        document: {
          include: {
            documentType: true,
            owner: {
              select: { firstName: true, lastName: true, email: true, department: true }
            }
          }
        }
      }
    });

    // Calculate storage by department
    const storageByDept = {};
    const storageByType = {};
    let totalStorage = 0;

    versions.forEach(v => {
      const size = v.fileSize || 0;
      totalStorage += size;

      const dept = v.document?.owner?.department || 'Unknown';
      storageByDept[dept] = (storageByDept[dept] || 0) + size;

      const ext = v.fileName?.split('.').pop()?.toUpperCase() || 'OTHER';
      storageByType[ext] = (storageByType[ext] || 0) + size;
    });

    const formatBytes = (bytes) => {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    };

    let csv = 'Storage Usage Report\n';
    csv += `Report Generated,"${new Date().toISOString().replace('T', ' ').substring(0, 19)}"\n\n`;

    csv += 'Overall Statistics\n';
    csv += `Metric,Value\n`;
    csv += `"Total Storage Used","${formatBytes(totalStorage)}"\n`;
    csv += `"Total Files","${versions.length}"\n`;
    csv += `"Average File Size","${formatBytes(versions.length > 0 ? totalStorage / versions.length : 0)}"\n\n`;

    csv += 'Storage by Department\n';
    csv += 'Department,Size,Percentage\n';
    Object.entries(storageByDept)
      .sort((a, b) => b[1] - a[1])
      .forEach(([dept, size]) => {
        const pct = totalStorage > 0 ? ((size / totalStorage) * 100).toFixed(1) : 0;
        csv += `"${dept}","${formatBytes(size)}","${pct}%"\n`;
      });

    csv += '\nStorage by File Type\n';
    csv += 'File Type,Size,Count,Percentage\n';
    const typeCount = {};
    versions.forEach(v => {
      const ext = v.fileName?.split('.').pop()?.toUpperCase() || 'OTHER';
      typeCount[ext] = (typeCount[ext] || 0) + 1;
    });
    Object.entries(storageByType)
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, size]) => {
        const pct = totalStorage > 0 ? ((size / totalStorage) * 100).toFixed(1) : 0;
        csv += `"${type}","${formatBytes(size)}","${typeCount[type] || 0}","${pct}%"\n`;
      });

    // Add largest files
    csv += '\nLargest Files (Top 20)\n';
    csv += 'File Name,Document,Size,Uploaded Date\n';
    const sortedVersions = [...versions].sort((a, b) => (b.fileSize || 0) - (a.fileSize || 0)).slice(0, 20);
    sortedVersions.forEach(v => {
      csv += `"${v.fileName}","${v.document?.title || 'N/A'}","${formatBytes(v.fileSize || 0)}","${v.uploadedAt?.toISOString().split('T')[0] || 'N/A'}"\n`;
    });

    return csv;
  }

  /**
   * Generate Template Usage Report CSV
   */
  async generateTemplateUsageCSV(config) {
    // Get document types as "templates"
    const documentTypes = await prisma.documentType.findMany({
      include: {
        _count: {
          select: { documents: true }
        },
        documents: {
          select: { status: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 100
        }
      }
    });

    let csv = 'Template Usage Report\n';
    csv += `Report Generated,"${new Date().toISOString().replace('T', ' ').substring(0, 19)}"\n\n`;

    csv += 'Template Summary\n';
    csv += 'Template Name,Prefix,Total Documents,Published,Draft,Last Used\n';
    
    documentTypes.forEach(dt => {
      const published = dt.documents.filter(d => d.status === 'PUBLISHED').length;
      const draft = dt.documents.filter(d => d.status === 'DRAFT').length;
      const lastUsed = dt.documents[0]?.createdAt?.toISOString().split('T')[0] || 'Never';
      csv += `"${dt.name}","${dt.prefix}","${dt._count.documents}","${published}","${draft}","${lastUsed}"\n`;
    });

    csv += '\nUsage Trends (Last 30 Days)\n';
    csv += 'Date,Documents Created\n';
    
    // Get daily document creation counts
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentDocs = await prisma.document.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true }
    });

    const dailyCounts = {};
    recentDocs.forEach(doc => {
      const date = doc.createdAt.toISOString().split('T')[0];
      dailyCounts[date] = (dailyCounts[date] || 0) + 1;
    });

    Object.entries(dailyCounts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([date, count]) => {
        csv += `"${date}","${count}"\n`;
      });

    return csv;
  }

  /**
   * Generate Compliance Audit Trail CSV
   */
  async generateComplianceAuditCSV(config) {
    const dateFrom = config?.dateFrom || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const dateTo = config?.dateTo || new Date();

    // Get all audit logs for compliance
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        createdAt: {
          gte: new Date(dateFrom),
          lte: new Date(dateTo)
        }
      },
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true, department: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 5000
    });

    let csv = 'Compliance Audit Trail Report\n';
    csv += `Report Generated,"${new Date().toISOString().replace('T', ' ').substring(0, 19)}"\n`;
    csv += `Date Range,"${new Date(dateFrom).toLocaleDateString()} - ${new Date(dateTo).toLocaleDateString()}"\n`;
    csv += `Total Records,"${auditLogs.length}"\n\n`;

    csv += 'Summary by Action Type\n';
    csv += 'Action,Count\n';
    const actionCounts = {};
    auditLogs.forEach(log => {
      actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;
    });
    Object.entries(actionCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([action, count]) => {
        csv += `"${action}","${count}"\n`;
      });

    csv += '\nDetailed Audit Log\n';
    csv += 'Timestamp,User,Email,Department,Action,Entity,Entity ID,IP Address,Details\n';
    
    auditLogs.forEach(log => {
      const userName = log.user 
        ? `${log.user.firstName || ''} ${log.user.lastName || ''}`.trim() || log.user.email
        : 'System';
      const email = log.user?.email || 'N/A';
      const dept = log.user?.department || 'N/A';
      const timestamp = log.createdAt.toISOString().replace('T', ' ').substring(0, 19);
      const details = (log.description || '').replace(/"/g, '""').substring(0, 200);
      
      csv += `"${timestamp}","${userName}","${email}","${dept}","${log.action}","${log.entity || 'N/A'}","${log.entityId || 'N/A'}","${log.ipAddress || 'N/A'}","${details}"\n`;
    });

    return csv;
  }

  /**
   * Generate System Performance Metrics CSV
   */
  async generatePerformanceMetricsCSV(config) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get various system metrics
    const [
      totalDocs,
      totalUsers,
      activeUsers,
      totalLogins,
      failedLogins,
      documentsCreated,
      documentsPublished
    ] = await Promise.all([
      prisma.document.count(),
      prisma.user.count(),
      prisma.user.count({ where: { status: 'ACTIVE' } }),
      prisma.auditLog.count({ where: { action: 'LOGIN', createdAt: { gte: thirtyDaysAgo } } }),
      prisma.auditLog.count({ where: { action: 'FAILED_LOGIN', createdAt: { gte: thirtyDaysAgo } } }),
      prisma.document.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.document.count({ where: { status: 'PUBLISHED', updatedAt: { gte: thirtyDaysAgo } } })
    ]);

    // Get daily activity counts
    const dailyActivity = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);

      const count = await prisma.auditLog.count({
        where: {
          createdAt: { gte: date, lt: nextDay }
        }
      });
      dailyActivity.push({ date: date.toISOString().split('T')[0], count });
    }

    let csv = 'System Performance Metrics Report\n';
    csv += `Report Generated,"${new Date().toISOString().replace('T', ' ').substring(0, 19)}"\n\n`;

    csv += 'System Overview\n';
    csv += 'Metric,Value\n';
    csv += `"Total Documents","${totalDocs}"\n`;
    csv += `"Total Users","${totalUsers}"\n`;
    csv += `"Active Users","${activeUsers}"\n`;
    csv += `"System Uptime","99.9%"\n\n`;

    csv += 'Last 30 Days Activity\n';
    csv += 'Metric,Value\n';
    csv += `"Total Logins","${totalLogins}"\n`;
    csv += `"Failed Login Attempts","${failedLogins}"\n`;
    csv += `"Login Success Rate","${totalLogins > 0 ? ((1 - failedLogins / (totalLogins + failedLogins)) * 100).toFixed(1) : 100}%"\n`;
    csv += `"Documents Created","${documentsCreated}"\n`;
    csv += `"Documents Published","${documentsPublished}"\n\n`;

    csv += 'Daily Activity (Last 30 Days)\n';
    csv += 'Date,Events\n';
    dailyActivity.forEach(day => {
      csv += `"${day.date}","${day.count}"\n`;
    });

    return csv;
  }
}

module.exports = new ReportsService();
