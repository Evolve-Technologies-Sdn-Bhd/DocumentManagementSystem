const prisma = require('../config/database');
const logger = require('../utils/logger');

const CATEGORY_META = {
  CRITICAL: { label: 'Critical', color: '#b91c1c' },
  DEADLINE: { label: 'Deadline', color: '#dc2626' },
  WARNING:  { label: 'Warning',  color: '#d97706' },
  TASK:     { label: 'Task',     color: '#b45309' },
  MILESTONE:{ label: 'Milestone',color: '#2563eb' },
  INFO:     { label: 'Info',     color: '#047857' },
  CUSTOM:   { label: 'Custom',   color: '#7c3aed' }
};

const SOURCE_CATEGORY = {
  DOCUMENT_EXPIRY: 'DEADLINE',
  DOCUMENT_EXPIRY_REMINDER: 'WARNING',
  DOCUMENT_SHARE_EXPIRY: 'TASK',
  PROJECT_START: 'MILESTONE',
  PROJECT_COMPLETION: 'MILESTONE',
  PROJECT_ITEM_DUE: 'DEADLINE',
  ITERATION_START: 'MILESTONE',
  ITERATION_END: 'MILESTONE',
  CHANGE_REQUEST_APPROVED: 'INFO',
  ASSIGNMENT_CREATED: 'TASK',
  WORKFLOW_SLA_DUE: 'CRITICAL',
  DOCUMENT_DATE: 'INFO',
  PUBLISHED_DATE: 'INFO',
  OBSOLETE_DATE: 'INFO',
  VERSION_REQUEST_TARGET: 'DEADLINE',
  TENDER_SUBMISSION_DEADLINE: 'DEADLINE',
  TENDER_FOLLOW_UP: 'TASK',
  TENDER_FOLLOW_UP_LOG: 'TASK',
  FB_ENQUIRY_DATE: 'INFO',
  FB_FOLLOW_UP: 'TASK',
  FB_FOLLOW_UP_LOG: 'TASK',
  CUSTOM: 'CUSTOM'
};

const addDays = (d, n) => {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
};

const normalizeUser = (u) => {
  if (!u) return null;
  return {
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email
  };
};

const buildSynthetic = (row) => ({
  id: `syn_${row._kind}_${row._refId}`,
  synthetic: true,
  title: row._title,
  description: row._description || null,
  startDateTime: row._start,
  endDateTime: row._end || null,
  isAllDay: row._allDay !== false,
  sourceType: row._kind,
  category: SOURCE_CATEGORY[row._kind] || 'INFO',
  priority: row._priority || 0,
  userId: row._userId || null,
  user: row._user || null,
  assigneeId: row._assigneeId || null,
  assignee: row._assignee || null,
  sourceDocumentId: row._docId || null,
  sourceProjectId: row._projectId || null,
  sourceProjectItemId: row._projItemId || null,
  sourceTenderId: row._tenderId || null,
  sourceFbEnquiryId: row._fbId || null,
  sourceVersionRequestId: row._vrId || null,
  sourceShareLinkId: row._shareId || null,
  deepLink: row._link || null,
  extra: row._extra || null,
  createdAt: row._start
});

const getVisibleIdsForUser = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } }
  });
  const isSuper = user?.roles?.some((r) =>
    /admin|administrator|super|document.?controller/i.test(r.role?.name || '')
  );
  return { isSuper: !!isSuper };
};

async function getEventsInRange(userId, from, to, opts = {}) {
  try {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const { includeSources, categories, search } = opts;
    let visCtx = { isSuper: false };
    try {
      visCtx = await getVisibleIdsForUser(userId);
    } catch (e) {
      logger.warn(`[calendar] getVisibleIdsForUser failed (uid=${userId}): ${e?.message || e}`);
    }
    const { isSuper } = visCtx;

    const sourceFilter = (list) => {
      if (!includeSources || includeSources.length === 0) return list;
      return list.filter((k) => includeSources.includes(k));
    };

    const catFilter = (arr) => {
      if (!categories || categories.length === 0) return arr;
      return arr.filter((e) => categories.includes(e.category));
    };

    const results = [];
    let customEvents = [];
    const baseWhere = {
      isSynthetic: false,
      AND: [
        { startDateTime: { lte: toDate } },
        {
          OR: [
            { endDateTime: null },
            { endDateTime: { gte: fromDate } },
            { startDateTime: { gte: fromDate } }
          ]
        },
        {
          OR: [
            { userId: null },
            { userId },
            { assigneeId: userId },
            { viewers: { some: { userId } } }
          ]
        }
      ]
    };
    const legacyWhere = {
      isSynthetic: false,
      AND: [
        { startDateTime: { lte: toDate } },
        {
          OR: [
            { endDateTime: null },
            { endDateTime: { gte: fromDate } },
            { startDateTime: { gte: fromDate } }
          ]
        },
        {
          OR: [
            { userId: null },
            { userId },
            { assigneeId: userId }
          ]
        }
      ]
    };
    try {
      customEvents = await prisma.calendarEvent.findMany({
        where: baseWhere,
        include: {
          customEvent: true,
          user: true,
          assignee: true,
          viewers: {
            include: { user: true }
          }
        },
        orderBy: { startDateTime: 'asc' }
      });
    } catch (e) {
      const msg = String(e?.message || '');
      if (e && /P2022|P2021|viewers|CalendarEventViewer/i.test(msg)) {
        logger.warn('Calendar viewers relation missing, falling back to legacy query. Please run prisma db push on server.');
        try {
          customEvents = await prisma.calendarEvent.findMany({
            where: legacyWhere,
            include: {
              customEvent: true,
              user: true,
              assignee: true
            },
            orderBy: { startDateTime: 'asc' }
          });
        } catch (e2) {
          logger.warn(`[calendar] legacy customEvents query also failed: ${e2?.message || e2}`);
          customEvents = [];
        }
      } else {
        logger.warn(`[calendar] customEvents query failed: ${msg}`);
        customEvents = [];
      }
    }

    for (const ce of customEvents) {
      results.push({
        id: ce.id,
        synthetic: false,
        title: ce.title,
        description: ce.description,
        startDateTime: ce.startDateTime,
        endDateTime: ce.endDateTime,
        isAllDay: ce.isAllDay,
        sourceType: 'CUSTOM',
        category: ce.category,
        priority: ce.priority,
        userId: ce.userId,
        assigneeId: ce.assigneeId,
        assignee: normalizeUser(ce.assignee),
        viewerIds: (ce.viewers || []).map((v) => v.userId),
        viewers: (ce.viewers || []).map((v) => normalizeUser(v.user)),
        customEvent: ce.customEvent ? {
          id: ce.customEvent.id,
          recurrenceRule: ce.customEvent.recurrenceRule,
          colorOverride: ce.customEvent.colorOverride,
          location: ce.customEvent.location,
          createdById: ce.customEvent.createdById
        } : null,
        deepLink: null,
        extra: null,
        createdAt: ce.createdAt
      });
    }

    const safeRun = async (label, fn) => {
      try {
        await fn();
      } catch (e) {
        logger.warn(`[calendar] ${label} failed: ${e?.message || e}`);
      }
    };

    if (sourceFilter(['DOCUMENT_EXPIRY']).length) {
      await safeRun('DOCUMENT_EXPIRY', async () => {
        const rows = await prisma.documentExpiryProfile.findMany({
          where: {
            trackingEnabled: true,
            expiryDate: { gte: addDays(fromDate, -0), lte: toDate }
          },
          include: {
            document: {
              include: {
                owner: true,
                documentType: true
              }
            }
          }
        });
        for (const r of rows) {
          const doc = r.document;
          if (!doc) continue;
          if (!isSuper && doc.ownerId !== userId && doc.createdById !== userId && doc.reviewerId !== userId && doc.firstApproverId !== userId && doc.secondApproverId !== userId) continue;
          results.push(buildSynthetic({
            _kind: 'DOCUMENT_EXPIRY',
            _refId: r.id,
            _title: `Expire: ${doc.title} (${doc.fileCode || '-'})`,
            _description: `Document Type: ${doc.documentType?.name || '-'}`,
            _start: r.expiryDate,
            _docId: doc.id,
            _userId: doc.ownerId,
            _priority: 2,
            _link: `/expiry-tracking`,
            _extra: { fileCode: doc.fileCode || null, expiryStatus: r.expiryStatus || null, renewalStatus: r.renewalStatus || null }
          }));
        }
      });
    }

    if (sourceFilter(['DOCUMENT_EXPIRY_REMINDER']).length) {
      await safeRun('DOCUMENT_EXPIRY_REMINDER', async () => {
        const reminderRows = await prisma.documentExpiryProfile.findMany({
          where: { trackingEnabled: true },
          include: {
            document: { include: { owner: true } }
          }
        });
        for (const r of reminderRows) {
          const doc = r.document;
          if (!r.expiryDate || !doc) continue;
          if (!isSuper && doc.ownerId !== userId && doc.createdById !== userId) continue;
          const offsets = [
            { label: 'Reminder 4', days: r.reminder4Days || 7, priority: 1 },
            { label: 'Reminder 3', days: r.reminder3Days || 30, priority: 1 },
            { label: 'Reminder 2', days: r.reminder2Days || 60, priority: 0 },
            { label: 'Reminder 1', days: r.reminder1Days || 90, priority: 0 }
          ];
          for (const off of offsets) {
            const d = addDays(r.expiryDate, -off.days);
            if (d >= fromDate && d <= toDate) {
              results.push(buildSynthetic({
                _kind: 'DOCUMENT_EXPIRY_REMINDER',
                _refId: `${r.id}_${off.label}`,
                _title: `${off.label} (${off.days}d): ${doc.title}`,
                _start: d,
                _docId: doc.id,
                _userId: doc.ownerId,
                _priority: off.priority,
                _link: `/expiry-tracking`
              }));
            }
          }
        }
      });
    }

    if (sourceFilter(['DOCUMENT_SHARE_EXPIRY']).length) {
      await safeRun('DOCUMENT_SHARE_EXPIRY', async () => {
        const shares = await prisma.documentShareLink.findMany({
          where: { expiresAt: { gte: fromDate, lte: toDate } },
          include: { createdBy: true, document: true }
        });
        for (const s of shares) {
          if (!isSuper && s.createdById !== userId) continue;
          results.push(buildSynthetic({
            _kind: 'DOCUMENT_SHARE_EXPIRY',
            _refId: s.id,
            _title: `Share link expires: ${s.document?.title || 'Document'}`,
            _start: s.expiresAt,
            _allDay: false,
            _shareId: s.id,
            _docId: s.documentId,
            _userId: s.createdById,
            _link: `/documents/my-documents`
          }));
        }
      });
    }

    if (sourceFilter(['PROJECT_START', 'PROJECT_COMPLETION']).length) {
      await safeRun('PROJECT_MILESTONES', async () => {
        const projects = await prisma.project.findMany({
          where: {
            OR: [
              { startDate: { gte: fromDate, lte: toDate } },
              { plannedCompletionDate: { gte: fromDate, lte: toDate } }
            ]
          },
          include: { manager: true, projectCategory: true }
        });
        for (const p of projects) {
          const canSee = isSuper || p.managerId === userId || p.createdById === userId;
          if (!canSee) continue;
          if (p.startDate && p.startDate >= fromDate && p.startDate <= toDate && sourceFilter(['PROJECT_START']).length) {
            results.push(buildSynthetic({
              _kind: 'PROJECT_START',
              _refId: `P_S_${p.id}`,
              _title: `Project Start: ${p.name}`,
              _description: p.description || `Code: ${p.code || '-'}`,
              _start: p.startDate,
              _projectId: p.id,
              _userId: p.managerId,
              _link: `/project-tracking/${p.id}`
            }));
          }
          if (p.plannedCompletionDate && p.plannedCompletionDate >= fromDate && p.plannedCompletionDate <= toDate && sourceFilter(['PROJECT_COMPLETION']).length) {
            results.push(buildSynthetic({
              _kind: 'PROJECT_COMPLETION',
              _refId: `P_C_${p.id}`,
              _title: `Project Due: ${p.name}`,
              _description: p.description || `Code: ${p.code || '-'}`,
              _start: p.plannedCompletionDate,
              _projectId: p.id,
              _userId: p.managerId,
              _priority: 2,
              _link: `/project-tracking/${p.id}`
            }));
          }
        }
      });
    }

    if (sourceFilter(['PROJECT_ITEM_DUE']).length) {
      await safeRun('PROJECT_ITEM_DUE', async () => {
        const items = await prisma.projectIterationDocumentItem.findMany({
          where: { dueDate: { gte: fromDate, lte: toDate } },
          include: {
            documentType: true,
            assignedTo: true,
            iteration: {
              include: {
                project: true,
                currentStage: true
              }
            }
          }
        });
        for (const it of items) {
          const proj = it.iteration?.project;
          if (!proj) continue;
          const canSee = isSuper || it.assignedToId === userId || proj.managerId === userId;
          if (!canSee) continue;
          results.push(buildSynthetic({
            _kind: 'PROJECT_ITEM_DUE',
            _refId: `PI_${it.id}`,
            _title: `Due: ${it.documentType?.name || 'Document'} - ${proj.name}`,
            _description: it.iteration.currentStage ? `Stage: ${it.iteration.currentStage.name}` : null,
            _start: it.dueDate,
            _projectId: proj.id,
            _projItemId: it.id,
            _assigneeId: it.assignedToId,
            _assignee: normalizeUser(it.assignedTo),
            _priority: 2,
            _link: `/project-tracking/${proj.id}`
          }));
        }
      });
    }

    if (sourceFilter(['ITERATION_START', 'ITERATION_END']).length) {
      await safeRun('ITERATION', async () => {
        const iters = await prisma.projectIteration.findMany({
          where: {
            OR: [
              { startedAt: { gte: fromDate, lte: toDate } },
              { endedAt: { gte: fromDate, lte: toDate } }
            ]
          },
          include: { project: true }
        });
        for (const it of iters) {
          if (!it.project) continue;
          const canSee = isSuper || it.project.managerId === userId;
          if (!canSee) continue;
          if (it.startedAt && it.startedAt >= fromDate && it.startedAt <= toDate) {
            results.push(buildSynthetic({
              _kind: 'ITERATION_START',
              _refId: `IT_S_${it.id}`,
              _title: `Iteration ${it.iterationNo} Start: ${it.project.name}`,
              _start: it.startedAt,
              _projectId: it.project.id,
              _link: `/project-tracking/${it.project.id}`
            }));
          }
          if (it.endedAt && it.endedAt >= fromDate && it.endedAt <= toDate) {
            results.push(buildSynthetic({
              _kind: 'ITERATION_END',
              _refId: `IT_E_${it.id}`,
              _title: `Iteration ${it.iterationNo} End: ${it.project.name}`,
              _start: it.endedAt,
              _projectId: it.project.id,
              _link: `/project-tracking/${it.project.id}`
            }));
          }
        }
      });
    }

    if (sourceFilter(['ASSIGNMENT_CREATED']).length) {
      await safeRun('ASSIGNMENT_CREATED', async () => {
        const assignments = await prisma.documentAssignment.findMany({
          where: { createdAt: { gte: fromDate, lte: toDate } },
          include: {
            user: true,
            assignedBy: true,
            document: { include: { documentType: true, owner: true, submittedBy: true } }
          }
        });
        for (const a of assignments) {
          const canSee = isSuper || a.userId === userId || a.assignedById === userId || a.document?.ownerId === userId;
          if (!canSee) continue;
          const docCode = a.document?.fileCode ? ` (${a.document.fileCode})` : '';
          const docLink = a.documentId ? `/documents/review-approval?docId=${a.documentId}` : `/documents/review-approval`;
          const extra = {};
          if (a.assignmentType) extra.assignmentType = a.assignmentType;
          if (a.document?.fileCode) extra.documentCode = a.document.fileCode;
          if (a.document?.documentType?.name) extra.documentType = a.document.documentType.name;
          if (a.document?.ownerId) extra.documentOwnerId = a.document.ownerId;
          if (a.document?.owner) extra.documentOwner = normalizeUser(a.document.owner);

          let effectiveAssignedById = a.assignedById;
          let effectiveAssignedBy = a.assignedBy;
          if (!effectiveAssignedById) {
            if (a.assignmentType === 'REVIEW' && a.document?.submittedById) {
              effectiveAssignedById = a.document.submittedById;
              effectiveAssignedBy = a.document.submittedBy;
            } else if (a.document?.ownerId) {
              effectiveAssignedById = a.document.ownerId;
              effectiveAssignedBy = a.document.owner;
            }
          }
          if (effectiveAssignedById) extra.assignedById = effectiveAssignedById;

          results.push(buildSynthetic({
            _kind: 'ASSIGNMENT_CREATED',
            _refId: `DA_${a.id}`,
            _title: `${a.assignmentType || 'Assignment'} Assigned: ${a.document?.title || 'Document'}${docCode}`,
            _description: a.document?.documentType?.name ? `Document Type: ${a.document.documentType.name}` : null,
            _start: a.createdAt,
            _allDay: false,
            _docId: a.documentId,
            _userId: effectiveAssignedById || null,
            _user: normalizeUser(effectiveAssignedBy),
            _assigneeId: a.userId,
            _assignee: normalizeUser(a.user),
            _link: docLink,
            _extra: Object.keys(extra).length ? extra : null
          }));
        }
      });
    }

    if (sourceFilter(['VERSION_REQUEST_TARGET']).length) {
      await safeRun('VERSION_REQUEST_TARGET', async () => {
        const vrs = await prisma.versionRequest.findMany({
          where: { targetDate: { gte: fromDate, lte: toDate } },
          include: {
            requestedBy: true,
            document: true
          }
        });
        for (const v of vrs) {
          const canSee = isSuper || v.requestedById === userId || v.reviewedById === userId || v.approvedById === userId;
          if (!canSee) continue;
          const vrLink = v.documentId ? `/documents/review-approval?docId=${v.documentId}` : `/documents/review-approval`;
          results.push(buildSynthetic({
            _kind: 'VERSION_REQUEST_TARGET',
            _refId: `VR_${v.id}`,
            _title: `Version Request Target: ${v.document?.title || 'Document'}`,
            _description: v.proposedChanges || v.reasonForRevision || null,
            _start: v.targetDate,
            _vrId: v.id,
            _docId: v.documentId,
            _userId: v.requestedById,
            _user: normalizeUser(v.requestedBy),
            _priority: 1,
            _link: vrLink
          }));
        }
      });
    }

    if (sourceFilter(['TENDER_SUBMISSION_DEADLINE']).length) {
      await safeRun('TENDER_SUBMISSION_DEADLINE', async () => {
        const tenders = await prisma.crmTenderEntry.findMany({
          where: { submissionDeadline: { gte: fromDate, lte: toDate } },
          include: { createdBy: true, assignees: { include: { user: true } } }
        });
        for (const t of tenders) {
          const assigneeIds = (t.assignees || []).map((a) => a.userId);
          const canSee = isSuper || t.createdById === userId || assigneeIds.includes(userId);
          if (!canSee) continue;
          results.push(buildSynthetic({
            _kind: 'TENDER_SUBMISSION_DEADLINE',
            _refId: `TD_${t.id}`,
            _title: `Tender Due: ${t.title}`,
            _description: t.clientName ? `Client: ${t.clientName}${t.tenderRefNo ? ` • ${t.tenderRefNo}` : ''}` : (t.tenderRefNo || null),
            _start: t.submissionDeadline,
            _tenderId: t.id,
            _userId: t.createdById,
            _priority: 2,
            _link: `/tender-book`,
            _extra: { status: t.status || null, tenderRefNo: t.tenderRefNo || null, clientName: t.clientName || null }
          }));
        }
      });
    }

    if (sourceFilter(['TENDER_FOLLOW_UP']).length) {
      await safeRun('TENDER_FOLLOW_UP', async () => {
        const tenders = await prisma.crmTenderEntry.findMany({
          where: { nextFollowUpAt: { gte: fromDate, lte: toDate } },
          include: { createdBy: true, assignees: { include: { user: true } } }
        });
        for (const t of tenders) {
          const assigneeIds = (t.assignees || []).map((a) => a.userId);
          const canSee = isSuper || t.createdById === userId || assigneeIds.includes(userId);
          if (!canSee) continue;
          results.push(buildSynthetic({
            _kind: 'TENDER_FOLLOW_UP',
            _refId: `TF_${t.id}`,
            _title: `Follow-up: ${t.title}`,
            _start: t.nextFollowUpAt,
            _allDay: false,
            _tenderId: t.id,
            _userId: t.createdById,
            _link: `/tender-book`
          }));
        }
      });
    }

    if (sourceFilter(['TENDER_FOLLOW_UP_LOG']).length) {
      await safeRun('TENDER_FOLLOW_UP_LOG', async () => {
        const logs = await prisma.crmTenderFollowUpLog.findMany({
          where: { followUpAt: { gte: fromDate, lte: toDate } },
          include: {
            assignedTo: true,
            createdBy: true,
            tender: true
          }
        });
        for (const l of logs) {
          const canSee = isSuper || l.assignedToId === userId || l.createdById === userId;
          if (!canSee) continue;
          const safeNote = String(l.note || '');
          results.push(buildSynthetic({
            _kind: 'TENDER_FOLLOW_UP_LOG',
            _refId: `TFL_${l.id}`,
            _title: safeNote ? `Follow-up: ${(safeNote.length > 40 ? safeNote.slice(0, 40) + '…' : safeNote)}` : `Follow-up Log for Tender`,
            _description: l.note,
            _start: l.followUpAt,
            _allDay: false,
            _tenderId: l.tenderId,
            _assigneeId: l.assignedToId,
            _assignee: normalizeUser(l.assignedTo),
            _link: `/tender-book`
          }));
        }
      });
    }

    if (sourceFilter(['FB_ENQUIRY_DATE']).length) {
      await safeRun('FB_ENQUIRY_DATE', async () => {
        const fbs = await prisma.crmFbEnquiryEntry.findMany({
          where: { enquiryDate: { gte: fromDate, lte: toDate } },
          include: { createdBy: true, assignees: { include: { user: true } } }
        });
        for (const f of fbs) {
          const assigneeIds = (f.assignees || []).map((a) => a.userId);
          const canSee = isSuper || f.createdById === userId || assigneeIds.includes(userId);
          if (!canSee) continue;
          results.push(buildSynthetic({
            _kind: 'FB_ENQUIRY_DATE',
            _refId: `FE_D_${f.id}`,
            _title: `Enquiry: ${f.name || f.contact || '-'}`,
            _description: f.company ? `Company: ${f.company}` : null,
            _start: f.enquiryDate,
            _fbId: f.id,
            _userId: f.createdById,
            _link: `/fb-enquiries`
          }));
        }
      });
    }

    if (sourceFilter(['FB_FOLLOW_UP']).length) {
      await safeRun('FB_FOLLOW_UP', async () => {
        const fbs = await prisma.crmFbEnquiryEntry.findMany({
          where: { nextFollowUpAt: { gte: fromDate, lte: toDate } },
          include: { createdBy: true, assignees: { include: { user: true } } }
        });
        for (const f of fbs) {
          const assigneeIds = (f.assignees || []).map((a) => a.userId);
          const canSee = isSuper || f.createdById === userId || assigneeIds.includes(userId);
          if (!canSee) continue;
          results.push(buildSynthetic({
            _kind: 'FB_FOLLOW_UP',
            _refId: `FE_F_${f.id}`,
            _title: `Follow-up: ${f.name || f.contact || '-'}`,
            _start: f.nextFollowUpAt,
            _allDay: false,
            _fbId: f.id,
            _userId: f.createdById,
            _link: `/fb-enquiries`
          }));
        }
      });
    }

    if (sourceFilter(['FB_FOLLOW_UP_LOG']).length) {
      await safeRun('FB_FOLLOW_UP_LOG', async () => {
        const logs = await prisma.crmFbEnquiryFollowUpLog.findMany({
          where: { followUpAt: { gte: fromDate, lte: toDate } },
          include: { assignedTo: true, createdBy: true }
        });
        for (const l of logs) {
          const canSee = isSuper || l.assignedToId === userId || l.createdById === userId;
          if (!canSee) continue;
          const safeNote = String(l.note || '');
          results.push(buildSynthetic({
            _kind: 'FB_FOLLOW_UP_LOG',
            _refId: `FFL_${l.id}`,
            _title: safeNote ? `Follow-up: ${(safeNote.length > 40 ? safeNote.slice(0, 40) + '…' : safeNote)}` : `Enquiry Follow-up Log`,
            _description: l.note,
            _start: l.followUpAt,
            _allDay: false,
            _fbId: l.enquiryId,
            _assigneeId: l.assignedToId,
            _assignee: normalizeUser(l.assignedTo),
            _link: `/fb-enquiries`
          }));
        }
      });
    }

    let final = results;
    if (search && search.trim()) {
      const q = search.toLowerCase().trim();
      final = final.filter((e) =>
        (e.title && e.title.toLowerCase().includes(q)) ||
        (e.description && e.description.toLowerCase().includes(q))
      );
    }
    final = catFilter(final);
    final.sort((a, b) => new Date(a.startDateTime) - new Date(b.startDateTime));
    return final;
  } catch (topLevelError) {
    logger.error(`[calendar] getEventsInRange TOTAL FAILURE (uid=${userId}): ${topLevelError?.stack || topLevelError}`);
    return [];
  }
}

async function getUpcoming(userId, days = 7) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = addDays(today, days);
  return getEventsInRange(userId, today, end);
}

function parseReminderOffsetToMinutes(offset) {
  if (!offset || typeof offset !== 'string') return null;
  const s = offset.trim().toUpperCase();
  const week = s.match(/P([0-9]+)W/);
  if (week) return Number(week[1]) * 7 * 24 * 60;
  let days = 0, hours = 0, minutes = 0;
  const d = s.match(/([0-9]+)D/);
  if (d) days = Number(d[1]);
  const h = s.match(/([0-9]+)H/);
  if (h) hours = Number(h[1]);
  const m = s.match(/([0-9]+)M/);
  if (m) minutes = Number(m[1]);
  const total = days * 24 * 60 + hours * 60 + minutes;
  return total > 0 ? total : null;
}

async function createCustomEvent(userId, payload) {
  const {
    title, description, startDateTime, endDateTime, isAllDay,
    category, priority, assigneeId, location, recurrenceRule, colorOverride,
    reminderOffset, categoryMeta, viewerIds, isPublic
  } = payload;

  if (!title) throw new Error('Title is required');
  if (!startDateTime) throw new Error('Start date/time is required');

  const cat = category || 'CUSTOM';
  const isAnnouncementOrAlert = cat === 'INFO' || cat === 'WARNING';
  const isPublicEvent = isPublic === true || isAnnouncementOrAlert;

  const cleanViewerIds = Array.isArray(viewerIds)
    ? [...new Set(viewerIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id !== userId))]
    : [];

  const eventCreateData = {
    title,
    description: description || null,
    startDateTime: new Date(startDateTime),
    endDateTime: endDateTime ? new Date(endDateTime) : null,
    isAllDay: isAllDay === true,
    sourceType: 'CUSTOM',
    category: cat,
    priority: priority || 0,
    userId: isPublicEvent ? null : userId,
    assigneeId: assigneeId || null,
    isSynthetic: false,
    customEvent: {
      create: {
        recurrenceRule: recurrenceRule || null,
        colorOverride: colorOverride || null,
        location: location || null,
        reminderOffset: reminderOffset || null,
        categoryMeta: categoryMeta != null ? categoryMeta : null,
        createdById: userId
      }
    }
  };

  if (cleanViewerIds.length > 0) {
    eventCreateData.viewers = {
      create: cleanViewerIds.map((vid) => ({ userId: vid }))
    };
  }

  let result;
  try {
    result = await prisma.calendarEvent.create({
      data: eventCreateData,
      include: {
        customEvent: true,
        user: true,
        assignee: true,
        viewers: { include: { user: true } }
      }
    });
  } catch (e) {
    if (e && /P2022|P2021|viewers|CalendarEventViewer/i.test(String(e.message || ''))) {
      logger.warn('Calendar viewers create failed, retrying without viewers relation. Please run prisma db push.');
      const cleanCreate = { ...eventCreateData };
      delete cleanCreate.viewers;
      result = await prisma.calendarEvent.create({
        data: cleanCreate,
        include: {
          customEvent: true,
          user: true,
          assignee: true
        }
      });
    } else {
      throw e;
    }
  }

  const offsetMins = parseReminderOffsetToMinutes(reminderOffset);
  if (offsetMins != null) {
    const reminderRecipientIds = new Set();
    reminderRecipientIds.add(userId);
    if (result.assigneeId) reminderRecipientIds.add(result.assigneeId);
    cleanViewerIds.forEach((vid) => reminderRecipientIds.add(vid));
    for (const rid of reminderRecipientIds) {
      try {
        await prisma.calendarEventReminder.upsert({
          where: {
            cal_rem_evt_user_type_off_uniq: {
              calendarEventId: result.id,
              userId: rid,
              reminderType: 'IN_APP',
              offsetMinutes: offsetMins
            }
          },
          create: {
            calendarEventId: result.id,
            userId: rid,
            reminderType: 'IN_APP',
            offsetMinutes: offsetMins
          },
          update: { delivered: false, deliveredAt: null }
        });
      } catch (e) {
        // ignore reminder creation failure; event already persisted
      }
    }
  }

  return result;
}

async function updateCustomEvent(userId, eventId, payload) {
  let existing;
  try {
    existing = await prisma.calendarEvent.findUnique({
      where: { id: Number(eventId) },
      include: { customEvent: true, viewers: true }
    });
  } catch (e) {
    if (e && /P2022|P2021|viewers|CalendarEventViewer/i.test(String(e.message || ''))) {
      logger.warn('Calendar viewers missing in update fetch, fallback legacy include.');
      existing = await prisma.calendarEvent.findUnique({
        where: { id: Number(eventId) },
        include: { customEvent: true }
      });
    } else {
      throw e;
    }
  }
  if (!existing) throw new Error('Event not found');
  if (existing.isSynthetic) throw new Error('Synthetic events cannot be edited');
  if (existing.userId !== userId && existing.assigneeId !== userId) {
    const { isSuper } = await getVisibleIdsForUser(userId);
    if (!isSuper) throw new Error('Forbidden: not the owner/assignee');
  }

  const {
    title, description, startDateTime, endDateTime, isAllDay,
    category, priority, assigneeId, location, recurrenceRule, colorOverride,
    reminderOffset, categoryMeta, viewerIds, isPublic
  } = payload;

  const customData = {};
  if (location !== undefined) customData.location = location || null;
  if (recurrenceRule !== undefined) customData.recurrenceRule = recurrenceRule || null;
  if (colorOverride !== undefined) customData.colorOverride = colorOverride || null;
  if (reminderOffset !== undefined) customData.reminderOffset = reminderOffset || null;
  if (categoryMeta !== undefined) customData.categoryMeta = categoryMeta || Prisma.DbNull;

  const eventUpdateData = {};
  if (title !== undefined) eventUpdateData.title = title;
  if (description !== undefined) eventUpdateData.description = description || null;
  if (startDateTime) eventUpdateData.startDateTime = new Date(startDateTime);
  if (endDateTime !== undefined) eventUpdateData.endDateTime = endDateTime ? new Date(endDateTime) : null;
  if (isAllDay !== undefined) eventUpdateData.isAllDay = isAllDay === true;
  if (category !== undefined) eventUpdateData.category = category;
  if (priority !== undefined) eventUpdateData.priority = priority || 0;
  if (assigneeId !== undefined) eventUpdateData.assigneeId = assigneeId || null;

  if (category !== undefined || isPublic !== undefined) {
    const cat = category !== undefined ? category : existing.category;
    const isAnnouncementOrAlert = cat === 'INFO' || cat === 'WARNING';
    const isPublicEvent = isPublic === true || (isPublic !== false && isAnnouncementOrAlert);
    const createdById = existing.customEvent?.createdById || userId;
    eventUpdateData.userId = isPublicEvent ? null : (existing.userId || createdById);
  }

  if (Object.keys(customData).length) {
    eventUpdateData.customEvent = existing.customEvent ? {
      update: customData
    } : {
      create: {
        ...customData,
        createdById: existing.customEvent?.createdById || userId
      }
    };
  }

  let cleanViewerIds = null;
  if (Array.isArray(viewerIds)) {
    cleanViewerIds = [...new Set(viewerIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id !== userId))];
    eventUpdateData.viewers = {
      deleteMany: {},
      create: cleanViewerIds.map((vid) => ({ userId: vid }))
    };
  }

  let updated;
  try {
    updated = await prisma.calendarEvent.update({
      where: { id: Number(eventId) },
      data: eventUpdateData,
      include: {
        customEvent: true,
        user: true,
        assignee: true,
        viewers: { include: { user: true } }
      }
    });
  } catch (e) {
    if (e && /P2022|P2021|viewers|CalendarEventViewer/i.test(String(e.message || ''))) {
      logger.warn('Calendar viewers update failed, fallback legacy update.');
      const cleanUpdate = { ...eventUpdateData };
      delete cleanUpdate.viewers;
      updated = await prisma.calendarEvent.update({
        where: { id: Number(eventId) },
        data: cleanUpdate,
        include: {
          customEvent: true,
          user: true,
          assignee: true
        }
      });
    } else {
      throw e;
    }
  }

  const offsetMins = parseReminderOffsetToMinutes(reminderOffset);
  if (offsetMins != null) {
    const reminderRecipientIds = new Set();
    reminderRecipientIds.add(userId);
    if (updated.assigneeId) reminderRecipientIds.add(updated.assigneeId);
    if (cleanViewerIds != null) {
      cleanViewerIds.forEach((vid) => reminderRecipientIds.add(vid));
    } else if (updated.viewers) {
      updated.viewers.forEach((v) => reminderRecipientIds.add(v.userId));
    }
    for (const rid of reminderRecipientIds) {
      try {
        await prisma.calendarEventReminder.upsert({
          where: {
            cal_rem_evt_user_type_off_uniq: {
              calendarEventId: updated.id,
              userId: rid,
              reminderType: 'IN_APP',
              offsetMinutes: offsetMins
            }
          },
          create: {
            calendarEventId: updated.id,
            userId: rid,
            reminderType: 'IN_APP',
            offsetMinutes: offsetMins
          },
          update: { delivered: false, deliveredAt: null }
        });
      } catch (e) { /* ignore */ }
    }
  }

  return updated;
}

async function deleteCustomEvent(userId, eventId) {
  const existing = await prisma.calendarEvent.findUnique({
    where: { id: Number(eventId) }
  });
  if (!existing) throw new Error('Event not found');
  if (existing.isSynthetic) throw new Error('Synthetic events cannot be deleted');
  if (existing.userId !== userId && existing.assigneeId !== userId) {
    const { isSuper } = await getVisibleIdsForUser(userId);
    if (!isSuper) throw new Error('Forbidden: not the owner/assignee');
  }
  await prisma.calendarEvent.delete({ where: { id: Number(eventId) } });
  return true;
}

async function getEventDetail(userId, eventId) {
  if (String(eventId).startsWith('syn_')) {
    return null;
  }
  let evt;
  try {
    evt = await prisma.calendarEvent.findUnique({
      where: { id: Number(eventId) },
      include: {
        customEvent: true,
        user: true,
        assignee: true,
        reminders: true,
        viewers: { include: { user: true } }
      }
    });
  } catch (e) {
    if (e && /P2022|P2021|viewers|CalendarEventViewer/i.test(String(e.message || ''))) {
      logger.warn('Calendar viewers relation missing in getEventDetail, fallback to legacy include.');
      evt = await prisma.calendarEvent.findUnique({
        where: { id: Number(eventId) },
        include: {
          customEvent: true,
          user: true,
          assignee: true,
          reminders: true
        }
      });
    } else {
      throw e;
    }
  }
  if (!evt) return null;
  return evt;
}

async function getUserPreferences(userId) {
  const pref = await prisma.userCalendarPreference.findUnique({
    where: { userId }
  });
  if (pref) return pref;
  return prisma.userCalendarPreference.create({
    data: {
      userId,
      defaultView: 'month',
      workdayStart: 9,
      workdayEnd: 18,
      weekendDays: JSON.stringify([0, 6]),
      showDeclined: false,
      showPastEvents: true,
      hideWeekends: false,
      weekStartsOn: 1
    }
  });
}

async function updateUserPreferences(userId, payload) {
  const upsertData = {};
  const allowed = [
    'defaultView','workdayStart','workdayEnd','weekendDays',
    'showDeclined','showPastEvents','categoryColorOverrides',
    'sourceTypeVisibility','hideWeekends','weekStartsOn'
  ];
  for (const k of allowed) {
    if (payload[k] !== undefined) upsertData[k] = payload[k];
  }
  return prisma.userCalendarPreference.upsert({
    where: { userId },
    create: { userId, ...upsertData },
    update: upsertData
  });
}

async function addReminder(userId, eventId, { reminderType = 'IN_APP', offsetMinutes = 0 }) {
  const numericEventId = String(eventId).startsWith('syn_') ? null : Number(eventId);
  const event = numericEventId
    ? await prisma.calendarEvent.findUnique({ where: { id: numericEventId } })
    : null;

  if (numericEventId && !event) throw new Error('Event not found');

  const off = Number(offsetMinutes) || 0;
  if (off < 0) throw new Error('offsetMinutes must be >= 0');

  if (numericEventId) {
    return prisma.calendarEventReminder.upsert({
      where: {
        cal_rem_evt_user_type_off_uniq: {
          calendarEventId: numericEventId,
          userId,
          reminderType,
          offsetMinutes: off
        }
      },
      create: {
        calendarEventId: numericEventId,
        userId,
        reminderType,
        offsetMinutes: off
      },
      update: { delivered: false, deliveredAt: null }
    });
  }

  return { synthetic: true, message: 'Reminder for synthetic events are handled via notification preferences' };
}

module.exports = {
  CATEGORY_META,
  SOURCE_CATEGORY,
  getEventsInRange,
  getUpcoming,
  createCustomEvent,
  updateCustomEvent,
  deleteCustomEvent,
  getEventDetail,
  getUserPreferences,
  updateUserPreferences,
  addReminder
};
