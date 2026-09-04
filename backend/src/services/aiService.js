const config = require('../config/app');
const logger = require('../utils/logger');

let geminiService = null;
let openaiService = null;

try {
  geminiService = require('./geminiAIService');
} catch (e) {
  logger.error('[aiService] Failed to load geminiAIService: ' + String(e && e.message ? e.message : e));
}

try {
  openaiService = require('./openaiAIService');
} catch (e) {
  logger.warn('[aiService] Failed to load openaiAIService (openai package may not be installed yet). ' +
    'Run: cd /var/www/dms/backend && npm install openai');
  openaiService = null;
}

function _selectProvider() {
  const provider = String((config.ai && config.ai.provider) || 'gemini').toLowerCase();

  if (provider === 'openai') {
    if (openaiService) {
      logger.info('[aiService] Using AI provider: openai');
      return openaiService;
    } else {
      logger.warn('[aiService] AI_PROVIDER=openai but openai service unavailable. Falling back to gemini (default).');
    }
  }

  if (!geminiService) {
    logger.error('[aiService] NEITHER openai nor gemini service available. AI features disabled.');
    return {
      isEnabled: function () { return false; },
      isModelReady: function () { return false; },
      summarizeDocument: function () { return Promise.reject(new Error('AI service unavailable')); },
      autofillFormFields: function () { return Promise.reject(new Error('AI service unavailable')); },
      classifyDocument: function () { return Promise.reject(new Error('AI service unavailable')); },
      suggestTemplateFields: function () { return Promise.reject(new Error('AI service unavailable')); },
      chat: function () { return Promise.reject(new Error('AI service unavailable')); },
      parseSearchQueryToFilters: function () { return Promise.reject(new Error('AI service unavailable')); },
      healthCheck: function () { return Promise.resolve({ enabled: false, configured: false, model: null, status: 'disabled', message: 'No AI provider loaded', cached: false }); },
      rephraseText: function () { return Promise.reject(new Error('AI service unavailable')); },
      suggestWorkflowRoute: function () { return Promise.reject(new Error('AI service unavailable')); },
      generateReviewerRemarks: function () { return Promise.reject(new Error('AI service unavailable')); },
      checkGrammarSpelling: function () { return Promise.reject(new Error('AI service unavailable')); },
    };
  }

  logger.info('[aiService] Using AI provider: gemini (default)');
  return geminiService;
}

module.exports = _selectProvider();
