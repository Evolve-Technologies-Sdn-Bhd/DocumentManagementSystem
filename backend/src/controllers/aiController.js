const aiService = require('../services/geminiAIService');
const documentService = require('../services/documentService');
const { PrismaClient } = require('@prisma/client');
const asyncHandler = require('../utils/asyncHandler');
const ResponseFormatter = require('../utils/responseFormatter');
const mammoth = require('mammoth');
const logger = require('../utils/logger');
const path = require('path');
const fs = require('fs');
const config = require('../config/app');

const prisma = new PrismaClient();

const extractTextFromBuffer = async (fileBuffer, originalName) => {
  const ext = path.extname(originalName || '').toLowerCase();

  if (ext === '.txt') {
    return fileBuffer.toString('utf8');
  }

  if (ext === '.docx') {
    try {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      return result.value || '';
    } catch (err) {
      logger.warn('[aiController] DOCX extraction failed', { error: err?.message || String(err) });
      return '';
    }
  }

  if (ext === '.md' || ext === '.json' || ext === '.csv' || ext === '.html' || ext === '.xml') {
    return fileBuffer.toString('utf8');
  }

  return '';
};

const healthCheck = asyncHandler(async (req, res) => {
  const deep = req.query?.deep === 'true' || req.query?.force === 'true' || false;
  const status = await aiService.healthCheck({ deep });
  return ResponseFormatter.success(
    res,
    status,
    status.status === 'online' ? 'AI service is operational' : 'AI service check complete'
  );
});

const getConfig = asyncHandler(async (req, res) => {
  return ResponseFormatter.success(res, {
    enabled: aiService.isEnabled(),
    provider: config.ai?.provider || 'gemini',
    model: config.ai?.geminiModel || 'gemini-3.6-flash',
    defaultLanguage: config.ai?.defaultLanguage || 'en',
  });
});

const summarizeDocument = asyncHandler(async (req, res) => {
  if (!aiService.isEnabled()) {
    return ResponseFormatter.error(res, 'AI service is not enabled. Configure GEMINI_API_KEY and set AI_ENABLED=true.', 400);
  }

  let documentText = req.body?.documentText || req.body?.text || '';
  const { format, maxSentences, includeKeyPoints = true, language } = req.body || {};

  if (!documentText && req.file) {
    documentText = await extractTextFromBuffer(req.file.buffer, req.file.originalname);
  }

  if (!documentText || documentText.trim().length < 20) {
    return ResponseFormatter.error(res, 'Document text is too short or empty. Provide at least 20 characters of text, or upload a .txt/.docx file.', 400);
  }

  const result = await aiService.summarizeDocument(documentText, {
    format,
    maxSentences,
    includeKeyPoints,
    language,
  });

  return ResponseFormatter.success(res, result, 'Document summarized successfully');
});

const autofillFormFields = asyncHandler(async (req, res) => {
  if (!aiService.isEnabled()) {
    return ResponseFormatter.error(res, 'AI service is not enabled.', 400);
  }

  const { fields, fieldDefinitions } = req.body || {};
  let contextText = req.body?.contextText || req.body?.context || '';

  const definitions = fields || fieldDefinitions;

  if (!definitions || !Array.isArray(definitions) || definitions.length === 0) {
    return ResponseFormatter.error(res, 'Missing "fields" array. Provide form field definitions to fill.', 400);
  }

  if (!contextText && req.file) {
    contextText = await extractTextFromBuffer(req.file.buffer, req.file.originalname);
  }

  if (!contextText || contextText.trim().length < 10) {
    return ResponseFormatter.error(res, 'Missing context. Provide "contextText" or upload a .txt/.docx file to extract values from.', 400);
  }

  const result = await aiService.autofillFormFields(definitions, contextText, {
    language: req.body?.language,
    strict: req.body?.strict !== false,
  });

  return ResponseFormatter.success(res, {
    data: result,
    message: `Processed ${definitions.length} fields. Filled ${Object.values(result.filledFields || {}).filter(v => v !== null && v !== '').length} fields.`,
  });
});

const classifyDocument = asyncHandler(async (req, res) => {
  if (!aiService.isEnabled()) {
    return ResponseFormatter.error(res, 'AI service is not enabled.', 400);
  }

  let documentText = req.body?.documentText || req.body?.text || '';
  const { categories, language } = req.body || {};

  if (!documentText && req.file) {
    documentText = await extractTextFromBuffer(req.file.buffer, req.file.originalname);
  }

  if (!documentText || documentText.trim().length < 20) {
    return ResponseFormatter.error(res, 'Document text is too short or empty.', 400);
  }

  const result = await aiService.classifyDocument(documentText, categories, {
    language,
  });

  return ResponseFormatter.success(res, {
    data: result,
    message: `Document classified as: ${result.category}`,
  });
});

const suggestTemplateFields = asyncHandler(async (req, res) => {
  if (!aiService.isEnabled()) {
    return ResponseFormatter.error(res, 'AI service is not enabled.', 400);
  }

  const {
    documentType,
    templateDescription,
    existingFields = [],
    fieldCount = 15,
    language,
  } = req.body || {};

  if (!documentType && !templateDescription) {
    return ResponseFormatter.error(res, 'Provide at least "documentType" or "templateDescription" to generate field suggestions.', 400);
  }

  const result = await aiService.suggestTemplateFields(
    documentType || 'General Document',
    templateDescription || '',
    existingFields,
    { language, fieldCount }
  );

  return ResponseFormatter.success(res, result, `Suggested ${result.fields?.length || 0} template fields.`);
});

const chat = asyncHandler(async (req, res) => {
  if (!aiService.isEnabled()) {
    return ResponseFormatter.error(res, 'AI service is not enabled.', 400);
  }

  const {
    messages = [],
    pageContext = null,
    language,
    temperature,
    stream = false,
  } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return ResponseFormatter.error(res, 'Provide a non-empty "messages" array (array of {role, content}).', 400);
  }

  const dmsUser = {
    id: req.user?.id,
    name: req.user?.fullName || req.user?.name || req.user?.username,
    email: req.user?.email,
    roles: req.user?.roleNames || (req.user?.role ? [req.user.role] : []),
    division: req.user?.division || req.user?.department,
  };

  const safePageContext =
    pageContext && typeof pageContext === 'object' ? pageContext :
    typeof pageContext === 'string' ? { raw: pageContext } : null;

  const reply = await aiService.chat({
    messages,
    pageContext: safePageContext,
    dmsUser,
    language,
    temperature,
  });

  return ResponseFormatter.success(res, reply, 'AI chat response generated');
});

const resolveSearchName = async (field, searchText, user) => {
  if (!searchText || typeof searchText !== 'string') return { matched: false, id: null };
  const text = searchText.trim();
  if (!text) return { matched: false, id: null };

  const lowerQ = '%' + text.toLowerCase() + '%';
  const exactLower = text.toLowerCase();

  try {
    if (field === 'documentType') {
      const rows = await prisma.documentType.findMany({
        where: { OR: [{ name: { contains: text } }, { code: { contains: text } }] },
        take: 3,
      });
      if (rows.length === 1) return { matched: true, id: rows[0].id, name: rows[0].name, resolution: 'unique_match' };
      if (rows.length > 1) {
        const exact = rows.find(r => String(r.name || '').toLowerCase() === exactLower);
        if (exact) return { matched: true, id: exact.id, name: exact.name, resolution: 'exact_case_insensitive' };
        return { matched: 'ambiguous', id: rows.map(r => r.id), name: rows[0].name, alternatives: rows.map(r => r.name) };
      }
      return { matched: false, id: null };
    }

    if (field === 'projectCategory') {
      const rows = await prisma.projectCategory.findMany({
        where: { OR: [{ name: { contains: text } }, { code: { contains: text } }] },
        take: 3,
      });
      if (rows.length === 1) return { matched: true, id: rows[0].id, name: rows[0].name };
      if (rows.length > 1) {
        const exact = rows.find(r => String(r.name || '').toLowerCase() === exactLower);
        if (exact) return { matched: true, id: exact.id, name: exact.name };
        return { matched: 'ambiguous', id: rows.map(r => r.id), name: rows[0].name, alternatives: rows.map(r => r.name) };
      }
      return { matched: false, id: null };
    }

    if (field === 'user' || field === 'owner' || field === 'createdBy' || field === 'reviewer') {
      const meHint = /\b(saya|saya sendiri|me|myself|my)\b/i.test(text);
      if (meHint && user?.id) {
        return { matched: true, id: user.id, name: [user.firstName, user.lastName].filter(Boolean).join(' '), resolution: 'current_user' };
      }
      const rows = await prisma.user.findMany({
        where: {
          OR: [
            { firstName: { contains: text } },
            { lastName: { contains: text } },
            { email: { contains: text } },
            { username: { contains: text } },
          ],
          isActive: true,
        },
        take: 5,
        select: { id: true, firstName: true, lastName: true, email: true },
      });
      if (rows.length === 1) return {
        matched: true, id: rows[0].id,
        name: [rows[0].firstName, rows[0].lastName].filter(Boolean).join(' '),
      };
      if (rows.length > 1) {
        const fullNameMatches = rows.filter(r => ([r.firstName, r.lastName].filter(Boolean).join(' ').toLowerCase()) === exactLower);
        if (fullNameMatches.length === 1) {
          return {
            matched: true, id: fullNameMatches[0].id,
            name: [fullNameMatches[0].firstName, fullNameMatches[0].lastName].filter(Boolean).join(' '),
            resolution: 'exact_fullname',
          };
        }
        return {
          matched: 'ambiguous', id: rows.map(r => r.id),
          alternatives: rows.map(r => [r.firstName, r.lastName].filter(Boolean).join(' ') + (r.email ? ` <${r.email}>` : '')),
        };
      }
      return { matched: false, id: null };
    }

    if (field === 'folder') {
      const rows = await prisma.folder.findMany({
        where: { name: { contains: text } },
        take: 3,
        select: { id: true, name: true, path: true },
      });
      if (rows.length === 1) return { matched: true, id: rows[0].id, name: rows[0].name, path: rows[0].path };
      if (rows.length > 1) {
        return { matched: 'ambiguous', id: rows.map(r => r.id), name: rows[0].name, alternatives: rows.map(r => r.name + (r.path ? ` (${r.path})` : '')) };
      }
      return { matched: false, id: null };
    }
  } catch (err) {
    logger.warn(`[aiController] resolveSearchName(${field}, ${searchText}) failed: ${err.message}`);
    return { matched: false, id: null, error: err.message };
  }
  return { matched: false, id: null };
};

const searchDocumentsNL = asyncHandler(async (req, res) => {
  if (!aiService.isEnabled()) {
    return ResponseFormatter.error(res, 'AI service is not enabled.', 400);
  }

  const {
    query,
    rawQuery,
    page,
    limit,
    skipAI = false,
    language,
  } = { ...req.query, ...req.body };

  const nlQuery = String(query || rawQuery || '').trim();
  if (!nlQuery || nlQuery.length < 3) {
    return ResponseFormatter.error(res, 'Search query too short. Type at least 3 characters.', 400);
  }

  let parsed = null;
  let parseError = null;

  if (skipAI !== true && String(skipAI).toLowerCase() !== 'true') {
    try {
      parsed = await aiService.parseSearchQueryToFilters(nlQuery, { language });
    } catch (err) {
      parseError = err.message;
      parsed = { search: nlQuery, explain: `AI parse failed (${err.message}), falling back to free-text search.` };
    }
  } else {
    parsed = { search: nlQuery, explain: 'Skipped AI parsing, using raw free-text search.' };
  }

  const resolvers = {};
  const search = (parsed.search || '').trim() || null;

  if (parsed.documentTypeName) {
    const r = await resolveSearchName('documentType', parsed.documentTypeName, req.user);
    resolvers.documentType = r;
  }
  if (parsed.projectCategoryName) {
    const r = await resolveSearchName('projectCategory', parsed.projectCategoryName, req.user);
    resolvers.projectCategory = r;
  }
  if (parsed.folderPath) {
    const r = await resolveSearchName('folder', parsed.folderPath, req.user);
    resolvers.folder = r;
  }
  if (parsed.owner) {
    const r = await resolveSearchName('owner', parsed.owner, req.user);
    resolvers.owner = r;
  }
  if (parsed.createdBy) {
    const r = await resolveSearchName('createdBy', parsed.createdBy, req.user);
    resolvers.createdBy = r;
  }
  if (parsed.reviewer) {
    const r = await resolveSearchName('reviewer', parsed.reviewer, req.user);
    resolvers.reviewer = r;
  }

  const filters = {};
  if (search) filters.search = search;
  if (parsed.status) filters.status = parsed.status;
  if (Array.isArray(parsed.statusIn) && parsed.statusIn.length) filters.statusIn = parsed.statusIn;
  if (parsed.stage) filters.stage = parsed.stage;
  if (parsed.startDate) filters.startDate = parsed.startDate;
  if (parsed.endDate) filters.endDate = parsed.endDate;

  if (resolvers.documentType?.matched === true && Number.isFinite(resolvers.documentType.id)) {
    filters.documentTypeId = Number(resolvers.documentType.id);
  }
  if (resolvers.owner?.matched === true && Number.isFinite(resolvers.owner.id)) {
    filters.ownerId = Number(resolvers.owner.id);
  }
  if (resolvers.createdBy?.matched === true && Number.isFinite(resolvers.createdBy.id)) {
    filters.createdById = Number(resolvers.createdBy.id);
  }
  if (resolvers.folder?.matched === true && Number.isFinite(resolvers.folder.id)) {
    filters.folderId = Number(resolvers.folder.id);
  }

  const pagination = {
    page: Math.max(1, parseInt(page, 10) || 1),
    limit: Math.min(50, Math.max(1, parseInt(limit, 10) || parseInt(parsed.limit, 10) || 15)),
    sortBy: parsed.sortBy || 'createdAt',
    sortOrder: ['asc', 'desc'].includes(String(parsed.sortOrder || '').toLowerCase())
      ? parsed.sortOrder.toLowerCase()
      : 'desc',
  };

  let result = { documents: [], pagination: { ...pagination, total: 0 } };
  let searchError = null;
  try {
    result = await documentService.listDocuments(filters, pagination, req.user);
  } catch (err) {
    searchError = err.message;
    logger.warn('[aiController] AI search execute failed', { error: err?.message || String(err) });
  }

  const documents = (result.documents || []).map((d) => ({
    id: d.id,
    fileCode: d.fileCode,
    title: d.title,
    description: d.description ? String(d.description).substring(0, 200) : null,
    status: d.status,
    stage: d.stage,
    isSmartDocument: !!d.isSmartDocument,
    isConfidential: !!d.isConfidential,
    version: d.version || d.currentVersion || null,
    documentType: d.documentType?.name || null,
    projectCategory: d.projectCategory?.name || null,
    folder: d.folder?.name || null,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    createdBy: d.createdBy ? {
      id: d.createdBy.id,
      name: [d.createdBy.firstName, d.createdBy.lastName].filter(Boolean).join(' ') || d.createdBy.email,
      email: d.createdBy.email,
    } : null,
    owner: d.owner ? {
      id: d.owner.id,
      name: [d.owner.firstName, d.owner.lastName].filter(Boolean).join(' ') || d.owner.email,
      email: d.owner.email,
    } : null,
  }));

  const responseData = {
    originalQuery: nlQuery,
    aiParsed: parsed,
    parseError,
    appliedFilters: filters,
    resolvers,
    pagination: {
      ...pagination,
      total: result.pagination?.total || documents.length,
    },
    documents,
    searchError,
  };

  return ResponseFormatter.success(
    res,
    responseData,
    `AI search complete: ${documents.length} result${documents.length === 1 ? '' : 's'}. ${parsed?.explain || ''}`
  );
});

// ============================================================
// FEATURE 7: REPHRASE TEXT
// ============================================================
const rephraseText = asyncHandler(async (req, res) => {
  if (!aiService.isEnabled()) {
    return ResponseFormatter.error(res, 'AI service is not enabled.', 400);
  }
  const { text, style, tone, variants, preserveKeyTerms, language } = req.body;
  if (!text || !String(text).trim()) {
    return ResponseFormatter.error(res, 'Text to rephrase is required.', 400);
  }
  const result = await aiService.rephraseText(text, {
    style, tone, variants, preserveKeyTerms, language,
  });
  return ResponseFormatter.success(res, result, 'Rephrase complete');
});

// ============================================================
// FEATURE 8: WORKFLOW ROUTING SUGGESTION
// ============================================================
const suggestWorkflowRoute = asyncHandler(async (req, res) => {
  if (!aiService.isEnabled()) {
    return ResponseFormatter.error(res, 'AI service is not enabled.', 400);
  }
  const {
    title, description, documentType, projectCategory, fileCode, text,
    amount, department, confidentialLevel, createdByName,
    availableStages, availableRoles, availableReviewers,
    confidenceThreshold, language,
  } = { ...req.body, ...req.query };

  if (!title && !description && !text) {
    return ResponseFormatter.error(
      res, 'Document context is required (at least title, description, or text snippet).', 400
    );
  }
  const result = await aiService.suggestWorkflowRoute(
    {
      title, description, documentType, projectCategory, fileCode, text,
      amount, department, confidentialLevel, createdByName,
    },
    {
      availableStages, availableRoles, availableReviewers,
      confidenceThreshold, language,
    }
  );
  return ResponseFormatter.success(res, result, 'Workflow routing suggestion generated');
});

// ============================================================
// FEATURE 9: REVIEWER REMARKS GENERATOR
// ============================================================
const generateReviewerRemarks = asyncHandler(async (req, res) => {
  if (!aiService.isEnabled()) {
    return ResponseFormatter.error(res, 'AI service is not enabled.', 400);
  }
  const {
    title, documentType, projectCategory, text, amount,
    decision, tone, customConcerns, reviewerName, variants, language,
  } = req.body;
  if (!['APPROVE', 'REVISE', 'REJECT'].includes(String(decision || '').toUpperCase())) {
    return ResponseFormatter.error(
      res, 'Decision must be APPROVE, REVISE, or REJECT.', 400
    );
  }
  const result = await aiService.generateReviewerRemarks(
    { title, documentType, projectCategory, text, amount },
    {
      decision, tone, customConcerns,
      reviewerName: reviewerName || (req.user?.fullName || req.user?.name || null),
      variants, language,
    }
  );
  return ResponseFormatter.success(res, result, 'Review remarks generated');
});

// ============================================================
// FEATURE 10: GRAMMAR & SPELLING CHECKER
// ============================================================
const checkGrammarSpelling = asyncHandler(async (req, res) => {
  if (!aiService.isEnabled()) {
    return ResponseFormatter.error(res, 'AI service is not enabled.', 400);
  }
  let inputText = req.body?.text || req.body?.content || null;
  if (!inputText && req.file) {
    inputText = await extractTextFromBuffer(req.file.buffer, req.file.originalname);
  }
  if (!inputText || !String(inputText).trim()) {
    return ResponseFormatter.error(
      res, 'Text to check is required.', 400
    );
  }
  const { language, documentType, strictness } = req.body || {};
  const result = await aiService.checkGrammarSpelling(inputText, {
    language, documentType, strictness,
  });
  return ResponseFormatter.success(res, result, 'Grammar and spelling check complete');
});

module.exports = {
  healthCheck,
  getConfig,
  summarizeDocument,
  autofillFormFields,
  classifyDocument,
  suggestTemplateFields,
  chat,
  searchDocumentsNL,
  rephraseText,
  suggestWorkflowRoute,
  generateReviewerRemarks,
  checkGrammarSpelling,
};
