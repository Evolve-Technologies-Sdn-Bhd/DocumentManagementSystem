const {
  getEventsInRange,
  getUpcoming,
  createCustomEvent,
  updateCustomEvent,
  deleteCustomEvent,
  getEventDetail,
  getUserPreferences,
  updateUserPreferences,
  addReminder,
  CATEGORY_META
} = require('../services/calendarService');
const asyncHandler = require('../utils/asyncHandler');
const ResponseFormatter = require('../utils/responseFormatter');
const { BadRequestError, ForbiddenError, NotFoundError } = require('../utils/errors');

function parseDateRange(req) {
  const { from, to } = req.query;
  if (!from || !to) {
    throw new BadRequestError('Both `from` and `to` date query params are required (ISO strings)');
  }
  return { from: new Date(from), to: new Date(to) };
}

function getFilterOptions(req) {
  const { sources, categories, search } = req.query;
  const parseList = (v) => {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    return String(v).split(',').map((s) => s.trim()).filter(Boolean);
  };
  return {
    includeSources: parseList(sources),
    categories: parseList(categories),
    search: search || null
  };
}

const listEvents = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { from, to } = parseDateRange(req);
  const opts = getFilterOptions(req);
  const events = await getEventsInRange(userId, from, to, opts);
  return ResponseFormatter.success(res, {
    events,
    categoryMeta: CATEGORY_META,
    from,
    to
  }, 'Calendar events retrieved');
});

const getUpcomingEvents = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const days = Math.min(Number(req.query.days || 7), 90);
  const events = await getUpcoming(userId, days);
  return ResponseFormatter.success(res, { events, days }, 'Upcoming events retrieved');
});

const getEvent = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const evt = await getEventDetail(userId, id);
  if (!evt) throw new NotFoundError('Event not found');
  return ResponseFormatter.success(res, { event: evt });
});

const createEvent = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const evt = await createCustomEvent(userId, req.body || {});
  return ResponseFormatter.success(res, { event: evt }, 'Event created');
});

const updateEvent = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const evt = await updateCustomEvent(userId, id, req.body || {});
  return ResponseFormatter.success(res, { event: evt }, 'Event updated');
});

const deleteEvent = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  await deleteCustomEvent(userId, id);
  return ResponseFormatter.success(res, null, 'Event deleted');
});

const getPreferences = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const pref = await getUserPreferences(userId);
  return ResponseFormatter.success(res, { preferences: pref });
});

const updatePreferences = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const pref = await updateUserPreferences(userId, req.body || {});
  return ResponseFormatter.success(res, { preferences: pref }, 'Preferences updated');
});

const createReminder = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const reminder = await addReminder(userId, id, req.body || {});
  return ResponseFormatter.success(res, { reminder }, 'Reminder set');
});

const getSourceDefinitions = asyncHandler(async (req, res) => {
  const defs = [
    { source: 'DOCUMENT_EXPIRY', label: 'Document Expiry', module: 'expiryTracking', category: 'DEADLINE' },
    { source: 'DOCUMENT_EXPIRY_REMINDER', label: 'Expiry Reminders', module: 'expiryTracking', category: 'WARNING' },
    { source: 'DOCUMENT_SHARE_EXPIRY', label: 'Share Link Expiry', module: 'documents', category: 'TASK' },
    { source: 'PROJECT_START', label: 'Project Start', module: 'projectTracking', category: 'MILESTONE' },
    { source: 'PROJECT_COMPLETION', label: 'Project Completion', module: 'projectTracking', category: 'MILESTONE' },
    { source: 'PROJECT_ITEM_DUE', label: 'Project Item Due', module: 'projectTracking', category: 'DEADLINE' },
    { source: 'ITERATION_START', label: 'Iteration Start', module: 'projectTracking', category: 'MILESTONE' },
    { source: 'ITERATION_END', label: 'Iteration End', module: 'projectTracking', category: 'MILESTONE' },
    { source: 'ASSIGNMENT_CREATED', label: 'Assignment Created', module: 'documents.review', category: 'TASK' },
    { source: 'VERSION_REQUEST_TARGET', label: 'Version Request Target', module: 'documents.review', category: 'DEADLINE' },
    { source: 'TENDER_SUBMISSION_DEADLINE', label: 'Tender Submission Deadline', module: 'crm.tenderBook', category: 'DEADLINE' },
    { source: 'TENDER_FOLLOW_UP', label: 'Tender Follow-up', module: 'crm.tenderBook', category: 'TASK' },
    { source: 'TENDER_FOLLOW_UP_LOG', label: 'Tender Follow-up Log', module: 'crm.tenderBook', category: 'TASK' },
    { source: 'FB_ENQUIRY_DATE', label: 'Enquiry Date', module: 'crm.fbEnquiry', category: 'INFO' },
    { source: 'FB_FOLLOW_UP', label: 'Enquiry Follow-up', module: 'crm.fbEnquiry', category: 'TASK' },
    { source: 'FB_FOLLOW_UP_LOG', label: 'Enquiry Follow-up Log', module: 'crm.fbEnquiry', category: 'TASK' },
    { source: 'CUSTOM', label: 'Custom Events', module: 'calendar', category: 'CUSTOM' }
  ];
  return ResponseFormatter.success(res, {
    sources: defs,
    categoryMeta: CATEGORY_META
  });
});

module.exports = {
  listEvents,
  getUpcomingEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  getPreferences,
  updatePreferences,
  createReminder,
  getSourceDefinitions
};
