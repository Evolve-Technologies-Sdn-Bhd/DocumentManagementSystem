const fs = require('fs').promises;
const PizZip = require('pizzip');
const { BadRequestError } = require('../utils/errors');

const PLACEHOLDER_REGEX = /\{\{\s*([^\{\}]+?)\s*\}\}/g;

function _decodeXmlEntities(str) {
  return String(str || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function _flattenDocxXml(xmlContent) {
  let flat = String(xmlContent || '');
  flat = _decodeXmlEntities(flat);
  flat = flat.replace(/<w:del\b[\s\S]*?<\/w:del>/g, '');
  flat = flat.replace(/<w:instrText\b[^>]*>[\s\S]*?<\/w:instrText>/g, '');
  flat = flat.replace(/<w:bookmarkStart\b[^>]*\/?>/gi, '');
  flat = flat.replace(/<w:bookmarkEnd\b[^>]*\/?>/gi, '');
  flat = flat.replace(/<w:proofErr\b[^>]*\/?>/gi, '');
  flat = flat.replace(/<w:permStart\b[^>]*\/?>/gi, '');
  flat = flat.replace(/<w:permEnd\b[^>]*\/?>/gi, '');
  flat = flat.replace(/<[^>]+>/g, '');
  return flat;
}

class SmartDocumentPlaceholderExtractor {

  async extractFromFilePath(filePath) {
    try {
      const buffer = await fs.readFile(filePath);
      return await this.extractFromBuffer(buffer);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new BadRequestError('Template file not found: ' + filePath);
      }
      if (error instanceof BadRequestError) throw error;
      throw new BadRequestError('Failed to read template file: ' + error.message);
    }
  }

  async extractFromBuffer(buffer) {
    try {
      if (!Buffer.isBuffer(buffer)) {
        throw new BadRequestError('Input must be a Buffer');
      }

      let zip;
      try {
        zip = new PizZip(buffer);
      } catch (e) {
        throw new BadRequestError('Invalid DOCX file: unable to unzip');
      }

      const xmlTexts = [];
      const files = zip.files;

      if (files['word/document.xml']) {
        xmlTexts.push({
          name: 'word/document.xml',
          content: files['word/document.xml'].asText()
        });
      }

      Object.keys(files).forEach((fileName) => {
        if (/^word\/header\d*\.xml$/.test(fileName)) {
          xmlTexts.push({
            name: fileName,
            content: files[fileName].asText()
          });
        }
        if (/^word\/footer\d*\.xml$/.test(fileName)) {
          xmlTexts.push({
            name: fileName,
            content: files[fileName].asText()
          });
        }
      });

      if (files['word/_rels/document.xml.rels']) {
        xmlTexts.push({
          name: 'word/_rels/document.xml.rels',
          content: files['word/_rels/document.xml.rels'].asText()
        });
      }

      const placeholderMap = new Map();

      xmlTexts.forEach(({ content }) => {
        let match;
        const flattened = _flattenDocxXml(content);
        const regex = new RegExp(PLACEHOLDER_REGEX.source, 'g');
        while ((match = regex.exec(flattened))) {
          const fullMatch = match[0];
          let cleanName = String(match[1] || '')
            .replace(/[\s\u00A0\u200B-\u200D\uFEFF]+/g, '')
            .replace(/[^\w\.\-]/g, '');
          if (!cleanName) continue;
          cleanName = cleanName.toLowerCase();
          const displayName = '{{' + cleanName + '}}';
          if (!placeholderMap.has(cleanName)) {
            placeholderMap.set(cleanName, {
              name: displayName,
              cleanName: cleanName,
              contextInferred: 'SIMPLE'
            });
          }
        }
      });

      const documentXml = files['word/document.xml'] ? files['word/document.xml'].asText() : '';
      const tableRowMarkers = this._inferTableRowPlaceholders(documentXml, Array.from(placeholderMap.values()));

      tableRowMarkers.forEach((cleanName) => {
        if (placeholderMap.has(cleanName)) {
          placeholderMap.get(cleanName).contextInferred = 'TABLE_ROW';
        }
      });

      const repeatedMarkers = this._inferRepeatedSections(Array.from(placeholderMap.values()));

      repeatedMarkers.forEach((cleanName) => {
        if (placeholderMap.has(cleanName) && placeholderMap.get(cleanName).contextInferred === 'SIMPLE') {
          placeholderMap.get(cleanName).contextInferred = 'REPEATED';
        }
      });

      return {
        placeholders: Array.from(placeholderMap.values())
      };

    } catch (error) {
      if (error instanceof BadRequestError) throw error;
      throw new BadRequestError('Failed to extract placeholders: ' + error.message);
    }
  }

  _inferTableRowPlaceholders(xmlString, placeholders) {
    const result = new Set();
    try {
      const trRegex = /<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g;
      let trMatch;
      while ((trMatch = trRegex.exec(xmlString))) {
        const trContent = trMatch[1];
        const flattenedTr = _flattenDocxXml(trContent);
        const foundInTr = [];
        const regex = new RegExp(PLACEHOLDER_REGEX.source, 'g');
        let m;
        while ((m = regex.exec(flattenedTr))) {
          let cn = String(m[1] || '')
            .replace(/[\s\u00A0\u200B-\u200D\uFEFF]+/g, '')
            .replace(/[^\w\.\-]/g, '')
            .toLowerCase();
          if (cn) foundInTr.push(cn);
        }
        if (foundInTr.length >= 2) {
          foundInTr.forEach((cleanName) => result.add(cleanName));
        }
      }
    } catch (e) {
      // noop
    }
    return Array.from(result);
  }

  _inferRepeatedSections(placeholders) {
    const result = new Set();
    const prefixMap = new Map();

    placeholders.forEach((ph) => {
      const dotIdx = ph.cleanName.indexOf('.');
      if (dotIdx > 0 && dotIdx < ph.cleanName.length - 1) {
        const prefix = ph.cleanName.substring(0, dotIdx);
        if (!prefixMap.has(prefix)) {
          prefixMap.set(prefix, []);
        }
        prefixMap.get(prefix).push(ph.cleanName);
      }
    });

    prefixMap.forEach((names, prefix) => {
      if (names.length >= 2) {
        names.forEach((n) => result.add(n));
      }
    });

    return Array.from(result);
  }
}

module.exports = new SmartDocumentPlaceholderExtractor();
