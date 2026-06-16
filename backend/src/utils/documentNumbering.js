/**
 * Document Numbering Utility
 * Generates document file codes based on system settings configuration
 * Default format: PREFIX/VERSION/YYMMDD/COUNTER
 */

const prisma = require('../config/database');

class DocumentNumbering {
  /**
   * Get default document numbering settings
   * These match the defaults in frontend/src/components/GeneralSystemSettings.jsx
   */
  static getDefaultSettings() {
    return {
      separator: '/',
      prefixPlaceholder: 'PFX',
      includeProjectCategoryCode: false,
      includeVersion: true,
      versionDigits: 2,
      dateFormat: 'YYMMDD',
      counterDigits: 3,
      startingNumber: 1
    };
  }

  /**
   * Load document numbering settings from database
   * @returns {Promise<Object>} Document numbering settings
   */
  static async loadSettings() {
    try {
      const config = await prisma.configuration.findUnique({
        where: { key: 'document_numbering_settings' }
      });

      if (config && config.value) {
        return {
          ...this.getDefaultSettings(),
          ...JSON.parse(config.value)
        };
      }
    } catch (error) {
      console.error('Failed to load document numbering settings from database:', error);
    }

    // Return defaults if not configured or error
    return this.getDefaultSettings();
  }

  static sanitizeCodeSegment(value) {
    return String(value ?? '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
  }

  static buildBasePrefixSegment(prefix, settings = {}) {
    const maxLength = Math.max(1, String(settings?.prefixPlaceholder || 'PFX').length)
    const basePrefix = this.sanitizeCodeSegment(prefix)
    return (basePrefix || 'X').slice(0, maxLength)
  }

  static buildLeadingSegments(prefix, settings = {}, projectCategoryCode = '') {
    const segments = []
    const categoryCode = this.sanitizeCodeSegment(projectCategoryCode)
    const includeProjectCategoryCode = Boolean(settings?.includeProjectCategoryCode)

    if (includeProjectCategoryCode && categoryCode) {
      segments.push(categoryCode)
    }

    segments.push(this.buildBasePrefixSegment(prefix, settings))
    return segments
  }

  /**
   * Format date according to settings
   * @param {Date} date - Date to format
   * @param {string} format - Format string (YYMMDD, YYYYMMDD, YYYYMM, YYMM, YYYY, none)
   * @returns {string} Formatted date string
   */
  static formatDate(date, format) {
    if (!format || format === 'none') {
      return '';
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    switch (format) {
      case 'YYMMDD':
        return String(year).slice(-2) + month + day;
      case 'YYYYMMDD':
        return String(year) + month + day;
      case 'YYYYMM':
        return String(year) + month;
      case 'YYMM':
        return String(year).slice(-2) + month;
      case 'YYYY':
        return String(year);
      default:
        return String(year).slice(-2) + month + day;
    }
  }

  /**
   * Generate file code based on settings
   * @param {string} prefix - Document type prefix (e.g., 'MoM', 'SOP')
   * @param {number} sequence - Sequential number
   * @param {Object} options - Optional parameters
   * @param {Date} options.date - Document date (defaults to current date)
   * @param {string} options.version - Version number (defaults to '1')
   * @param {Object} options.settings - Custom settings (defaults to system settings)
   * @returns {Promise<string>} Generated file code
   */
  static async generateFileCode(prefix, sequence, options = {}) {
    const {
      date = new Date(),
      version = '1',
      settings = null,
      projectCategoryCode = ''
    } = options;

    // Load settings
    const config = settings || await this.loadSettings();
    const parts = [];
    const separator = config.separator || '/';

    // Add optional project category segment followed by the document type prefix segment.
    parts.push(...this.buildLeadingSegments(prefix, config, projectCategoryCode));

    // Add version (if enabled)
    if (config.includeVersion) {
      const versionDigits = parseInt(config.versionDigits) || 2;
      const versionStr = String(version).padStart(versionDigits, '0');
      parts.push(versionStr);
    }

    // Add date (if format is not 'none')
    if (config.dateFormat && config.dateFormat !== 'none') {
      const datePart = this.formatDate(date, config.dateFormat);
      if (datePart) {
        parts.push(datePart);
      }
    }

    // Add counter/sequence
    const counterDigits = parseInt(config.counterDigits) || 3;
    const counter = String(sequence).padStart(counterDigits, '0');
    parts.push(counter);

    // Join with separator
    return parts.join(separator);
  }

  /**
   * Parse file code back into components
   * @param {string} fileCode - File code to parse
   * @param {Object} settings - Settings used to generate the code
   * @returns {Promise<Object>} Parsed components
   */
  static async parseFileCode(fileCode, settings = null) {
    const config = settings || await this.loadSettings();
    const separator = config.separator || '/';
    const parts = fileCode.split(separator);

    const result = {
      prefix: parts[0] || null,
      projectCategoryPrefix: null,
      version: null,
      date: null,
      sequence: null
    };

    let partIndex = 0;

    if (config.includeProjectCategoryCode) {
      const expectedWithoutCategory = 1 + (config.includeVersion ? 1 : 0) + (config.dateFormat && config.dateFormat !== 'none' ? 1 : 0) + 1;
      if (parts.length > expectedWithoutCategory) {
        result.projectCategoryPrefix = parts[partIndex] || null;
        partIndex++;
      }
    }

    result.prefix = parts[partIndex] || null;
    partIndex++;

    // Parse version (if enabled)
    if (config.includeVersion && parts[partIndex]) {
      result.version = parts[partIndex];
      partIndex++;
    }

    // Parse date (if format is not 'none')
    if (config.dateFormat && config.dateFormat !== 'none' && parts[partIndex]) {
      result.date = parts[partIndex];
      partIndex++;
    }

    // Parse sequence (last part)
    if (parts[partIndex]) {
      result.sequence = parseInt(parts[partIndex]);
    }

    return result;
  }

  /**
   * Preview file code format without actual sequence number
   * Useful for showing examples in UI
   * @param {string} prefix - Document type prefix
   * @param {Object} options - Options
   * @returns {Promise<string>} Preview file code
   */
  static async previewFileCode(prefix = 'PFX', options = {}) {
    const {
      date = new Date(),
      version = '1',
      settings = null,
      projectCategoryCode = ''
    } = options;

    return await this.generateFileCode(prefix, 1, { date, version, settings, projectCategoryCode });
  }
}

module.exports = DocumentNumbering;
