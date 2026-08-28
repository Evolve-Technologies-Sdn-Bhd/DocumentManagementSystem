const config = require('../config/app');
const logger = require('../utils/logger');

class OpenAIAIService {
  constructor() {
    this.aiEnabled = config.ai?.enabled || false;
    this.provider = 'openai';
    this.apiKey = config.ai?.openaiApiKey;
    this.modelName = config.ai?.openaiModel || 'gpt-4o-mini';
    this.baseURL = config.ai?.openaiBaseURL || undefined;
    this.temperature = config.ai?.defaultTemperature ?? 0.2;
    this.maxOutputTokens = config.ai?.maxOutputTokens || 2048;
    this.defaultLanguage = config.ai?.defaultLanguage || 'en';

    this.client = null;
    this._OpenAIConstructor = null;
    this._requireFailed = false;

    try {
      this._OpenAIConstructor = require('openai');
    } catch (e) {
      this._requireFailed = true;
      this.aiEnabled = false;
      logger.warn('[OpenAIAIService] "openai" npm package is not installed. Run: cd /var/www/dms/backend && npm install openai');
    }

    this._healthCache = null;
    this._healthCachedAt = 0;
    this._healthInFlight = null;
    this.HEALTH_CACHE_TTL_MS = 60 * 1000;
    this.HEALTH_ERROR_CACHE_TTL_MS = 90 * 1000;

    if (this.aiEnabled && this.apiKey && this._OpenAIConstructor) {
      try {
        const opts = {
          apiKey: this.apiKey,
        };
        if (this.baseURL) {
          opts.baseURL = this.baseURL;
        }
        this.client = new this._OpenAIConstructor(opts);
        logger.info('[OpenAIAIService] Initialized with model: ' + this.modelName + (this.baseURL ? ' (baseURL: ' + this.baseURL + ')' : ''));
      } catch (err) {
        logger.error('[OpenAIAIService] Failed to initialize. Error: ' + String(err?.message || err));
        this.aiEnabled = false;
      }
    } else if (!this._requireFailed) {
      logger.warn('[OpenAIAIService] AI is disabled or API key not configured. Hint: Set AI_ENABLED=true and OPENAI_API_KEY in .env');
    }
  }

  isEnabled() {
    return Boolean(this.aiEnabled && this.apiKey && this.apiKey.length > 8);
  }

  isModelReady() {
    return this.client !== null;
  }

  _extractRetryDelayMs(errMessage) {
    if (!errMessage) return 0;
    const s = String(errMessage);
    const m1 = s.match(/retry\s+in\s+([\d.]+)\s*s/i);
    if (m1) return Math.ceil(parseFloat(m1[1]) * 1000) + 500;
    const m2 = s.match(/retryDelay["']?\s*[:=]\s*["']?(\d+)s?["']?/i);
    if (m2) return (parseInt(m2[1], 10) * 1000) + 500;
    return 0;
  }
  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  _responseMIMETypeToFormat(responseMIMEType) {
    if (/^application\/json$/i.test(responseMIMEType || '')) {
      return { type: 'json_object' };
    }
    return undefined;
  }

  async _generateContent(prompt, options = {}) {
    if (!this.isEnabled()) {
      throw new Error('AI service is not enabled. Please configure AI_ENABLED=true and OPENAI_API_KEY.');
    }

    const language = options.language || this.defaultLanguage;
    const systemInstruction = options.systemInstruction || this._getSystemPrompt(language);
    const maxRetries = options.maxRetries ?? 3;

    let lastErr = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const responseFormat = this._responseMIMETypeToFormat(options.responseMIMEType);
        const messages = [];
        messages.push({ role: 'system', content: String(systemInstruction) });
        messages.push({ role: 'user', content: String(prompt) });

        const result = await this.client.chat.completions.create({
          model: this.modelName,
          messages,
          temperature: options.temperature ?? this.temperature,
          max_tokens: options.maxOutputTokens ?? this.maxOutputTokens,
          response_format: responseFormat,
        });

        const reply = result?.choices?.[0]?.message?.content;
        if (!reply) throw new Error('Empty response from OpenAI API');
        return reply;
      } catch (err) {
        lastErr = err;
        const msg = String(err?.message || err || '');
        const statusMatch = msg.match(/\b(4\d{2}|5\d{2})\b/);
        const httpStatus = statusMatch ? parseInt(statusMatch[1], 10) : (err?.status || err?.code || null);
        const isRetryable = /429|5\d{2}|Too Many Requests|quota|retry|timeout|ECONNRESET|ETIMEDOUT|network|rate.?limit/i.test(msg);
        const retryDelayMs = isRetryable
          ? Math.max(this._extractRetryDelayMs(msg), 1000 * Math.pow(2, attempt))
          : 0;

        logger.warn(`[OpenAIAIService] generateContent attempt ${attempt + 1}/${maxRetries + 1} failed`, {
          errMessage: msg.substring(0, 400),
          errName: err?.name || null,
          errStatus: httpStatus,
          retryable: isRetryable,
          retryAfterSec: retryDelayMs ? Math.ceil(retryDelayMs / 1000) : null,
          nextAttempt: isRetryable && attempt < maxRetries ? attempt + 2 : null,
        });

        if (!isRetryable || attempt >= maxRetries) break;
        await this._sleep(retryDelayMs);
      }
    }
    const finalMsg = String(lastErr?.message || lastErr || 'Unknown error');
    logger.error(`[OpenAIAIService] generateContent FAILED after all ${maxRetries + 1} attempts`, {
      errMessage: finalMsg.substring(0, 500),
      errName: lastErr?.name || null,
      errStatus: lastErr?.status || lastErr?.code || null,
    });
    throw new Error(`AI generation failed: ${finalMsg}`);
  }

  _getSystemPrompt(language) {
    const langInstruction = language === 'ms'
      ? 'You are an AI assistant for a Document Management System in Malaysia. PRIMARY LANGUAGE: English — respond in English by default. However, if the user clearly writes entirely in Bahasa Melayu, you may respond in formal, professional Bahasa Melayu suitable for corporate documents. For technical terms, use the English equivalent if it is the industry standard. Never mix languages unnecessarily within a single sentence.'
      : 'You are an AI assistant for a corporate Document Management System (DMS). PRIMARY LANGUAGE: English — always respond in English by default using formal, professional business language suitable for corporate documents and communications. Be precise, concise, and structured. If the user writes in another language (e.g. Bahasa Melayu, Chinese), you must still understand them perfectly, but respond in ENGLISH unless the user explicitly requests otherwise.';

    return `${langInstruction}

CORE GUIDELINES:
1. You specialize in document processing, form filling, classification, and template design.
2. Never fabricate facts, names, dates, or document numbers. If information is missing or ambiguous, state so explicitly.
3. For structured outputs (JSON, field-value pairs), always return valid, parseable JSON only — no markdown code fences, no extra prose.
4. Keep summaries factual and neutral, avoiding opinions or assumptions beyond the provided text.
5. Respect data privacy: do not repeat sensitive information (IC numbers, phone, email) unless explicitly required for the task.
6. When classifying documents, choose the most specific category from the provided list; if none match, use "OTHER" and briefly explain why.
7. LANGUAGE ADAPTATION RULE: For non-JSON conversational responses, if the LAST user message is 100% in a single non-English language (e.g. full Bahasa Melayu sentence), you MAY respond in that language. Otherwise, default to ENGLISH always.`;
  }

  async summarizeDocument(documentText, options = {}) {
    const {
      format = 'paragraphs',
      maxSentences = 8,
      includeKeyPoints = true,
      language,
    } = options;

    const lang = language || this.defaultLanguage;

    let formatInstruction;
    if (format === 'bullet') {
      formatInstruction = `Return the summary as a JSON object with this structure:
{
  "summary": "Short executive summary (1-2 sentences)",
  "keyPoints": ["point 1", "point 2", ...] (max ${maxSentences} points),
  "keywords": ["keyword1", "keyword2", ...] (top 5-8 keywords)
}`;
    } else {
      formatInstruction = `Return the summary as a JSON object with this structure:
{
  "summary": "2-3 paragraph executive summary, concise and professional (max ${maxSentences} sentences total)",
  "keyPoints": ["point 1", "point 2", ...] (max 5 most important points),
  "keywords": ["keyword1", "keyword2", ...] (top 5-8 keywords)
}`;
    }

    const textSnippet = this._truncateText(documentText, 25000);

    const prompt = `Analyse the following document text and produce a professional summary.

${formatInstruction}

DOCUMENT TEXT:
"""
${textSnippet}
"""

Return ONLY valid JSON. Do not wrap in markdown code blocks.`;

    const rawResponse = await this._generateContent(prompt, {
      language: lang,
      responseMIMEType: 'application/json',
      temperature: 0.1,
    });

    return this._safeParseJSON(rawResponse, {
      summary: '',
      keyPoints: [],
      keywords: [],
    });
  }

  async autofillFormFields(fieldDefinitions, contextText, options = {}) {
    const { language, strict = true } = options;
    const lang = language || this.defaultLanguage;

    const fieldsSchema = fieldDefinitions.map(f => ({
      fieldKey: f.fieldKey || f.name || f.fieldName,
      label: f.label || f.displayName,
      type: f.type || f.fieldType || 'TEXT',
      required: f.required || false,
      description: f.description || f.helpText || '',
      options: f.options || f.choices || undefined,
    }));

    const truncatedContext = this._truncateText(contextText || '', 20000);

    const prompt = `You are given a list of form fields and a block of context text. Your task is to extract the correct value for each field FROM THE CONTEXT TEXT ONLY.

RULES FOR EXTRACTION:
- If the information is NOT present in the context text, set value to null. Do NOT guess or invent values.
- For DROPDOWN/SELECT fields: the value MUST match one of the provided options exactly. If no match, use null.
- For DATE fields: return ISO format "YYYY-MM-DD" if found, else null.
- For CHECKBOX/BOOLEAN: return true/false/null.
- For TEXT fields: extract the exact relevant text, trimmed.
- For NUMBER fields: return numeric value as number type, or null.

FORM FIELDS (JSON array):
${JSON.stringify(fieldsSchema, null, 2)}

CONTEXT TEXT TO EXTRACT FROM:
"""
${truncatedContext || '(No context provided)'}
"""

RESPONSE FORMAT (strict JSON only):
{
  "filledFields": {
    "<fieldKey>": <extracted value or null>,
    ...
  },
  "confidenceScores": {
    "<fieldKey>": <0.0 to 1.0 confidence number, or null if not filled>
  },
  "notes": "Short explanation of any fields that could not be filled or had low confidence"
}`;

    const rawResponse = await this._generateContent(prompt, {
      language: lang,
      responseMIMEType: 'application/json',
      temperature: 0.05,
    });

    return this._safeParseJSON(rawResponse, {
      filledFields: {},
      confidenceScores: {},
      notes: '',
    });
  }

  async classifyDocument(documentText, candidateCategories, options = {}) {
    const { language, includeMetadata = true } = options;
    const lang = language || this.defaultLanguage;

    const categories = candidateCategories?.length > 0
      ? candidateCategories
      : [
          'MEMO', 'LETTER', 'REPORT', 'CONTRACT', 'INVOICE', 'PURCHASE_ORDER',
          'MEETING_MINUTES', 'POLICY', 'PROCEDURE', 'CERTIFICATE', 'PROPOSAL',
          'RESIGNATION', 'APPRAISAL', 'OTHER',
        ];

    const truncatedText = this._truncateText(documentText || '', 15000);

    const prompt = `Classify the following document into the most appropriate category.

CANDIDATE CATEGORIES:
${categories.map(c => `- ${c}`).join('\n')}

DOCUMENT TEXT:
"""
${truncatedText}
"""

RESPONSE FORMAT (JSON only):
{
  "category": "<the best matching category from the list above>",
  "confidence": <0.0 to 1.0>,
  "reason": "Short 1-sentence reason for this classification",
  "alternatives": [
    { "category": "<2nd best>", "confidence": <number> },
    { "category": "<3rd best>", "confidence": <number> }
  ],
  ${includeMetadata ? `"suggestedTags": ["tag1", "tag2", ...] (up to 5 descriptive tags),
  "estimatedPriority": "HIGH" | "MEDIUM" | "LOW",
  "sensitivity": "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED"` : ''}
}`;

    const rawResponse = await this._generateContent(prompt, {
      language: lang,
      responseMIMEType: 'application/json',
      temperature: 0.1,
    });

    return this._safeParseJSON(rawResponse, {
      category: 'OTHER',
      confidence: 0,
      reason: 'Classification failed',
      alternatives: [],
      suggestedTags: [],
      estimatedPriority: 'MEDIUM',
      sensitivity: 'INTERNAL',
    });
  }

  async suggestTemplateFields(documentType, templateDescription, existingFields = [], options = {}) {
    const { language, fieldCount = 15 } = options;
    const lang = language || this.defaultLanguage;

    const prompt = `You are designing a Smart Form template for a Document Management System.

TEMPLATE DETAILS:
- Document Type: "${documentType || 'General'}"
- Description/Purpose: "${templateDescription || 'No description provided'}"
- Number of fields to suggest: approximately ${fieldCount}

${existingFields?.length > 0
  ? `EXISTING FIELDS (do NOT repeat these):
${existingFields.map((f, i) => `${i + 1}. ${f.fieldKey || f.name} (${f.type || 'TEXT'}) — ${f.label || ''}`).join('\n')}`
  : 'EXISTING FIELDS: None yet'}

AVAILABLE FIELD TYPES:
- TEXT — Single line short text
- TEXTAREA — Multi-line long text
- NUMBER — Numeric value
- DATE — Date picker
- DROPDOWN — Select from options list
- CHECKBOX — True/False boolean
- EMAIL — Email address
- PHONE — Phone number
- CURRENCY — Monetary amount (MYR default)

RESPONSE FORMAT (JSON only):
{
  "fields": [
    {
      "fieldKey": "UPPERCASE_SNAKE_CASE_KEY",
      "label": "Human readable label",
      "type": "one of the types above",
      "required": true/false,
      "placeholder": "Short hint text for user",
      "helpText": "Brief explanation of what to enter",
      "options": ["opt1", "opt2"] — only for DROPDOWN, else omit,
      "isSupportingField": true/false — true if this is secondary/contextual info,
      "group": "Section name to group this field (e.g. 'Recipient Details', 'Subject')"
    }
  ],
  "suggestedSections": [
    { "sectionName": "Section Name", "order": 1, "description": "What goes here" }
  ],
  "templateTips": [
    "Tip 1 about designing this template well",
    "Tip 2",
    "Tip 3"
  ]
}

Ensure fieldKey is unique, uppercase snake_case, descriptive but not too long. Cover ALL key information needed for "${documentType}".`;

    const rawResponse = await this._generateContent(prompt, {
      language: lang,
      responseMIMEType: 'application/json',
      temperature: 0.3,
      maxOutputTokens: 4096,
    });

    return this._safeParseJSON(rawResponse, {
      fields: [],
      suggestedSections: [],
      templateTips: [],
    });
  }

  async chat({ messages, pageContext, dmsUser, language, temperature }) {
    if (!this.isEnabled()) {
      throw new Error('AI service is not enabled.');
    }
    const lang = language || this.defaultLanguage;
    const systemPrompt = this._getChatSystemPrompt(lang, dmsUser, pageContext);

    try {
      const apiMessages = [];
      apiMessages.push({ role: 'system', content: String(systemPrompt) });

      const normalizedMessages = Array.isArray(messages) ? messages : [];
      const userMessages = normalizedMessages.filter((m) => m.role !== 'system');

      let lastUserMessage = '';
      if (userMessages.length > 0) {
        const mostRecent = userMessages[userMessages.length - 1];
        lastUserMessage = String(mostRecent.content || mostRecent.parts || mostRecent.text || '').trim();
        const earlier = userMessages.slice(0, -1);
        for (let i = 0; i < earlier.length; i++) {
          const m = earlier[i];
          const role = String(m.role || '').toLowerCase();
          const content = String(m.content || m.parts || m.text || '');
          if (!content) continue;
          if (role === 'assistant' || role === 'bot' || role === 'model') {
            apiMessages.push({ role: 'assistant', content });
          } else {
            apiMessages.push({ role: 'user', content });
          }
        }
      }

      let finalPrompt = lastUserMessage || 'Hello';
      if (pageContext && typeof pageContext === 'object') {
        try {
          const ctxStr = JSON.stringify(pageContext, null, 2);
          if (ctxStr.length < 6000) {
            finalPrompt = `${finalPrompt}\n\n---\nCURRENT DMS CONTEXT (only reference if relevant):\n${ctxStr}\n---`;
          }
        } catch { /* ignore */ }
      }
      apiMessages.push({ role: 'user', content: finalPrompt });

      const result = await this.client.chat.completions.create({
        model: this.modelName,
        messages: apiMessages,
        temperature: temperature ?? 0.6,
        max_tokens: this.maxOutputTokens,
      });

      const replyText = result?.choices?.[0]?.message?.content || '';
      const finishReason = result?.choices?.[0]?.finish_reason || 'STOP';

      return {
        role: 'assistant',
        content: replyText,
        model: this.modelName,
        finishReason: String(finishReason).toUpperCase(),
      };
    } catch (err) {
      logger.error('[OpenAIAIService] chat failed:', err.message);
      throw new Error(`AI chat failed: ${err.message}`);
    }
  }

  _getChatSystemPrompt(language, user, pageCtx) {
    const langInstruction = language === 'ms'
      ? `You are "DMS Assistant", the official AI helper for the corporate Document Management System in Malaysia.
LANGUAGE RULE (STRICT):
- DEFAULT / PRIMARY response language: ENGLISH. Always respond in English first.
- EXCEPTION: If the user's LAST message is 100% Bahasa Melayu (no English words except technical terms), you MAY respond in formal, professional Bahasa Melayu — but only for that turn. Next mixed-language or English query → back to English.
- If the user writes in ANY other language (Chinese, Tamil, Arabic etc.), you MUST understand them but reply in ENGLISH.
- Never use Manglish / rojak. Do not mix BM + English within a single paragraph unless the user explicitly did so and you are mirroring.

TONE & EXPERTISE: Friendly, professional, and precise — suitable for office knowledge workers. You specialize in documents, templates, workflows, review/approval, classification, and everything DMS. Keep answers concise. Use light markdown (bullet lists, **bold**, *italics*) where it helps readability. Never fabricate facts. If information is missing, ask a short clarifying question.`
      : `You are "DMS Assistant", the official AI helper for the corporate Document Management System.
LANGUAGE RULE (STRICT):
- DEFAULT / PRIMARY response language: ENGLISH. Always respond in English by default.
- You MUST understand ALL languages the user writes (Bahasa Melayu, Chinese, Tamil, Arabic, etc.).
- EXCEPTION to English-only: If the LAST user message is ENTIRELY in a single non-English language (especially Bahasa Melayu, fully native words), you MAY respond in that same language for that turn only. If the message has ANY English word, or the next message switches, go back to ENGLISH.
- Never use Manglish / rojak. Keep a response purely in ONE language.

TONE & EXPERTISE: Friendly, professional, and precise — suitable for office knowledge workers. You specialize in documents, templates, workflows, review/approval, classification, and everything DMS. Keep answers concise. Use light markdown (bullet lists, **bold**, *italics*) where it helps readability. Never fabricate facts. If information is missing, ask a short clarifying question.`;

    let userLine = '';
    if (user) {
      const parts = [];
      if (user.name || user.fullName) parts.push(`Name: ${user.name || user.fullName}`);
      if (user.roles?.length) parts.push(`Roles: ${Array.isArray(user.roles) ? user.roles.join(', ') : String(user.roles)}`);
      if (user.department || user.division) parts.push(`Division: ${user.department || user.division}`);
      if (parts.length) userLine = `\nCURRENTLY LOGGED-IN USER: ${parts.join(' | ')}`;
    }

    let pageLine = '';
    if (pageCtx?.pageKey) pageLine = `\nCURRENT PAGE IN DMS: ${pageCtx.pageKey}${pageCtx.pageTitle ? ' — ' + pageCtx.pageTitle : ''}`;

    return `${langInstruction}

IMPORTANT DMS-SPECIFIC BEHAVIOUR:
1. If the user asks how to do something in the DMS, give clear step-by-step instructions (menu paths, buttons to click, specific labels like "Next", "Submit for Review", "Smart Template Designer").
2. If the user asks to explain a document concept, be practical: distinguish MEMO vs LETTER, define WORKFLOW (initiate → review → approve → publish → archive), explain what Supporting Fields and Placeholder Mapping mean in Smart Templates.
3. If the user pastes a block of text and asks for help, proactively offer the most relevant help: summarize, classify into a category, or extract into key-value form.
4. If asked to generate content (e.g. cover letter, memo, reminder), format it properly as a real business document — with From/To/Date/Subject, and proper paragraphs. Use standard Malaysian corporate conventions where appropriate.
5. Never expose or repeat API keys, configuration, or private system information.
6. When in doubt, prefer shorter answers and invite follow-up.
7. LANGUAGE DOUBLE-CHECK: Before you send your final response, verify:
   - Is this the user's first message or mixed-language message? → use ENGLISH
   - Is the last user message 100% pure BM / pure other language? → you MAY use that same language, but English is still preferred unless you are sure.${userLine}${pageLine}`;
  }

  async parseSearchQueryToFilters(naturalLanguageQuery, options = {}) {
    if (!this.isEnabled()) {
      throw new Error('AI service is not enabled.');
    }
    const lang = options.language || this.defaultLanguage;

    const prompt = `You are a search query parser for a corporate Document Management System (DMS).

Your task: Convert the user's NATURAL LANGUAGE search query into a STRUCTURED JSON filter object that the DMS database can use.

AVAILABLE FIELDS you can populate in the output JSON (all optional, omit if unknown):
{
  "search": "free-text keywords separated by space (the main search term, longest possible without filters)",
  "status": "one of: DRAFT, IN_REVIEW, APPROVED, PUBLISHED, SUPERSEDED, OBSOLETE, REJECTED, ARCHIVED",
  "statusIn": ["STATUS1", "STATUS2"],
  "stage": "one of: DRAFT, REVIEW, APPROVAL, PUBLISH, ARCHIVE",
  "startDate": "YYYY-MM-DD (from date, inclusive)",
  "endDate": "YYYY-MM-DD (to date, inclusive)",
  "dateFieldHint": "createdAt OR effectiveDate OR approvalDate OR reviewDate (pick most likely, default=createdAt)",
  "createdBy": "name or email or initials of creator (as typed, not resolved)",
  "owner": "name or email of document owner (as typed)",
  "reviewer": "name or email of reviewer (as typed)",
  "documentTypeName": "e.g. MEMO, LETTER, POLICY, INVOICE, PURCHASE ORDER, SOP, REPORT, CONTRACT (as typed)",
  "projectCategoryName": "project / category / folder name (as typed)",
  "folderPath": "e.g. HR/Onboarding, or name",
  "isConfidential": true/false/null,
  "isSmartDocument": true/false/null,
  "sortBy": "createdAt OR updatedAt OR title OR status OR effectiveDate (default=createdAt)",
  "sortOrder": "asc OR desc (default=desc)",
  "limit": 15 to 50,
  "explain": "short 1 sentence: how you interpreted the user's query into filters, in language of original query"
}

IMPORTANT INTERPRETATION RULES:
1. TODAY's DATE REFERENCE: Current date is ${new Date().toISOString().slice(0, 10)}. Today = ${new Date().toDateString()}. Use this to compute relative dates (last week = past 7 days, last month = previous calendar month, Q1 = Jan-Mar, tahun ini = year ${new Date().getFullYear()}).
2. YEAR REFERENCES: "2024", "tahun 2025" → use startDate/endDate covering that year.
3. MONTH REFERENCES: "Januari 2025", "bulan April 2024" → startDate=first day of month, endDate=last day of month. Month names in English or Malay should be recognized.
4. STATUS WORDS (auto-map to status or statusIn):
   - "draf / draft" → DRAFT; "review / semakan" → IN_REVIEW; "approved / diluluskan" → APPROVED; "published / diterbitkan" → PUBLISHED; "lepas / lama / diganti / obsolete" → SUPERSEDED or OBSOLETE
   - "sudah approved / approved & published" → statusIn ["APPROVED","PUBLISHED"]
5. RELATIVE DATES: "last 3 days", "seminggu yang lalu", "bulan lepas", "tahun ini", "Q2 2024" → compute exact startDate/endDate.
6. OWNER/CREATOR: "oleh [Name]", "yang saya create", "milik saya" → use owner or createdBy. "saya sendiri" → leave as hint "current user".
7. DOCUMENT TYPE: name or short form — put into documentTypeName (e.g. PO, MC, SOP, memo, surat rasmi).
8. Free-text keywords that don't match any filter MUST go to "search" joined as single string.
9. COMBINE: When the user mentions BOTH keywords AND filters, populate both appropriately.
10. RETURN ONLY VALID JSON, no markdown code fences, no extra text, no explanations outside the "explain" field.
11. If query is in Malay, your "explain" must be in Malay. If in English, use English.

USER QUERY: """${String(naturalLanguageQuery || '').trim()}"""

OUTPUT (strict JSON only):`;

    const raw = await this._generateContent(prompt, {
      language: lang,
      responseMIMEType: 'application/json',
      temperature: 0.1,
      maxOutputTokens: 1500,
    });

    return this._safeParseJSON(raw, {
      search: String(naturalLanguageQuery || '').trim(),
      explain: 'Fallback: AI could not parse filters, using original query as free-text search.',
    });
  }

  _truncateText(text, maxChars) {
    if (!text) return '';
    const str = String(text);
    if (str.length <= maxChars) return str;
    return str.substring(0, maxChars) + '\n\n... [TRUNCATED - original text longer than context window]';
  }

  _safeParseJSON(raw, fallback) {
    if (!raw) return fallback;
    let cleaned = raw.trim();

    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '');

    try {
      const parsed = JSON.parse(cleaned);
      return { ...fallback, ...parsed };
    } catch (err1) {
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      const firstBracket = cleaned.indexOf('[');
      const lastBracket = cleaned.lastIndexOf(']');

      try {
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          const jsonSubstr = cleaned.substring(firstBrace, lastBrace + 1);
          return { ...fallback, ...JSON.parse(jsonSubstr) };
        }
        if (firstBracket !== -1 && lastBracket > firstBracket) {
          const jsonSubstr = cleaned.substring(firstBracket, lastBracket + 1);
          return JSON.parse(jsonSubstr);
        }
      } catch (err2) {
        logger.warn('[OpenAIAIService] JSON parse failed, returning fallback', { error: err2?.message || String(err2) });
      }

      logger.warn('[OpenAIAIService] Could not parse AI response as JSON, returning fallback');
      return fallback;
    }
  }

  async healthCheck(options = {}) {
    const { force = false, deep = false } = options;
    if (!this.isEnabled()) {
      return {
        enabled: false,
        configured: !!(this.apiKey),
        model: this.modelName,
        status: 'disabled',
        message: this.apiKey
          ? 'AI is disabled via AI_ENABLED=false'
          : 'OPENAI_API_KEY is not set. Get one from https://platform.openai.com/api-keys',
        cached: false,
      };
    }

    const statusIsError = this._healthCache && this._healthCache.status === 'error';
    const cacheTTL = statusIsError ? this.HEALTH_ERROR_CACHE_TTL_MS : this.HEALTH_CACHE_TTL_MS;
    const cacheFresh = !force && !deep && this._healthCache &&
      (Date.now() - this._healthCachedAt) < cacheTTL;
    if (cacheFresh) {
      return { ...this._healthCache, cached: true, cachedSecondsAgo: Math.floor((Date.now() - this._healthCachedAt) / 1000) };
    }

    if (!force && !deep && this._healthInFlight) {
      try {
        const fresh = await this._healthInFlight;
        return { ...fresh, cached: true, coalesced: true, cachedSecondsAgo: 0 };
      } catch (_e) { /* throw below via cache fallback */ }
    }

    if (!force && !deep && statusIsError && (Date.now() - this._healthCachedAt) < (cacheTTL * 1.5)) {
      return { ...this._healthCache, cached: true, cachedSecondsAgo: Math.floor((Date.now() - this._healthCachedAt) / 1000) };
    }

    this._healthInFlight = (async () => {
      try {
        const start = Date.now();
        const result = await this._generateContent('Reply with the exact word "OK" only.', {
          temperature: 0,
          maxOutputTokens: 8,
          maxRetries: 0,
        });
        this._healthCache = {
          enabled: true,
          configured: true,
          model: this.modelName,
          status: 'online',
          latencyMs: Date.now() - start,
          message: `Connection OK. Model responded in ${Date.now() - start}ms`,
        };
        this._healthCachedAt = Date.now();
        return { ...this._healthCache, cached: false };
      } catch (err) {
        this._healthCache = {
          enabled: true,
          configured: true,
          model: this.modelName,
          status: 'error',
          message: `Connection failed: ${err.message}`,
        };
        this._healthCachedAt = Date.now();
        return { ...this._healthCache, cached: false };
      }
    })();

    try {
      return await this._healthInFlight;
    } finally {
      setTimeout(() => { this._healthInFlight = null; }, 100);
    }
  }

  async rephraseText(inputText, options = {}) {
    const {
      style = 'formal',
      language,
      tone = 'professional',
      variants = 2,
      preserveKeyTerms = [],
    } = options;

    if (!inputText || !String(inputText).trim()) {
      throw new Error('Text to rephrase is required.');
    }

    const lang = language || this.defaultLanguage;
    const variantsN = Math.max(1, Math.min(5, Number(variants) || 2));

    const styleRuleMap = {
      formal: 'Rewrite in formal, professional business language suitable for corporate memos, letters and official documents.',
      simple: 'Rewrite in simple, clear, easy-to-understand language for general audiences (standard Bahasa Kebangsaan / plain English, max 10 words per sentence where possible).',
      concise: 'Condense to ~60% the original length, remove redundancies, keep only key information.',
      expand: 'Expand the text with richer context and elaboration (about 140% original length) while staying factual.',
      persuasive: 'Rewrite as persuasive / proposal-style language appropriate for justifications and approval requests.',
      friendly: 'Rewrite in warm, friendly, approachable language suitable for team communication.',
      grammar: 'Fix only grammar, spelling, punctuation, and typos; preserve the original meaning, tone and word choice exactly where grammatically correct.',
    };

    const prompt = `
You are a professional business writer for a corporate DMS.
LANGUAGE RULE:
- DEFAULT OUTPUT LANGUAGE: ENGLISH.
- EXCEPTION: If the INPUT TEXT is 100% pure Bahasa Melayu (no English words except technical/brand terms), you MAY produce output in formal Bahasa Melayu. Otherwise, always output ENGLISH.
- Never mix languages in a single variant; keep each variant in ONE language.

=== REWRITE TASK ===
INPUT TEXT:
"""${String(inputText).trim()}"""

REWRITE STYLE: ${style}
- RULE: ${styleRuleMap[style] || styleRuleMap.formal}
- TONE: ${tone}
- PRODUCE exactly ${variantsN} DISTINCT rephrased variants numbered 1..${variantsN}.
- Each variant MUST be self-contained and ready to paste into a document.
${Array.isArray(preserveKeyTerms) && preserveKeyTerms.length
  ? `- YOU MUST PRESERVE these keywords exactly (DO NOT translate or paraphrase them): ${preserveKeyTerms.map(t => JSON.stringify(t)).join(', ')}`
  : ''}

ALSO produce:
- "summary": one sentence describing what you changed (e.g. "Converted passive voice to active; removed 3 redundant phrases.")
- "wordCountOriginal": number, original words
- "wordCountPerVariant": array of numbers, one per variant

Return VALID JSON ONLY with shape:
{ "variants": string[], "summary": string, "wordCountOriginal": number, "wordCountPerVariant": number[] }
`;

    const raw = await this._generateContent(prompt, {
      language: lang,
      temperature: style === 'grammar' ? 0.05 : 0.4,
      maxOutputTokens: 2500,
      responseMIMEType: 'application/json',
    });

    const parsed = this._safeParseJSON(raw, { variants: [String(inputText).trim()], summary: 'Fallback: returned original text.' });
    if (!Array.isArray(parsed.variants)) parsed.variants = [String(inputText).trim()];
    parsed.appliedStyle = style;
    parsed.appliedTone = tone;
    return parsed;
  }

  async suggestWorkflowRoute(documentContext, options = {}) {
    const {
      language,
      availableStages = [],
      availableRoles = [],
      availableReviewers = [],
      confidenceThreshold = 0.5,
    } = options;

    if (!documentContext || (!documentContext.title && !documentContext.description && !documentContext.text)) {
      throw new Error('Document context (title / description / text) is required for routing suggestion.');
    }

    const lang = language || this.defaultLanguage;
    const docText = [
      documentContext.fileCode && `FILE CODE: ${documentContext.fileCode}`,
      documentContext.title && `TITLE: ${documentContext.title}`,
      documentContext.description && `DESC: ${documentContext.description}`,
      documentContext.documentType && `TYPE: ${documentContext.documentType}`,
      documentContext.projectCategory && `CATEGORY: ${documentContext.projectCategory}`,
      documentContext.createdByName && `CREATED BY: ${documentContext.createdByName}`,
      documentContext.amount && `AMOUNT: ${documentContext.amount}`,
      documentContext.department && `DEPARTMENT: ${documentContext.department}`,
      documentContext.confidentialLevel && `CLASSIFICATION: ${documentContext.confidentialLevel}`,
      documentContext.text && `SNIPPET: ${this._truncateText(String(documentContext.text), 4000)}`,
    ].filter(Boolean).join('\n');

    const prompt = `
You are a DMS Workflow Routing Officer in a corporate environment.
LANGUAGE RULE:
- DEFAULT OUTPUT LANGUAGE: ENGLISH.
- EXCEPTION: If the DOCUMENT TEXT is 100% pure Bahasa Melayu, you MAY write the "reasoning" and "warningFlags" fields in Bahasa Melayu. All structural fields (recommendedAction, recommendedStage etc.) and key JSON keys must use ENGLISH values as specified.
- Never use mixed-language fields.

=== DOCUMENT FOR ROUTING ===
${docText}

=== REFERENCE DATA (if non-empty) ===
AVAILABLE WORKFLOW STAGES: ${JSON.stringify(availableStages)}
AVAILABLE ROLES: ${JSON.stringify(availableRoles)}
AVAILABLE REVIEWERS (name / role / dept): ${JSON.stringify(availableReviewers.slice(0, 50))}

YOUR TASK: Analyze document content and recommend the CORRECT NEXT WORKFLOW ACTION.

Return VALID JSON ONLY with the following shape:
{
  "recommendedStage": string,
  "recommendedAction": string one of: ["APPROVE", "REVIEW", "REVISE", "ESCLATE", "PUBLISH", "REJECT", "ROUTE_TO_HR", "ROUTE_TO_FINANCE", "ROUTE_TO_LEGAL", "ROUTE_TO_COMPLIANCE", "NO_ACTION"],
  "recommendedApproverRole": string | null,
  "recommendedReviewerName": string | null,
  "requiredApprovalLevel": string one of: ["SUPERVISOR", "MANAGER", "HEAD_OF_DEPT", "DIRECTOR", "BOARD", "NONE"],
  "confidence": number between 0 and 1,
  "reasoning": array of 2-4 short strings explaining WHY you recommended this route (specific keywords or clauses),
  "warningFlags": array of strings (e.g. ["High value > RM50k requires 2nd approver", "Confidential document - limited visibility"]),
  "estimatedSlaHours": number | null
}

Additional rules:
1. If amount > RM 50,000 or equivalent → "requiredApprovalLevel": at least "HEAD_OF_DEPT" or above.
2. If it's LEAVE / PERSONNEL / SALARY related → recommendedAction = "ROUTE_TO_HR".
3. If it's INVOICE / PO / PAYMENT / BUDGET related → recommendedAction = "ROUTE_TO_FINANCE".
4. If it's CONTRACT / NDA / TERMS → recommendedAction = "ROUTE_TO_LEGAL".
5. If it's POLICY / SOP / AUDIT / COMPLIANCE → recommendedAction = "ROUTE_TO_COMPLIANCE".
6. ONLY recommend a specific reviewer name IF availableReviewers list contains a clear match.
7. If availableStages list is provided, recommendedStage must be ONE of those values.
8. confidence < ${Number(confidenceThreshold)} means you are unsure → include a warning "Confidence below threshold - please verify manually".
`;

    const raw = await this._generateContent(prompt, {
      language: lang,
      temperature: 0.1,
      maxOutputTokens: 2000,
      responseMIMEType: 'application/json',
    });

    return this._safeParseJSON(raw, {
      recommendedStage: Array.isArray(availableStages) && availableStages[0] ? availableStages[0] : 'REVIEW',
      recommendedAction: 'REVIEW',
      recommendedApproverRole: null,
      recommendedReviewerName: null,
      requiredApprovalLevel: 'SUPERVISOR',
      confidence: 0,
      reasoning: ['Fallback: AI could not determine routing.'],
      warningFlags: ['AI parse failed - verify manually'],
      estimatedSlaHours: null,
    });
  }

  async generateReviewerRemarks(documentContext, options = {}) {
    const {
      decision = 'APPROVE',
      language,
      tone = 'professional',
      customConcerns = [],
      reviewerName = null,
      variants = 2,
    } = options;

    if (!['APPROVE', 'REVISE', 'REJECT'].includes(String(decision).toUpperCase())) {
      throw new Error('Decision must be one of: APPROVE, REVISE, REJECT');
    }

    const lang = language || this.defaultLanguage;
    const decisionUc = String(decision).toUpperCase();

    const docText = [
      documentContext.title && `TITLE: ${documentContext.title}`,
      documentContext.documentType && `TYPE: ${documentContext.documentType}`,
      documentContext.projectCategory && `CATEGORY: ${documentContext.projectCategory}`,
      documentContext.amount && `AMOUNT: ${documentContext.amount}`,
      documentContext.text && `SNIPPET: ${this._truncateText(String(documentContext.text), 3000)}`,
    ].filter(Boolean).join('\n');

    const prompt = `
You are a senior corporate reviewer / approver in a DMS.
LANGUAGE RULE:
- DEFAULT OUTPUT LANGUAGE: ENGLISH.
- EXCEPTION: If the DOCUMENT context is 100% pure Bahasa Melayu, you MAY write the "remarks" text and "followUpActions" in formal Bahasa Melayu. Keep "checklistVerified" and "summaryShort" concise but match the remarks language. All JSON keys and decision values must remain ENGLISH.
- Never mix languages within a single string field.

REVIEW CONTEXT:
DOCUMENT:
${docText || '(document summary not provided)'}

YOUR DECISION: ${decisionUc}
  - APPROVE: Generate formal approval remarks. Sound decisive, reference compliance/conditions where relevant.
  - REVISE: Constructive feedback only — clearly list 2-5 specific changes needed. Do not be vague.
  - REJECT: Professional rejection with clear reasons and what to do next (re-submission path).

ADDITIONAL CONCERNS TO ADDRESS: ${JSON.stringify(Array.isArray(customConcerns) ? customConcerns.slice(0, 5) : [])}
REVIEWER NAME (if known): ${reviewerName || 'Not specified'}
TONE: ${tone}
VARIANTS TO GENERATE: ${Math.max(1, Math.min(4, Number(variants) || 2))}

Return VALID JSON ONLY:
{
  "remarks": [ { "text": string, "label": string (e.g. "Standard", "Detailed", "Concise") } ],
  "checklistVerified": string[],
  "followUpActions": string[],
  "summaryShort": string (max 20 words, suitable for activity feed)
}
`;

    const raw = await this._generateContent(prompt, {
      language: lang,
      temperature: 0.3,
      maxOutputTokens: 2200,
      responseMIMEType: 'application/json',
    });

    return this._safeParseJSON(raw, {
      remarks: [{
        text: `${decisionUc}: ${lang === 'ms' ? 'Disemak dan diluluskan / dikembalikan untuk pindaan.' : 'Reviewed and processed.'}`,
        label: 'Standard',
      }],
      checklistVerified: [],
      followUpActions: [],
      summaryShort: `${decisionUc} via AI fallback`,
    });
  }

  async checkGrammarSpelling(inputText, options = {}) {
    const {
      language = 'auto',
      documentType = 'general',
      strictness = 'normal',
    } = options;

    if (!inputText || !String(inputText).trim()) {
      throw new Error('Text to check is required.');
    }
    const lang = (language && language !== 'auto') ? language : this.defaultLanguage;
    const input = String(inputText);
    const wordCount = input.split(/\s+/).filter(Boolean).length;

    const prompt = `
You are an expert proofreader for a corporate DMS.
You detect and fix:
- Spelling mistakes (including common BM typos such as "saya/saye", "kerja/kerje", "adalah/adlh", "sementara/smentera", English typos)
- Grammar errors (subject-verb agreement, wrong preposition, article misuse, passive/active confusion, BM kata kerja / imbuhan errors)
- Punctuation errors (missing / extra commas, wrong casing, malformed dates)
- Inconsistent capitalization or formatting (dates, numbers, bullet lists)
- Inappropriate tone for corporate documents (slang, casual abbreviations like "gila", "bro", "lol")
- Clarity issues (ambiguous pronouns, overly long sentences, double negatives)

LANGUAGE OF INPUT: ${lang === 'ms' ? 'Bahasa Melayu' : lang === 'en' ? 'English' : 'Auto-detect'}
DOCUMENT TYPE CONTEXT: ${documentType}  (adjust expectations accordingly — forms vs letters vs SOP)
STRICTNESS: ${strictness} (normal / strict / lenient)

TEXT TO CHECK (length: ${input.length} chars, ${wordCount} words):
"""${this._truncateText(input, 8000)}"""

Return VALID JSON ONLY with shape:
{
  "languageDetected": string ("ms" or "en"),
  "overallScore": number from 0 to 100,
  "correctedText": string (the FULL corrected text ready to use),
  "changes": [
    { "category": string one of: ["spelling","grammar","punctuation","style","tone","clarity","formatting"],
      "original": string,
      "suggested": string,
      "reason": string (max 15 words),
      "severity": string one of: ["info","minor","major","critical"] }
  ],
  "stats": { "errorsTotal": number, "criticalErrors": number, "words": number, "chars": number },
  "toneNotes": string | null,
  "readabilityGrade": string | null (e.g. "SPM/Form 4", "Degree", "Easy for general staff")
}

RULES:
1. If original text is ALREADY correct, "changes" = [] and "overallScore" = 100 and "correctedText" = input text.
2. DO NOT invent facts or rewrite meaning.
3. Maximum 30 change entries (most severe first).
4. If language === auto: guess ms vs en and output languageDetected.
`;

    const raw = await this._generateContent(prompt, {
      language: lang,
      temperature: 0.05,
      maxOutputTokens: 3500,
      responseMIMEType: 'application/json',
    });

    const parsed = this._safeParseJSON(raw, {
      languageDetected: lang,
      overallScore: null,
      correctedText: input,
      changes: [],
      stats: { errorsTotal: 0, criticalErrors: 0, words: wordCount, chars: input.length },
      toneNotes: null,
      readabilityGrade: null,
    });
    parsed.stats = parsed.stats || {};
    parsed.stats.words = parsed.stats.words ?? wordCount;
    parsed.stats.chars = parsed.stats.chars ?? input.length;
    parsed.errorsTotal = (parsed.changes || []).length;
    if (parsed.overallScore === null) {
      const sevPenalty = { critical: 15, major: 6, minor: 2, info: 0.5 };
      const pen = (parsed.changes || []).reduce((acc, c) => acc + (sevPenalty[c.severity] || 1), 0);
      parsed.overallScore = Math.max(0, 100 - Math.min(pen, 100));
    }
    return parsed;
  }

}

module.exports = new OpenAIAIService();
