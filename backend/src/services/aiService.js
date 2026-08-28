const config = require('../config/app');
const logger = require('../utils/logger');

const geminiService = require('./geminiAIService');
const openaiService = require('./openaiAIService');

function _selectProvider() {
  const provider = String(config.ai?.provider || 'gemini').toLowerCase();
  if (provider === 'openai') {
    logger.info(`[aiService] Using AI provider: openai');
    return openaiService;
  }
  logger.info(`[aiService] Using AI provider: gemini (default)`);
  return geminiService;
}

module.exports = _selectProvider();
