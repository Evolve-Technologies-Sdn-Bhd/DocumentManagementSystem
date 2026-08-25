const PizZip = require('pizzip');
const fs = require('fs');
const path = require('path');
const { BadRequestError } = require('../utils/errors');
const appConfig = require('../config/app');
const { buildPgNumTypeXml } = require('../utils/pageNumbering');

const PAGE_SIZE_PRESETS = {
  A4: { widthMm: 210, heightMm: 297 },
  LETTER: { widthMm: 215.9, heightMm: 279.4 },
  LEGAL: { widthMm: 215.9, heightMm: 355.6 },
  CUSTOM: null
};

const REL_TYPES = {
  HEADER: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header',
  FOOTER: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer',
  IMAGE: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
  HYPERLINK: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink'
};

function mmToTwips(mm) {
  const num = Number(mm);
  if (isNaN(num) || !isFinite(num)) return 0;
  return Math.round(num * 56.6929133858);
}

function mmToEmu(mm) {
  const num = Number(mm);
  if (isNaN(num) || !isFinite(num)) return 0;
  return Math.round(num * (914400 / 25.4));
}

function ensureXmlDirective(xmlString) {
  if (!xmlString) return xmlString;
  const trimmed = String(xmlString).trimStart();
  if (trimmed.startsWith('<?xml ')) return xmlString;
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + xmlString;
}

function findOrCreateSectPr(xmlString) {
  if (!xmlString) {
    return { xml: xmlString, sectPrStart: -1, sectPrEnd: -1, created: false };
  }

  const bodyEndMatch = xmlString.match(/<\/w:body>/);
  if (!bodyEndMatch) {
    return { xml: xmlString, sectPrStart: -1, sectPrEnd: -1, created: false };
  }
  const bodyEndIndex = bodyEndMatch.index;

  const sectPrRegex = /<w:sectPr\b[^>]*>[\s\S]*?<\/w:sectPr>/g;
  let lastMatch = null;
  let m;
  while ((m = sectPrRegex.exec(xmlString))) {
    lastMatch = m;
  }

  if (lastMatch && lastMatch.index < bodyEndIndex) {
    return {
      xml: xmlString,
      sectPrStart: lastMatch.index,
      sectPrEnd: lastMatch.index + lastMatch[0].length,
      sectPrOuter: lastMatch[0],
      created: false
    };
  }

  const emptySectPr = '<w:sectPr></w:sectPr>';
  const before = xmlString.substring(0, bodyEndIndex);
  const after = xmlString.substring(bodyEndIndex);
  const newXml = before + emptySectPr + after;
  const newStart = before.length;
  return {
    xml: newXml,
    sectPrStart: newStart,
    sectPrEnd: newStart + emptySectPr.length,
    sectPrOuter: emptySectPr,
    created: true
  };
}

function findOrCreateDocDefaults(stylesXml) {
  try {
    const docDefaultsMatch = stylesXml.match(/<w:docDefaults\b[^>]*>([\s\S]*?)<\/w:docDefaults>/);
    if (docDefaultsMatch) {
      return { stylesXml, docDefaultsInner: docDefaultsMatch[1], docDefaultsOuter: docDefaultsMatch[0] };
    }
    const rPrDefaultXml = '<w:docDefaults><w:rPrDefault><w:rPr></w:rPr></w:rPrDefault></w:docDefaults>';
    const stylesTagMatch = stylesXml.match(/<w:styles\b[^>]*>/);
    if (!stylesTagMatch) return { stylesXml, docDefaultsInner: '', docDefaultsOuter: '' };
    const idx = stylesTagMatch.index + stylesTagMatch[0].length;
    const newStylesXml = stylesXml.substring(0, idx) + rPrDefaultXml + stylesXml.substring(idx);
    return { stylesXml: newStylesXml, docDefaultsInner: '<w:rPrDefault><w:rPr></w:rPr></w:rPrDefault>', docDefaultsOuter: rPrDefaultXml };
  } catch (e) {
    console.warn('[SmartDocumentFormatter] findOrCreateDocDefaults failed:', e.message);
    return { stylesXml, docDefaultsInner: '', docDefaultsOuter: '' };
  }
}

function findOrCreateStyle(stylesXml, styleId, styleName, styleType) {
  try {
    const styleRegex = new RegExp(`<w:style\\b[^>]*\\bw:styleId="${styleId}"[^>]*>([\\s\\S]*?)<\\/w:style>`);
    const existingMatch = stylesXml.match(styleRegex);
    if (existingMatch) {
      return { stylesXml, styleInner: existingMatch[1], styleOuter: existingMatch[0], created: false };
    }
    const newStyleXml = `<w:style w:type="${styleType}" w:default="0" w:styleId="${styleId}"><w:name w:val="${styleName}"/><w:qFormat/><w:rPr></w:rPr></w:style>`;
    const stylesCloseMatch = stylesXml.match(/<\/w:styles>/);
    if (!stylesCloseMatch) return { stylesXml, styleInner: '', styleOuter: '', created: false };
    const idx = stylesCloseMatch.index;
    const newStylesXml = stylesXml.substring(0, idx) + newStyleXml + stylesXml.substring(idx);
    return { stylesXml: newStylesXml, styleInner: newStyleXml.match(styleRegex)[1], styleOuter: newStyleXml, created: true };
  } catch (e) {
    console.warn('[SmartDocumentFormatter] findOrCreateStyle failed:', e.message);
    return { stylesXml, styleInner: '', styleOuter: '', created: false };
  }
}

function resolvePageDimensions(styleProfile) {
  const sizeEnum = (styleProfile && styleProfile.pageSize) ? String(styleProfile.pageSize).toUpperCase() : 'A4';
  const preset = PAGE_SIZE_PRESETS[sizeEnum];

  let widthMm;
  let heightMm;

  if (preset) {
    widthMm = preset.widthMm;
    heightMm = preset.heightMm;
  } else if (sizeEnum === 'CUSTOM') {
    widthMm = Number(styleProfile.pageWidthMm || 0);
    heightMm = Number(styleProfile.pageHeightMm || 0);
    if (!widthMm || !heightMm) {
      widthMm = PAGE_SIZE_PRESETS.A4.widthMm;
      heightMm = PAGE_SIZE_PRESETS.A4.heightMm;
    }
  } else {
    widthMm = PAGE_SIZE_PRESETS.A4.widthMm;
    heightMm = PAGE_SIZE_PRESETS.A4.heightMm;
  }

  const orient = (styleProfile && styleProfile.pageOrientation)
    ? String(styleProfile.pageOrientation).toUpperCase()
    : 'PORTRAIT';

  if (orient === 'LANDSCAPE') {
    const tmp = widthMm;
    widthMm = heightMm;
    heightMm = tmp;
  }

  return { widthMm, heightMm, orientation: orient };
}

function buildPgSz(widthMm, heightMm, orientation) {
  const w = mmToTwips(widthMm);
  const h = mmToTwips(heightMm);
  const orientAttr = orientation === 'LANDSCAPE' ? ' w:orient="landscape"' : '';
  return `<w:pgSz w:w="${w}" w:h="${h}"${orientAttr}/>`;
}

function buildPgMar(styleProfile) {
  const sp = styleProfile || {};
  const top = mmToTwips(sp.marginTopMm != null ? sp.marginTopMm : 25.4);
  const bottom = mmToTwips(sp.marginBottomMm != null ? sp.marginBottomMm : 25.4);
  const left = mmToTwips(sp.marginLeftMm != null ? sp.marginLeftMm : 25.4);
  const right = mmToTwips(sp.marginRightMm != null ? sp.marginRightMm : 25.4);
  const header = 720;
  const footer = 720;
  const gutter = 0;
  return `<w:pgMar w:top="${top}" w:right="${right}" w:bottom="${bottom}" w:left="${left}" w:header="${header}" w:footer="${footer}" w:gutter="${gutter}"/>`;
}

function replaceOrInsertChild(sectPrInner, childTag, replacementXml) {
  const selfRegex = new RegExp(`<w:${childTag}\\b[^/]*/>`, 'i');
  const pairRegex = new RegExp(`<w:${childTag}\\b[^>]*>[\\s\\S]*?<\\/w:${childTag}>`, 'i');
  if (pairRegex.test(sectPrInner)) {
    return sectPrInner.replace(pairRegex, replacementXml);
  }
  if (selfRegex.test(sectPrInner)) {
    return sectPrInner.replace(selfRegex, replacementXml);
  }
  return sectPrInner + replacementXml;
}

function buildUniqueRelId(existingRIds) {
  const set = new Set((existingRIds || []).map(id => String(id)));
  let n = 100;
  while (set.has(`rId${n}`)) n++;
  return `rId${n}`;
}

function resolveLogoFilePath(logoPath) {
  if (!logoPath) return null;
  try {
    const isUrl = /^https?:\/\//i.test(logoPath);
    if (isUrl) return null;

    let candidate = logoPath;
    if (candidate.startsWith('/uploads/')) {
      candidate = path.join(appConfig.uploadDir, candidate.substring('/uploads/'.length));
    } else if (candidate.startsWith('uploads/')) {
      candidate = path.join(appConfig.uploadDir, candidate.substring('uploads/'.length));
    } else if (!path.isAbsolute(candidate)) {
      candidate = path.resolve(process.cwd(), candidate);
    }
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
    return null;
  } catch (e) {
    console.warn('[SmartDocumentFormatter] resolveLogoFilePath failed:', logoPath, e.message);
    return null;
  }
}

function escapeXml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeFormatterSystemValues(styleProfile, systemValues) {
  const sp = styleProfile || {};
  const sv = systemValues || {};
  const refCode = sv.referenceCode || sv.docCode || sv.fileCode || sv.documentReferenceCode || '';
  const ver = sv.version || sv.revision || '';
  let effDate = sv.effectiveDate || sv.preparedDate || sv.publishedDate || '';
  if (effDate) {
    try {
      const d = effDate instanceof Date ? effDate : new Date(String(effDate));
      if (!isNaN(d.getTime())) {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        effDate = `${dd}/${mm}/${d.getFullYear()}`;
      }
    } catch (_) { /* use raw */ }
  }
  return {
    referenceCode: refCode,
    docCode: refCode,
    revision: ver,
    version: ver,
    effectiveDate: effDate,
    preparedByName: sv.preparedByName || sv.preparedByFullName || sv.preparedBy || '',
    approvedByName: sv.approvedByName || sv.approvedByFullName || sv.approvedBy || '',
    reviewedByName: sv.reviewedByFullName || sv.reviewedByName || sv.reviewedBy || '',
    companyName: sp.headerCompanyName || sp.companyName || sv.companyName || '',
    classification: sp.footerClassificationMark || sp.classificationMark || '',
    confidential: sp.footerConfidentialText || sp.confidentialText || '',
    copyright: sp.footerDisclaimerText || sp.copyrightText || '',
    disclaimer: sp.footerDisclaimerText || ''
  };
}

function buildPageFieldXml(format) {
  const fmt = (format || 'Page X of Y').toString();
  const pageFld =
    '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
    '<w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>' +
    '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
    '<w:r><w:t>1</w:t></w:r>' +
    '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
  const numPagesFld =
    '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
    '<w:r><w:instrText xml:space="preserve"> NUMPAGES </w:instrText></w:r>' +
    '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
    '<w:r><w:t>1</w:t></w:r>' +
    '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
  if (fmt === '- X -') {
    return `<w:r><w:t xml:space="preserve">- </w:t></w:r>${pageFld}<w:r><w:t xml:space="preserve"> -</w:t></w:r>`;
  }
  if (fmt === 'Page X') {
    return `<w:r><w:t xml:space="preserve">Page </w:t></w:r>${pageFld}`;
  }
  return `<w:r><w:t xml:space="preserve">Page </w:t></w:r>${pageFld}<w:r><w:t xml:space="preserve"> of </w:t></w:r>${numPagesFld}`;
}

function resolveColumnContentXml(rawValue, styleProfile, systemValues) {
  const sp = styleProfile || {};
  const sv = normalizeFormatterSystemValues(sp, systemValues);
  if (!rawValue) return '';
  if (typeof rawValue !== 'string') return `<w:r><w:t xml:space="preserve">${escapeXml(String(rawValue))}</w:t></w:r>`;
  if (!rawValue.startsWith('__TYPE:')) {
    return `<w:r><w:t xml:space="preserve">${escapeXml(rawValue)}</w:t></w:r>`;
  }
  const typeKey = rawValue.slice('__TYPE:'.length);
  switch (typeKey) {
    case 'page_number':
      return buildPageFieldXml(sp.pageNumberFormat);
    case 'doc_code_rev': {
      const parts = [];
      if (sv.referenceCode) parts.push(escapeXml(sv.referenceCode));
      if (sv.revision) parts.push('Rev ' + escapeXml(sv.revision));
      return parts.length > 0
        ? `<w:r><w:t xml:space="preserve">${escapeXml(parts.join(' '))}</w:t></w:r>`
        : '';
    }
    case 'effective_date':
      return sv.effectiveDate
        ? `<w:r><w:t xml:space="preserve">${escapeXml(sv.effectiveDate)}</w:t></w:r>`
        : '';
    case 'prepared_by':
      return sv.preparedByName
        ? `<w:r><w:t xml:space="preserve">Prepared: ${escapeXml(sv.preparedByName)}</w:t></w:r>`
        : '';
    case 'approved_by':
      return sv.approvedByName
        ? `<w:r><w:t xml:space="preserve">Approved: ${escapeXml(sv.approvedByName)}</w:t></w:r>`
        : '';
    case 'copyright': {
      const txt = sv.copyright || sp.footerDisclaimerText || '';
      return txt ? `<w:r><w:t xml:space="preserve">${escapeXml(txt)}</w:t></w:r>` : '';
    }
    case 'classification': {
      const clsParts = [];
      if (sv.classification) clsParts.push(escapeXml(sv.classification));
      if (sv.confidential) clsParts.push(escapeXml(sv.confidential));
      return clsParts.length > 0
        ? `<w:r><w:t xml:space="preserve">${escapeXml(clsParts.join(' '))}</w:t></w:r>`
        : '';
    }
    case 'company_name':
      return sv.companyName
        ? `<w:r><w:t xml:space="preserve">${escapeXml(sv.companyName)}</w:t></w:r>`
        : '';
    default:
      return '';
  }
}

function ensureChild(parentXml, childRegex, insertBeforePattern, replacement) {
  if (!parentXml) return replacement;
  if (childRegex.test(parentXml)) {
    return parentXml.replace(childRegex, replacement);
  }
  if (insertBeforePattern) {
    const idx = parentXml.search(insertBeforePattern);
    if (idx >= 0) {
      return parentXml.substring(0, idx) + replacement + parentXml.substring(idx);
    }
  }
  const selfCloseMatch = parentXml.match(/<([a-zA-Z0-9:]+)\b[^\/]*\/>$/);
  const openCloseMatch = parentXml.match(/<([a-zA-Z0-9:]+)\b[^>]*>([\s\S]*?)<\/\1>$/);
  if (openCloseMatch) {
    const tagEnd = parentXml.lastIndexOf(`</${openCloseMatch[1]}>`);
    return parentXml.substring(0, tagEnd) + replacement + parentXml.substring(tagEnd);
  }
  if (selfCloseMatch) {
    return parentXml.replace(/\/>$/, '>' + replacement + `</${selfCloseMatch[1]}>`);
  }
  return parentXml + replacement;
}

function parseRelIdsFromRelsXml(relsXml) {
  const ids = [];
  const relRegex = /<Relationship\b[^>]*\sId="([^"]+)"/g;
  let m;
  while ((m = relRegex.exec(relsXml))) ids.push(m[1]);
  return ids;
}

function removeRelsByType(relsXml, type) {
  if (!relsXml) return relsXml;
  const relRegex = new RegExp(`<Relationship\\b[^>]*\\sType="${type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^/]*/>`, 'g');
  return relsXml.replace(relRegex, '');
}

function removeRelsByTarget(relsXml, targetPattern) {
  if (!relsXml) return relsXml;
  const relRegex = new RegExp(`<Relationship\\b[^>]*\\sTarget="${targetPattern}"[^/]*/>`, 'g');
  return relsXml.replace(relRegex, '');
}

function addRelEntry(relsXml, id, type, target) {
  const entry = `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`;
  if (!relsXml) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${entry}</Relationships>`;
  }
  return relsXml.replace(/<\/Relationships>/, entry + '</Relationships>');
}

function buildTabStopsXml() {
  return '<w:tabs><w:tab w:val="center" w:pos="4680"/><w:tab w:val="right" w:pos="9360"/></w:tabs>';
}

function getTypographyCategory(profile, categoryKey) {
  try {
    let tj = profile && profile.typographyJson;
    if (typeof tj === 'string') {
      try { tj = JSON.parse(tj); } catch (e) { tj = null; }
    }
    if (tj && tj[categoryKey] && typeof tj[categoryKey] === 'object') {
      return tj[categoryKey];
    }
  } catch (e) {
    console.warn('[SmartDocumentFormatter] typographyJson parse failed:', e.message);
  }
  return null;
}

function buildRunPropsXml(cat, fallback) {
  const fontFamily = (cat && cat.fontFamily) || (fallback && fallback.fontFamily) || 'Calibri';
  const fontSizePt = (cat && cat.fontSizePt != null) ? Number(cat.fontSizePt) : (fallback && fallback.fontSizePt != null ? Number(fallback.fontSizePt) : 11);
  const bold = (cat && cat.bold != null) ? !!cat.bold : (fallback && fallback.bold != null ? !!fallback.bold : false);
  const italic = (cat && cat.italic != null) ? !!cat.italic : (fallback && fallback.italic != null ? !!fallback.italic : false);
  const underline = (cat && cat.underline != null) ? !!cat.underline : (fallback && fallback.underline != null ? !!fallback.underline : false);
  const color = (cat && cat.color) || (fallback && fallback.color) || null;
  const fillColor = (cat && cat.fillColor) || (fallback && fallback.fillColor) || null;
  const szHalfPt = Math.round(Number(fontSizePt) * 2);
  const fontFamilyEsc = escapeXml(fontFamily);
  const colorVal = color ? String(color).replace(/^#/, '') : null;
  const fillVal = fillColor ? String(fillColor).replace(/^#/, '') : null;

  let xml = '';
  xml += `<w:rFonts w:ascii="${fontFamilyEsc}" w:hAnsi="${fontFamilyEsc}" w:cs="${fontFamilyEsc}" w:eastAsia="${fontFamilyEsc}"/>`;
  if (bold) xml += '<w:b w:val="true"/>';
  if (italic) xml += '<w:i w:val="true"/>';
  if (underline) xml += '<w:u w:val="single"/>';
  if (colorVal) xml += `<w:color w:val="${colorVal}"/>`;
  if (fillVal) xml += `<w:shd w:val="clear" w:color="auto" w:fill="${fillVal}"/>`;
  xml += `<w:sz w:val="${szHalfPt}"/><w:szCs w:val="${szHalfPt}"/>`;
  return xml;
}

function buildParaPropsXml(cat, fallback) {
  const spacingBeforePt = (cat && cat.spacingBeforePt != null) ? Number(cat.spacingBeforePt) : (fallback && fallback.spacingBeforePt != null ? Number(fallback.spacingBeforePt) : 0);
  const spacingAfterPt = (cat && cat.spacingAfterPt != null) ? Number(cat.spacingAfterPt) : (fallback && fallback.spacingAfterPt != null ? Number(fallback.spacingAfterPt) : 0);
  const lineSpacingMultiplier = (cat && cat.lineSpacingMultiplier != null) ? Number(cat.lineSpacingMultiplier) : (fallback && fallback.lineSpacingMultiplier != null ? Number(fallback.lineSpacingMultiplier) : 1.15);
  const indentMm = (cat && cat.indentMm != null) ? Number(cat.indentMm) : (fallback && fallback.indentMm != null ? Number(fallback.indentMm) : 0);
  const verticalAlign = (cat && cat.verticalAlign) || (fallback && fallback.verticalAlign) || null;

  const beforeTwips = Math.round(spacingBeforePt * 20);
  const afterTwips = Math.round(spacingAfterPt * 20);
  const lineVal = Math.round(lineSpacingMultiplier * 240);
  const indentTwips = mmToTwips(indentMm);

  let xml = '<w:pPr>';
  xml += `<w:spacing w:before="${beforeTwips}" w:after="${afterTwips}" w:line="${lineVal}" w:lineRule="auto"/>`;
  if (indentTwips > 0) xml += `<w:ind w:firstLine="${indentTwips}"/>`;
  if (verticalAlign) xml += `<w:vAlign w:val="${escapeXml(verticalAlign)}"/>`;
  xml += '</w:pPr>';
  return xml;
}

function buildFullStyleBlock(styleId, styleName, styleType, cat, fallback) {
  const rPr = buildRunPropsXml(cat, fallback);
  const pPr = styleType === 'paragraph' ? buildParaPropsXml(cat, fallback) : '';
  return `<w:style w:type="${styleType}" w:default="0" w:styleId="${styleId}"><w:name w:val="${styleName}"/><w:qFormat/>${pPr}<w:rPr>${rPr}</w:rPr></w:style>`;
}

function applyTypographyStyles(zip, docXml, profile) {
  try {
    const sp = profile || {};
    let tj = sp.typographyJson;
    if (typeof tj === 'string') {
      try { tj = JSON.parse(tj); } catch (e) { tj = null; }
    }

    const stylesFile = zip.file('word/styles.xml');
    if (!stylesFile) return docXml;
    let stylesXml = stylesFile.asText();

    const fallbackBody = {
      fontFamily: sp.bodyFontFamily || 'Calibri',
      fontSizePt: sp.bodyFontSizePt != null ? Number(sp.bodyFontSizePt) : 11,
      color: sp.bodyFontColor || null,
      lineSpacingMultiplier: sp.bodyLineSpacing || 1.15,
      bold: false, italic: false, underline: false
    };

    const headingFallback = (level) => ({
      fontFamily: sp.headingFontFamily || fallbackBody.fontFamily,
      fontSizePt: sp[`heading${level}FontSizePt`] != null ? Number(sp[`heading${level}FontSizePt`]) : (20 - (level - 1) * 2),
      color: sp.headingFontColor || null,
      bold: true,
      spacingAfterPt: 12 - level,
      spacingBeforePt: level === 1 ? 0 : 12
    });

    const updateStyleInXml = (stylesXml, styleId, styleName, styleType, cat, fallback) => {
      try {
        const styleRegex = new RegExp(`<w:style\\b[^>]*\\bw:styleId="${styleId}"[^>]*>([\\s\\S]*?)<\\/w:style>`);
        const existingMatch = stylesXml.match(styleRegex);
        const newBlock = buildFullStyleBlock(styleId, styleName, styleType, cat, fallback);
        if (existingMatch) {
          return stylesXml.replace(styleRegex, newBlock);
        }
        const stylesCloseMatch = stylesXml.match(/<\/w:styles>/);
        if (!stylesCloseMatch) return stylesXml;
        const idx = stylesCloseMatch.index;
        return stylesXml.substring(0, idx) + newBlock + stylesXml.substring(idx);
      } catch (e) {
        console.warn(`[SmartDocumentFormatter] updateStyle ${styleId} failed:`, e.message);
        return stylesXml;
      }
    };

    try {
      stylesXml = updateStyleInXml(stylesXml, 'Heading1', 'heading 1', 'paragraph', tj ? tj.heading1 : null, headingFallback(1));
    } catch (e) { console.warn('[SmartDocumentFormatter] Heading1 typography failed:', e.message); }

    try {
      stylesXml = updateStyleInXml(stylesXml, 'Heading2', 'heading 2', 'paragraph', tj ? tj.heading2 : null, headingFallback(2));
    } catch (e) { console.warn('[SmartDocumentFormatter] Heading2 typography failed:', e.message); }

    try {
      stylesXml = updateStyleInXml(stylesXml, 'Heading3', 'heading 3', 'paragraph', tj ? tj.heading3 : null, headingFallback(3));
    } catch (e) { console.warn('[SmartDocumentFormatter] Heading3 typography failed:', e.message); }

    try {
      stylesXml = updateStyleInXml(stylesXml, 'Heading4', 'heading 4', 'paragraph', tj ? tj.heading4 : null, headingFallback(4));
    } catch (e) { console.warn('[SmartDocumentFormatter] Heading4 typography failed:', e.message); }

    try {
      stylesXml = updateStyleInXml(stylesXml, 'Normal', 'Normal', 'paragraph', tj ? tj.body : null, fallbackBody);
    } catch (e) { console.warn('[SmartDocumentFormatter] Normal typography failed:', e.message); }

    try {
      stylesXml = updateStyleInXml(stylesXml, 'TableHeader', 'Table Header', 'paragraph', tj ? tj.tableHeader : null, { ...fallbackBody, bold: true, fontSizePt: 10 });
    } catch (e) { console.warn('[SmartDocumentFormatter] TableHeader typography failed:', e.message); }

    try {
      stylesXml = updateStyleInXml(stylesXml, 'TableCell', 'Table Cell', 'paragraph', tj ? tj.tableCell : null, { ...fallbackBody, fontSizePt: 10 });
    } catch (e) { console.warn('[SmartDocumentFormatter] TableCell typography failed:', e.message); }

    try {
      stylesXml = updateStyleInXml(stylesXml, 'ListParagraph', 'List Paragraph', 'paragraph', tj ? tj.listItem : null, { ...fallbackBody, indentMm: 7.2 });
    } catch (e) { console.warn('[SmartDocumentFormatter] ListParagraph typography failed:', e.message); }

    try {
      stylesXml = updateStyleInXml(stylesXml, 'HeaderText', 'Header', 'paragraph', tj ? tj.headerText : null, { ...fallbackBody, fontSizePt: 10 });
    } catch (e) { console.warn('[SmartDocumentFormatter] HeaderText typography failed:', e.message); }

    try {
      stylesXml = updateStyleInXml(stylesXml, 'FooterText', 'Footer', 'paragraph', tj ? tj.footerText : null, { ...fallbackBody, fontSizePt: 8, color: '#6B7280' });
    } catch (e) { console.warn('[SmartDocumentFormatter] FooterText typography failed:', e.message); }

    try {
      stylesXml = updateStyleInXml(stylesXml, 'Caption', 'Caption', 'paragraph', tj ? tj.caption : null, { ...fallbackBody, italic: true, fontSizePt: 9 });
    } catch (e) { console.warn('[SmartDocumentFormatter] Caption typography failed:', e.message); }

    try {
      const dd = findOrCreateDocDefaults(stylesXml);
      if (dd && dd.docDefaultsOuter) {
        const rPrDefaultMatch = dd.docDefaultsInner.match(/<w:rPrDefault\b[^>]*>([\s\S]*?)<\/w:rPrDefault>/);
        if (rPrDefaultMatch) {
          const rPrMatch = rPrDefaultMatch[1].match(/<w:rPr\b([^>]*)>([\s\S]*?)<\/w:rPr>/);
          const rPrAttrs = rPrMatch ? (rPrMatch[1] || '') : '';
          const newRPrInner = buildRunPropsXml(tj ? tj.body : null, fallbackBody);
          const newRPr = `<w:rPr${rPrAttrs}>${newRPrInner}</w:rPr>`;
          const newRPrDefault = `<w:rPrDefault>${newRPr}</w:rPrDefault>`;
          const newDocDefaults = `<w:docDefaults>${newRPrDefault}</w:docDefaults>`;
          stylesXml = stylesXml.replace(dd.docDefaultsOuter, newDocDefaults);
        }
      }
    } catch (e) { console.warn('[SmartDocumentFormatter] docDefaults update failed:', e.message); }

    zip.file('word/styles.xml', ensureXmlDirective(stylesXml));
    return docXml;
  } catch (e) {
    console.warn('[SmartDocumentFormatter] applyTypographyStyles failed (continuing):', e.message);
    return docXml;
  }
}

function applyPageGeometry(docXml, profile) {
  try {
    const sp = profile || {};
    const dimensions = resolvePageDimensions(sp);
    const pgSzXml = buildPgSz(dimensions.widthMm, dimensions.heightMm, dimensions.orientation);
    const pgMarXml = buildPgMar(sp);

    const found = findOrCreateSectPr(docXml);
    if (found.sectPrStart < 0) return docXml;
    docXml = found.xml;

    const useHybrid = sp.useHybridPageNumbering === true;
    const frontFmt = sp.frontMatterFormat || 'lowerRoman';
    const firstNum = sp.firstPageNumber != null ? Math.max(1, Number(sp.firstPageNumber) || 1) : 1;

    if (useHybrid) {
      const allSectPrRegex = /<w:sectPr\b[^>]*>[\s\S]*?<\/w:sectPr>/g;
      const all = [];
      let m;
      while ((m = allSectPrRegex.exec(docXml))) all.push({ index: m.index, len: m[0].length, outer: m[0] });

      if (all.length > 1) {
        let working = docXml;
        for (let i = all.length - 1; i >= 0; i--) {
          const s = all[i];
          const isLast = i === all.length - 1;
          const innerMatch = s.outer.match(/^<w:sectPr\b([^>]*)>([\s\S]*)<\/w:sectPr>$/);
          if (!innerMatch) continue;
          const attrs = innerMatch[1] || '';
          let inner = innerMatch[2] || '';
          inner = replaceOrInsertChild(inner, 'pgSz', pgSzXml);
          inner = replaceOrInsertChild(inner, 'pgMar', pgMarXml);
          if (isLast) {
            inner = replaceOrInsertChild(inner, 'pgNumType', buildPgNumTypeXml('decimal', 1));
          } else {
            inner = replaceOrInsertChild(inner, 'pgNumType', buildPgNumTypeXml(frontFmt, firstNum));
          }
          const newOuter = `<w:sectPr${attrs}>${inner}</w:sectPr>`;
          working = working.substring(0, s.index) + newOuter + working.substring(s.index + s.len);
        }
        return working;
      }
    }

    const outer = docXml.substring(found.sectPrStart, found.sectPrEnd);
    const innerMatch = outer.match(/^<w:sectPr\b([^>]*)>([\s\S]*)<\/w:sectPr>$/);
    if (!innerMatch) return docXml;
    const attrs = innerMatch[1] || '';
    let inner = innerMatch[2] || '';
    inner = replaceOrInsertChild(inner, 'pgSz', pgSzXml);
    inner = replaceOrInsertChild(inner, 'pgMar', pgMarXml);
    if (useHybrid) {
      const fmt = (sp.frontMatterFormat && sp.frontMatterFormat !== 'lowerRoman' && sp.frontMatterFormat !== 'upperRoman') ? sp.frontMatterFormat : 'decimal';
      inner = replaceOrInsertChild(inner, 'pgNumType', buildPgNumTypeXml(fmt, firstNum));
    } else if (firstNum > 1) {
      inner = replaceOrInsertChild(inner, 'pgNumType', buildPgNumTypeXml('decimal', firstNum));
    }
    const newOuter = `<w:sectPr${attrs}>${inner}</w:sectPr>`;
    return docXml.substring(0, found.sectPrStart) + newOuter + docXml.substring(found.sectPrEnd);
  } catch (e) {
    console.warn('[SmartDocumentFormatter] applyPageGeometry failed (continuing):', e.message);
    return docXml;
  }
}

function buildHeaderXml({ styleProfile, headerValues, headerLogoRelId }) {
  const sp = styleProfile || {};
  const hv = headerValues || {};
  const sys = normalizeFormatterSystemValues(sp, hv);

  const parts = [];
  parts.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  parts.push('<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">');

  let firstPPr = `<w:pPr>${buildTabStopsXml()}</w:pPr>`;
  let firstRuns = '';

  if (sp.headerLogoPath && headerLogoRelId) {
    const logoWidthMm = sp.logoWidthMm != null ? Number(sp.logoWidthMm) : 50;
    const logoHeightMm = sp.logoHeightMm != null ? Number(sp.logoHeightMm) : 0;
    const logoWidthTwips = logoWidthMm > 0 ? mmToTwips(logoWidthMm) : 2835;
    const logoHeightTwips = logoHeightMm > 0 ? mmToTwips(logoHeightMm) : 0;
    const cxEmu = Math.round(logoWidthTwips * 635);
    const cyEmu = Math.round(logoHeightTwips * 635);
    firstRuns += `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cxEmu}" cy="${cyEmu}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="1" name="HeaderLogo" descr=""/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="HeaderLogo.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${headerLogoRelId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cxEmu}" cy="${cyEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  }

  const rawLeft = sp.headerLeftText != null ? sp.headerLeftText : (sp.headerText1 || '');
  const rawCenter = sp.headerCenterText != null ? sp.headerCenterText : '';
  const rawRight = sp.headerRightText != null ? sp.headerRightText : '';

  let leftRuns = resolveColumnContentXml(rawLeft, sp, sys);
  let centerRuns = resolveColumnContentXml(rawCenter, sp, sys);
  let rightRuns = resolveColumnContentXml(rawRight, sp, sys);

  if (!centerRuns && (sp.includeFileCodeInDoc || sp.includeRevisionInDoc)) {
    if (sp.includeFileCodeInDoc) {
      const fc = sys.docCode || hv.fileCode || '';
      if (fc) centerRuns = `<w:r><w:t xml:space="preserve">File Code: ${escapeXml(fc)}</w:t></w:r>`;
    }
  }
  if (!rightRuns && sp.includeRevisionInDoc) {
    const rv = sys.revision || hv.revision || '';
    if (rv) rightRuns = `<w:r><w:t xml:space="preserve">Revision: ${escapeXml(rv)}</w:t></w:r>`;
  }

  const hasTabCenter = leftRuns || centerRuns;
  const hasTabRight = hasTabCenter || rightRuns;
  if (firstRuns) firstRuns += `<w:r><w:t xml:space="preserve">\t</w:t></w:r>`;
  firstRuns += leftRuns;
  if (hasTabCenter) firstRuns += `<w:r><w:t xml:space="preserve">\t</w:t></w:r>` + centerRuns;
  if (hasTabRight) firstRuns += `<w:r><w:t xml:space="preserve">\t</w:t></w:r>` + rightRuns;

  parts.push(`<w:p>${firstPPr}${firstRuns}</w:p>`);

  const secondLine = sp.headerText2 || '';
  if (secondLine && !rawCenter) {
    parts.push(`<w:p><w:r><w:t xml:space="preserve">${escapeXml(secondLine)}</w:t></w:r></w:p>`);
  }

  parts.push('</w:hdr>');
  return parts.join('');
}

function buildProfessionalHeaderXml(profile, systemValues, context) {
  const sp = profile || {};
  const ctx = context || {};
  const headerLogoRelId = ctx.headerLogoRelId || null;
  const mailtoRelId = ctx.mailtoRelId || null;

  const parts = [];
  parts.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  parts.push('<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">');

  try {
    const logoWidthMm = sp.logoWidthMm != null ? Number(sp.logoWidthMm) : 40;
    const logoHeightMm = sp.logoHeightMm != null ? Number(sp.logoHeightMm) : 20;
    const logoWidthTwips = mmToTwips(logoWidthMm);
    const logoHeightTwips = mmToTwips(logoHeightMm);
    const logoCxEmu = mmToEmu(logoWidthMm);
    const logoCyEmu = mmToEmu(logoHeightMm);

    const pageWidth = 11906;
    const col1Pct = 0.30;
    const col2Pct = 0.70;
    const col1W = Math.round(pageWidth * col1Pct);
    const col2W = Math.round(pageWidth * col2Pct);

    parts.push('<w:tbl>');
    parts.push('<w:tblPr>');
    parts.push('<w:tblW w:w="0" w:type="auto"/>');
    parts.push('<w:tblBorders>');
    parts.push('<w:top w:val="none" w:sz="0" w:space="0" w:color="auto"/>');
    parts.push('<w:left w:val="none" w:sz="0" w:space="0" w:color="auto"/>');
    parts.push('<w:bottom w:val="none" w:sz="0" w:space="0" w:color="auto"/>');
    parts.push('<w:right w:val="none" w:sz="0" w:space="0" w:color="auto"/>');
    parts.push('<w:insideH w:val="none" w:sz="0" w:space="0" w:color="auto"/>');
    parts.push('<w:insideV w:val="none" w:sz="0" w:space="0" w:color="auto"/>');
    parts.push('</w:tblBorders>');
    parts.push('</w:tblPr>');
    parts.push('<w:tblGrid>');
    parts.push(`<w:gridCol w:w="${col1W}"/>`);
    parts.push(`<w:gridCol w:w="${col2W}"/>`);
    parts.push('</w:tblGrid>');
    parts.push('<w:tr>');

    parts.push('<w:tc>');
    parts.push('<w:tcPr>');
    parts.push(`<w:tcW w:w="${col1W}" w:type="dxa"/>`);
    parts.push('<w:vAlign w:val="center"/>');
    parts.push('</w:tcPr>');
    parts.push('<w:p><w:pPr><w:jc w:val="left"/></w:pPr>');
    if (sp.headerLogoPath && headerLogoRelId) {
      try {
        parts.push(`<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${logoCxEmu}" cy="${logoCyEmu}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="1" name="HeaderLogo" descr="Company Logo"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="HeaderLogo.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${headerLogoRelId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${logoCxEmu}" cy="${logoCyEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`);
      } catch (e) {
        console.warn('[SmartDocumentFormatter] Logo embed failed:', e.message);
      }
    } else {
      parts.push(`<w:r><w:rPr><w:sz w:val="2"/></w:rPr><w:t xml:space="preserve">&#160;</w:t></w:r>`);
    }
    parts.push('</w:p>');
    parts.push('</w:tc>');

    parts.push('<w:tc>');
    parts.push('<w:tcPr>');
    parts.push(`<w:tcW w:w="${col2W}" w:type="dxa"/>`);
    parts.push('<w:vAlign w:val="top"/>');
    parts.push('</w:tcPr>');

    try {
      const companyName = sp.headerCompanyName || '';
      const companyRegNo = sp.headerCompanyRegNo || '';
      const companyNameColor = sp.headerCompanyNameColor ? String(sp.headerCompanyNameColor).replace(/^#/, '') : '1F2937';
      const companyNameUnderline = sp.headerCompanyNameUnderline === true;
      const headerTextCat = getTypographyCategory(sp, 'headerText');
      const nameFontFamily = (headerTextCat && headerTextCat.fontFamily) || sp.bodyFontFamily || 'Calibri';
      const nameFontFamilyEsc = escapeXml(nameFontFamily);
      const nameSizeHalfPt = Math.round(16 * 2);
      const regSizeHalfPt = Math.round(11 * 2);
      const stdSizeHalfPt = Math.round(10 * 2);
      const stdColor = '374151';

      parts.push('<w:p><w:pPr><w:spacing w:before="0" w:after="40" w:line="240" w:lineRule="auto"/></w:pPr>');
      if (companyName) {
        parts.push(`<w:r><w:rPr><w:rFonts w:ascii="${nameFontFamilyEsc}" w:hAnsi="${nameFontFamilyEsc}" w:cs="${nameFontFamilyEsc}" w:eastAsia="${nameFontFamilyEsc}"/><w:b w:val="true"/>${companyNameUnderline ? '<w:u w:val="single"/>' : ''}<w:color w:val="${companyNameColor}"/><w:sz w:val="${nameSizeHalfPt}"/><w:szCs w:val="${nameSizeHalfPt}"/></w:rPr><w:t xml:space="preserve">${escapeXml(companyName)}</w:t></w:r>`);
      }
      if (companyRegNo) {
        parts.push(`<w:r><w:rPr><w:rFonts w:ascii="${nameFontFamilyEsc}" w:hAnsi="${nameFontFamilyEsc}" w:cs="${nameFontFamilyEsc}" w:eastAsia="${nameFontFamilyEsc}"/><w:color w:val="${stdColor}"/><w:sz w:val="${regSizeHalfPt}"/><w:szCs w:val="${regSizeHalfPt}"/></w:rPr><w:t xml:space="preserve"> ${escapeXml(companyRegNo)}</w:t></w:r>`);
      }
      parts.push('</w:p>');

      let addressLines = [];
      try {
        let addrJson = sp.headerCompanyAddressJson;
        if (typeof addrJson === 'string' && addrJson) {
          try { addrJson = JSON.parse(addrJson); } catch (e) { addrJson = null; }
        }
        if (Array.isArray(addrJson)) {
          addressLines = addrJson.filter(l => l && String(l).trim().length > 0);
        }
      } catch (e) {
        console.warn('[SmartDocumentFormatter] Address parse failed:', e.message);
        addressLines = [];
      }

      for (let i = 0; i < addressLines.length; i++) {
        parts.push(`<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:color w:val="${stdColor}"/><w:sz w:val="${stdSizeHalfPt}"/><w:szCs w:val="${stdSizeHalfPt}"/></w:rPr><w:t xml:space="preserve">${escapeXml(addressLines[i])}</w:t></w:r></w:p>`);
      }

      if (addressLines.length > 0) {
        parts.push(`<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="120" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr><w:t xml:space="preserve">&#160;</w:t></w:r></w:p>`);
      }

      if (sp.headerCompanyPhone) {
        parts.push(`<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:color w:val="${stdColor}"/><w:sz w:val="${stdSizeHalfPt}"/><w:szCs w:val="${stdSizeHalfPt}"/></w:rPr><w:t xml:space="preserve">${escapeXml(sp.headerCompanyPhone)}</w:t></w:r></w:p>`);
      }

      if (sp.headerCompanyEmail) {
        const emailColor = sp.headerCompanyEmailColor ? String(sp.headerCompanyEmailColor).replace(/^#/, '') : '0563C1';
        const emailEsc = escapeXml(sp.headerCompanyEmail);
        parts.push('<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>');
        if (mailtoRelId) {
          parts.push(`<w:hyperlink r:id="${mailtoRelId}" w:history="1"><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:color w:val="${emailColor}"/><w:u w:val="single"/><w:sz w:val="${stdSizeHalfPt}"/><w:szCs w:val="${stdSizeHalfPt}"/></w:rPr><w:t xml:space="preserve">${emailEsc}</w:t></w:r></w:hyperlink>`);
        } else {
          parts.push(`<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:color w:val="${emailColor}"/><w:u w:val="single"/><w:sz w:val="${stdSizeHalfPt}"/><w:szCs w:val="${stdSizeHalfPt}"/></w:rPr><w:t xml:space="preserve">${emailEsc}</w:t></w:r>`);
        }
        parts.push('</w:p>');
      }
    } catch (e) {
      console.warn('[SmartDocumentFormatter] Column 2 content failed:', e.message);
    }

    parts.push('</w:tc>');
    parts.push('</w:tr>');
    parts.push('</w:tbl>');

    if (sp.headerBottomDividerEnabled === true) {
      try {
        const thicknessPt = sp.headerBottomDividerWidthPt != null ? Number(sp.headerBottomDividerWidthPt) : 1.0;
        const dividerColor = sp.headerBottomDividerColor ? String(sp.headerBottomDividerColor).replace(/^#/, '') : '000000';
        const szEighths = Math.max(1, Math.round(thicknessPt * 8));
        parts.push(`<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="${szEighths}" w:space="1" w:color="${dividerColor}"/></w:pBdr></w:pPr></w:p>`);
      } catch (e) {
        console.warn('[SmartDocumentFormatter] Header divider failed:', e.message);
      }
    }
  } catch (e) {
    console.warn('[SmartDocumentFormatter] Pro header table build failed (fallback to legacy):', e.message);
    return buildHeaderXml({ styleProfile: sp, headerValues: systemValues || {}, headerLogoRelId: ctx.headerLogoRelId });
  }

  parts.push('</w:hdr>');
  return parts.join('');
}

function buildFooterXml({ styleProfile, footerValues }) {
  const sp = styleProfile || {};
  const fv = footerValues || {};
  const sys = normalizeFormatterSystemValues(sp, fv);

  const parts = [];
  parts.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  parts.push('<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">');

  const ppr = `<w:pPr>${buildTabStopsXml()}</w:pPr>`;

  const rawLeft = sp.footerLeftText != null ? sp.footerLeftText : (sp.footerText1 || '');
  const rawCenter = sp.footerCenterText != null ? sp.footerCenterText : (fv.preparedByLine || sp.footerText2 || '');
  const rawRight = sp.footerRightText != null ? sp.footerRightText : '';

  const leftRuns = resolveColumnContentXml(rawLeft, sp, sys);
  const centerRuns = resolveColumnContentXml(rawCenter, sp, sys);
  const rightRuns = resolveColumnContentXml(rawRight, sp, sys);

  const hasTypePage = (s) => typeof s === 'string' && s.startsWith('__TYPE:page_number');
  const explicitPage = hasTypePage(rawLeft) || hasTypePage(rawCenter) || hasTypePage(rawRight);

  let runs = '';
  runs += leftRuns;
  runs += `<w:r><w:t xml:space="preserve">\t</w:t></w:r>`;
  runs += centerRuns;
  runs += `<w:r><w:t xml:space="preserve">\t</w:t></w:r>`;
  runs += rightRuns;

  if (!explicitPage) {
    const pnf = (sp.pageNumberFormat || '').toString();
    const showLegacyPage = sp.showPageNumbers !== false && pnf !== 'None';
    if (showLegacyPage) {
      runs += buildPageFieldXml(pnf);
    }
  }

  parts.push(`<w:p>${ppr}${runs}</w:p>`);
  parts.push('</w:ftr>');
  return parts.join('');
}

function buildProfessionalFooterXml(profile, systemValues) {
  try {
    const sp = profile || {};
    const sv = systemValues || {};

    const parts = [];
    parts.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
    parts.push('<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">');

    if (sp.footerTopDividerEnabled === true) {
      try {
        const widthPt = sp.footerTopDividerWidthPt != null ? Number(sp.footerTopDividerWidthPt) : 0.75;
        const dividerColor = sp.footerTopDividerColor ? String(sp.footerTopDividerColor).replace(/^#/, '') : '6B7280';
        const szEighths = Math.max(1, Math.round(widthPt * 8));
        parts.push(`<w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="${szEighths}" w:space="1" w:color="${dividerColor}"/></w:pBdr></w:pPr></w:p>`);
      } catch (e) {
        console.warn('[SmartDocumentFormatter] Footer divider failed:', e.message);
      }
    }

    const footerTextCat = getTypographyCategory(sp, 'footerText');
    const footerFontFamily = (footerTextCat && footerTextCat.fontFamily) || sp.bodyFontFamily || 'Calibri';
    const ffEsc = escapeXml(footerFontFamily);
    const footerColor = (footerTextCat && footerTextCat.color) ? String(footerTextCat.color).replace(/^#/, '') : '6B7280';
    const classSize = Math.round(8 * 2);
    const textSize = Math.round(8 * 2);

    let hasTopRowContent = false;
    const leftItems = [];
    const centerItems = [];
    const rightItems = [];

    if (sp.footerClassificationMark) {
      leftItems.push(`<w:r><w:rPr><w:rFonts w:ascii="${ffEsc}" w:hAnsi="${ffEsc}" w:cs="${ffEsc}"/><w:b w:val="true"/><w:color w:val="${footerColor}"/><w:sz w:val="${classSize}"/><w:szCs w:val="${classSize}"/></w:rPr><w:t xml:space="preserve">${escapeXml(sp.footerClassificationMark)}</w:t></w:r>`);
    }
    if (sp.footerConfidentialText) {
      leftItems.push(`<w:r><w:rPr><w:rFonts w:ascii="${ffEsc}" w:hAnsi="${ffEsc}" w:cs="${ffEsc}"/><w:color w:val="${footerColor}"/><w:sz w:val="${textSize}"/><w:szCs w:val="${textSize}"/></w:rPr><w:t xml:space="preserve">${leftItems.length > 0 ? ' ' : ''}${escapeXml(sp.footerConfidentialText)}</w:t></w:r>`);
    }

    if (sp.footerShowDocCodeAndRev && (sv.docCode || sv.revision)) {
      const docPart = [sv.docCode || ''];
      if (sv.revision) docPart.push(` Rev ${sv.revision}`);
      centerItems.push(`<w:r><w:rPr><w:rFonts w:ascii="${ffEsc}" w:hAnsi="${ffEsc}" w:cs="${ffEsc}"/><w:color w:val="${footerColor}"/><w:sz w:val="${textSize}"/><w:szCs w:val="${textSize}"/></w:rPr><w:t xml:space="preserve">${escapeXml(docPart.join(''))}</w:t></w:r>`);
    }
    if (sp.footerShowEffectiveDate && sv.effectiveDate) {
      let formattedDate = sv.effectiveDate;
      try {
        const d = sv.effectiveDate instanceof Date ? sv.effectiveDate : new Date(String(sv.effectiveDate));
        if (!isNaN(d.getTime())) {
          const dd = String(d.getDate()).padStart(2, '0');
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const yyyy = d.getFullYear();
          formattedDate = `${dd}/${mm}/${yyyy}`;
        }
      } catch (e) { /* use raw */ }
      centerItems.push(`<w:r><w:rPr><w:rFonts w:ascii="${ffEsc}" w:hAnsi="${ffEsc}" w:cs="${ffEsc}"/><w:color w:val="${footerColor}"/><w:sz w:val="${textSize}"/><w:szCs w:val="${textSize}"/></w:rPr><w:t xml:space="preserve">${escapeXml(formattedDate)}</w:t></w:r>`);
    }
    if (sp.footerShowPreparedBy && sv.preparedByName) {
      centerItems.push(`<w:r><w:rPr><w:rFonts w:ascii="${ffEsc}" w:hAnsi="${ffEsc}" w:cs="${ffEsc}"/><w:color w:val="${footerColor}"/><w:sz w:val="${textSize}"/><w:szCs w:val="${textSize}"/></w:rPr><w:t xml:space="preserve">Prepared: ${escapeXml(sv.preparedByName)}</w:t></w:r>`);
    }
    if (sp.footerShowApprovedBy && sv.approvedByName) {
      centerItems.push(`<w:r><w:rPr><w:rFonts w:ascii="${ffEsc}" w:hAnsi="${ffEsc}" w:cs="${ffEsc}"/><w:color w:val="${footerColor}"/><w:sz w:val="${textSize}"/><w:szCs w:val="${textSize}"/></w:rPr><w:t xml:space="preserve">Approved: ${escapeXml(sv.approvedByName)}</w:t></w:r>`);
    }

    if (sp.footerDisclaimerText) {
      rightItems.push(`<w:r><w:rPr><w:rFonts w:ascii="${ffEsc}" w:hAnsi="${ffEsc}" w:cs="${ffEsc}"/><w:color w:val="${footerColor}"/><w:sz w:val="${textSize}"/><w:szCs w:val="${textSize}"/></w:rPr><w:t xml:space="preserve">${escapeXml(sp.footerDisclaimerText)}</w:t></w:r>`);
    }

    hasTopRowContent = leftItems.length > 0 || centerItems.length > 0 || rightItems.length > 0;

    if (hasTopRowContent) {
      parts.push('<w:p>');
      parts.push(`<w:pPr>${buildTabStopsXml()}<w:spacing w:before="20" w:after="40" w:line="200" w:lineRule="auto"/></w:pPr>`);
      parts.push(leftItems.join(''));
      parts.push('<w:r><w:t xml:space="preserve">\t</w:t></w:r>');
      if (centerItems.length > 0) {
        let first = true;
        for (const ci of centerItems) {
          if (!first) parts.push(`<w:r><w:rPr><w:rFonts w:ascii="${ffEsc}" w:hAnsi="${ffEsc}" w:cs="${ffEsc}"/><w:color w:val="${footerColor}"/><w:sz w:val="${textSize}"/><w:szCs w:val="${textSize}"/></w:rPr><w:t xml:space="preserve"> — </w:t></w:r>`);
          parts.push(ci);
          first = false;
        }
      }
      parts.push('<w:r><w:t xml:space="preserve">\t</w:t></w:r>');
      parts.push(rightItems.join(''));
      parts.push('</w:p>');
    }

    const pnf = (sp.pageNumberFormat || '').toString();
    const showPage = sp.showPageNumbers !== false && pnf !== 'None';

    if (showPage) {
      parts.push('<w:p>');
      parts.push('<w:pPr><w:jc w:val="center"/><w:spacing w:before="20" w:after="0" w:line="200" w:lineRule="auto"/></w:pPr>');
      const buildPageField = () => {
        return '<w:r><w:fldChar w:fldCharType="begin"/></w:r>'
          + '<w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>'
          + '<w:r><w:fldChar w:fldCharType="separate"/></w:r>'
          + '<w:r><w:t>1</w:t></w:r>'
          + '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
      };
      const buildNumPagesField = () => {
        return '<w:r><w:fldChar w:fldCharType="begin"/></w:r>'
          + '<w:r><w:instrText xml:space="preserve"> NUMPAGES </w:instrText></w:r>'
          + '<w:r><w:fldChar w:fldCharType="separate"/></w:r>'
          + '<w:r><w:t>1</w:t></w:r>'
          + '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
      };
      const pageRpr = `<w:rPr><w:rFonts w:ascii="${ffEsc}" w:hAnsi="${ffEsc}" w:cs="${ffEsc}"/><w:color w:val="${footerColor}"/><w:sz w:val="${textSize}"/><w:szCs w:val="${textSize}"/></w:rPr>`;
      if (pnf === '- X -') {
        parts.push(`<w:r>${pageRpr}<w:t xml:space="preserve">- </w:t></w:r>${buildPageField()}<w:r>${pageRpr}<w:t xml:space="preserve"> -</w:t></w:r>`);
      } else if (pnf === 'Page X') {
        parts.push(`<w:r>${pageRpr}<w:t xml:space="preserve">Page </w:t></w:r>${buildPageField()}`);
      } else {
        parts.push(`<w:r>${pageRpr}<w:t xml:space="preserve">Page </w:t></w:r>${buildPageField()}<w:r>${pageRpr}<w:t xml:space="preserve"> of </w:t></w:r>${buildNumPagesField()}`);
      }
      parts.push('</w:p>');
    }

    parts.push('</w:ftr>');
    return parts.join('');
  } catch (e) {
    console.warn('[SmartDocumentFormatter] Pro footer build failed (fallback to legacy):', e.message);
    return buildFooterXml({ styleProfile: profile, footerValues: systemValues || {} });
  }
}

function injectHeaderFooter(zip, docXml, styleProfile, headerValues, footerValues, systemValues) {
  const sp = styleProfile || {};
  const headerEnabled = sp.headerEnabled === true;
  const footerEnabled = sp.footerEnabled === true;
  const useProHeader = sp.headerUseProfessionalLayout === true;
  const useProFooter = sp.footerUseProfessionalLayout === true;

  let relsXml = '';
  const relsFile = zip.file('word/_rels/document.xml.rels');
  if (relsFile) relsXml = relsFile.asText();

  let existingRIds = parseRelIdsFromRelsXml(relsXml);
  let changed = false;

  const allFiles = zip.file(/.*/).map(f => f.name);

  if (headerEnabled) {
    try {
      let headerLogoRelId = null;
      if (sp.headerLogoPath) {
        headerLogoRelId = buildUniqueRelId(existingRIds);
        existingRIds.push(headerLogoRelId);
        relsXml = addRelEntry(relsXml, headerLogoRelId, REL_TYPES.IMAGE, 'media/headerLogo.png');
        changed = true;
      }

      let headerXml;
      if (useProHeader) {
        try {
          let mailtoRelId = null;
          if (sp.headerCompanyEmail) {
            try {
              mailtoRelId = buildUniqueRelId(existingRIds);
              existingRIds.push(mailtoRelId);
            } catch (e) { mailtoRelId = null; }
          }

          headerXml = buildProfessionalHeaderXml(sp, systemValues, { headerLogoRelId, mailtoRelId });

          if (mailtoRelId) {
            try {
              const target = `mailto:${encodeURIComponent(sp.headerCompanyEmail)}`;
              let headerRelsXml = '';
              const existingHeaderRels = zip.file('word/_rels/header1.xml.rels');
              if (existingHeaderRels) headerRelsXml = existingHeaderRels.asText();
              headerRelsXml = removeRelsByType(headerRelsXml, REL_TYPES.HYPERLINK);
              headerRelsXml = removeRelsByType(headerRelsXml, REL_TYPES.IMAGE);
              headerRelsXml = addRelEntry(headerRelsXml, mailtoRelId, REL_TYPES.HYPERLINK, target);
              if (headerLogoRelId) {
                headerRelsXml = addRelEntry(headerRelsXml, headerLogoRelId, REL_TYPES.IMAGE, 'media/headerLogo.png');
              }
              zip.file('word/_rels/header1.xml.rels', ensureXmlDirective(headerRelsXml));
              changed = true;
            } catch (e) {
              console.warn('[SmartDocumentFormatter] Header rels write failed:', e.message);
            }
          } else if (headerLogoRelId) {
            try {
              let headerRelsXml = '';
              const existingHeaderRels = zip.file('word/_rels/header1.xml.rels');
              if (existingHeaderRels) headerRelsXml = existingHeaderRels.asText();
              headerRelsXml = removeRelsByType(headerRelsXml, REL_TYPES.IMAGE);
              headerRelsXml = addRelEntry(headerRelsXml, headerLogoRelId, REL_TYPES.IMAGE, 'media/headerLogo.png');
              zip.file('word/_rels/header1.xml.rels', ensureXmlDirective(headerRelsXml));
              changed = true;
            } catch (e) {
              console.warn('[SmartDocumentFormatter] Header logo rels write failed:', e.message);
            }
          }
        } catch (proErr) {
          console.warn('[SmartDocumentFormatter] Pro header generation failed, fallback to legacy:', proErr.message);
          headerXml = buildHeaderXml({ styleProfile: sp, headerValues, headerLogoRelId });
        }
      } else {
        headerXml = buildHeaderXml({ styleProfile: sp, headerValues, headerLogoRelId });
      }

      zip.file('word/header1.xml', headerXml);

      relsXml = removeRelsByType(relsXml, REL_TYPES.HEADER);
      const headerRelId = buildUniqueRelId(existingRIds);
      existingRIds.push(headerRelId);
      relsXml = addRelEntry(relsXml, headerRelId, REL_TYPES.HEADER, 'header1.xml');
      changed = true;

      docXml = (() => {
        const found = findOrCreateSectPr(docXml);
        if (found.sectPrStart < 0) return docXml;
        let xml = found.xml;
        const outer = xml.substring(found.sectPrStart, found.sectPrEnd);
        const innerMatch = outer.match(/^<w:sectPr\b([^>]*)>([\s\S]*)<\/w:sectPr>$/);
        if (!innerMatch) return xml;
        const attrs = innerMatch[1] || '';
        let inner = innerMatch[2] || '';
        inner = inner.replace(/<w:headerReference\b[^>]*w:type="default"[^\/]*\/>/g, '');
        inner = inner.replace(/<w:headerReference\b[^>]*>[^<]*<\/w:headerReference>/g, '');
        inner = inner + `<w:headerReference w:type="default" r:id="${headerRelId}"/>`;
        const newOuter = `<w:sectPr${attrs}>${inner}</w:sectPr>`;
        return xml.substring(0, found.sectPrStart) + newOuter + xml.substring(found.sectPrEnd);
      })();
    } catch (e) {
      console.error('[SmartDocumentFormatter] Header injection failed:', e.message);
    }
  } else {
    try {
      for (const f of allFiles) {
        if (/^word\/header\d*\.xml$/.test(f)) {
          zip.remove(f);
        }
        if (/^word\/_rels\/header\d*\.xml\.rels$/.test(f)) {
          zip.remove(f);
        }
      }
      relsXml = removeRelsByType(relsXml, REL_TYPES.HEADER);
      changed = true;

      docXml = (() => {
        const found = findOrCreateSectPr(docXml);
        if (found.sectPrStart < 0) return docXml;
        let xml = found.xml;
        const outer = xml.substring(found.sectPrStart, found.sectPrEnd);
        const innerMatch = outer.match(/^<w:sectPr\b([^>]*)>([\s\S]*)<\/w:sectPr>$/);
        if (!innerMatch) return xml;
        const attrs = innerMatch[1] || '';
        let inner = innerMatch[2] || '';
        inner = inner.replace(/<w:headerReference\b[^>]*w:type="default"[^\/]*\/>/g, '');
        inner = inner.replace(/<w:headerReference\b[^>]*>[^<]*<\/w:headerReference>/g, '');
        const newOuter = `<w:sectPr${attrs}>${inner}</w:sectPr>`;
        return xml.substring(0, found.sectPrStart) + newOuter + xml.substring(found.sectPrEnd);
      })();
    } catch (e) {
      console.error('[SmartDocumentFormatter] Header cleanup failed:', e.message);
    }
  }

  if (footerEnabled) {
    try {
      let footerXml;
      if (useProFooter) {
        try {
          footerXml = buildProfessionalFooterXml(sp, systemValues || footerValues || {});
        } catch (proErr) {
          console.warn('[SmartDocumentFormatter] Pro footer generation failed, fallback to legacy:', proErr.message);
          footerXml = buildFooterXml({ styleProfile: sp, footerValues });
        }
      } else {
        footerXml = buildFooterXml({ styleProfile: sp, footerValues });
      }

      zip.file('word/footer1.xml', footerXml);

      relsXml = removeRelsByType(relsXml, REL_TYPES.FOOTER);
      const footerRelId = buildUniqueRelId(existingRIds);
      existingRIds.push(footerRelId);
      relsXml = addRelEntry(relsXml, footerRelId, REL_TYPES.FOOTER, 'footer1.xml');
      changed = true;

      docXml = (() => {
        const found = findOrCreateSectPr(docXml);
        if (found.sectPrStart < 0) return docXml;
        let xml = found.xml;
        const outer = xml.substring(found.sectPrStart, found.sectPrEnd);
        const innerMatch = outer.match(/^<w:sectPr\b([^>]*)>([\s\S]*)<\/w:sectPr>$/);
        if (!innerMatch) return xml;
        const attrs = innerMatch[1] || '';
        let inner = innerMatch[2] || '';
        inner = inner.replace(/<w:footerReference\b[^>]*w:type="default"[^\/]*\/>/g, '');
        inner = inner.replace(/<w:footerReference\b[^>]*>[^<]*<\/w:footerReference>/g, '');
        inner = inner + `<w:footerReference w:type="default" r:id="${footerRelId}"/>`;
        const newOuter = `<w:sectPr${attrs}>${inner}</w:sectPr>`;
        return xml.substring(0, found.sectPrStart) + newOuter + xml.substring(found.sectPrEnd);
      })();
    } catch (e) {
      console.error('[SmartDocumentFormatter] Footer injection failed:', e.message);
    }
  } else {
    try {
      for (const f of allFiles) {
        if (/^word\/footer\d*\.xml$/.test(f)) {
          zip.remove(f);
        }
        if (/^word\/_rels\/footer\d*\.xml\.rels$/.test(f)) {
          zip.remove(f);
        }
      }
      relsXml = removeRelsByType(relsXml, REL_TYPES.FOOTER);
      changed = true;

      docXml = (() => {
        const found = findOrCreateSectPr(docXml);
        if (found.sectPrStart < 0) return docXml;
        let xml = found.xml;
        const outer = xml.substring(found.sectPrStart, found.sectPrEnd);
        const innerMatch = outer.match(/^<w:sectPr\b([^>]*)>([\s\S]*)<\/w:sectPr>$/);
        if (!innerMatch) return xml;
        const attrs = innerMatch[1] || '';
        let inner = innerMatch[2] || '';
        inner = inner.replace(/<w:footerReference\b[^>]*w:type="default"[^\/]*\/>/g, '');
        inner = inner.replace(/<w:footerReference\b[^>]*>[^<]*<\/w:footerReference>/g, '');
        const newOuter = `<w:sectPr${attrs}>${inner}</w:sectPr>`;
        return xml.substring(0, found.sectPrStart) + newOuter + xml.substring(found.sectPrEnd);
      })();
    } catch (e) {
      console.error('[SmartDocumentFormatter] Footer cleanup failed:', e.message);
    }
  }

  if (changed) {
    zip.file('word/_rels/document.xml.rels', ensureXmlDirective(relsXml));
  }

  if (sp.headerLogoPath) {
    try {
      const resolvedPath = resolveLogoFilePath(sp.headerLogoPath);
      if (resolvedPath) {
        const imgBuffer = fs.readFileSync(resolvedPath);
        const ext = path.extname(resolvedPath).toLowerCase();
        const mediaEntryName = ext === '.jpg' || ext === '.jpeg'
          ? 'word/media/headerLogo.jpeg'
          : 'word/media/headerLogo.png';
        zip.file(mediaEntryName, imgBuffer, { binary: true });

        if (ext === '.jpg' || ext === '.jpeg') {
          try {
            const headerRelsFiles = zip.file(/^word\/_rels\/header\d+\.xml\.rels$/);
            headerRelsFiles.forEach(rf => {
              let text = rf.asText();
              text = text.replace(/media\/headerLogo\.png/g, 'media/headerLogo.jpeg');
              zip.file(rf.name, ensureXmlDirective(text));
            });
            let docRels = zip.file('word/_rels/document.xml.rels')?.asText() || '';
            if (docRels) {
              docRels = docRels.replace(/media\/headerLogo\.png/g, 'media/headerLogo.jpeg');
              zip.file('word/_rels/document.xml.rels', ensureXmlDirective(docRels));
            }
          } catch (_) { /* ignore */ }
        }

        try {
          const ctFile = zip.file('[Content_Types].xml');
          if (ctFile) {
            let ctXml = ctFile.asText();
            const needPng = ext === '.png';
            const needJpeg = ext === '.jpg' || ext === '.jpeg';
            if (needPng && !ctXml.includes('Extension="png"')) {
              ctXml = ctXml.replace(
                '</Types>',
                '<Default Extension="png" ContentType="image/png"/></Types>'
              );
            }
            if (needJpeg && !ctXml.includes('Extension="jpeg"') && !ctXml.includes('Extension="jpg"')) {
              ctXml = ctXml.replace(
                '</Types>',
                '<Default Extension="jpeg" ContentType="image/jpeg"/></Types>'
              );
            }
            zip.file('[Content_Types].xml', ensureXmlDirective(ctXml));
          }
        } catch (_) { /* ignore */ }
      }
    } catch (e) {
      console.warn('[SmartDocumentFormatter] Failed to embed logo image:', sp.headerLogoPath, e.message);
    }
  }

  return docXml;
}

function injectBodyFontDefaults(zip, styleProfile) {
  try {
    const sp = styleProfile || {};
    const hasFont = !!sp.bodyFontFamily;
    const hasSize = sp.bodyFontSizePt != null && !isNaN(Number(sp.bodyFontSizePt));
    if (!hasFont && !hasSize) return;

    const stylesFile = zip.file('word/styles.xml');
    if (!stylesFile) return;

    let stylesXml = stylesFile.asText();

    const fontFamily = escapeXml(sp.bodyFontFamily || 'Arial');
    const fontSizeHalfPt = hasSize ? Math.round(Number(sp.bodyFontSizePt) * 2) : null;

    const rFontsXml = hasFont ? `<w:rFonts w:ascii="${fontFamily}" w:hAnsi="${fontFamily}" w:cs="${fontFamily}"/>` : null;
    const szXml = hasSize ? `<w:sz w:val="${fontSizeHalfPt}"/>` : null;
    const szCsXml = hasSize ? `<w:szCs w:val="${fontSizeHalfPt}"/>` : null;

    let docDefaultsMatch = stylesXml.match(/<w:docDefaults\b[^>]*>([\s\S]*?)<\/w:docDefaults>/);
    if (!docDefaultsMatch) {
      const rPrContent = [rFontsXml, szXml, szCsXml].filter(Boolean).join('');
      const docDefaultsXml = `<w:docDefaults><w:rPrDefault><w:rPr>${rPrContent}</w:rPr></w:rPrDefault></w:docDefaults>`;
      const stylesTagMatch = stylesXml.match(/<w:styles\b[^>]*>/);
      if (stylesTagMatch) {
        const idx = stylesTagMatch.index + stylesTagMatch[0].length;
        stylesXml = stylesXml.substring(0, idx) + docDefaultsXml + stylesXml.substring(idx);
      }
    } else {
      let rPrDefaultMatch = docDefaultsMatch[1].match(/<w:rPrDefault\b[^>]*>([\s\S]*?)<\/w:rPrDefault>/);
      if (!rPrDefaultMatch) {
        const rPrContent = [rFontsXml, szXml, szCsXml].filter(Boolean).join('');
        const rPrDefaultXml = `<w:rPrDefault><w:rPr>${rPrContent}</w:rPr></w:rPrDefault>`;
        const docDefaultsInner = docDefaultsMatch[1];
        const newDocDefaultsInner = rPrDefaultXml + docDefaultsInner;
        stylesXml = stylesXml.replace(docDefaultsMatch[0], `<w:docDefaults>${newDocDefaultsInner}</w:docDefaults>`);
      } else {
        let rPrMatch = rPrDefaultMatch[1].match(/<w:rPr\b([^>]*)>([\s\S]*?)<\/w:rPr>/);
        let newRPrInner;
        let rPrAttrs = '';
        if (!rPrMatch) {
          newRPrInner = '';
        } else {
          rPrAttrs = rPrMatch[1] || '';
          newRPrInner = rPrMatch[2] || '';
        }
        if (rFontsXml) {
          newRPrInner = newRPrInner.replace(/<w:rFonts\b[^\/]*\/>/g, '').replace(/<w:rFonts\b[^>]*>[\s\S]*?<\/w:rFonts>/g, '');
          newRPrInner = rFontsXml + newRPrInner;
        }
        if (szXml) {
          newRPrInner = newRPrInner.replace(/<w:sz\b[^\/]*\/>/g, '').replace(/<w:sz\b[^>]*>[\s\S]*?<\/w:sz>/g, '');
          newRPrInner = szXml + szCsXml + newRPrInner;
        }
        const newRPr = `<w:rPr${rPrAttrs}>${newRPrInner}</w:rPr>`;
        const newRPrDefault = `<w:rPrDefault>${newRPr}</w:rPrDefault>`;
        const newDocDefaults = `<w:docDefaults>${docDefaultsMatch[1].replace(rPrDefaultMatch[0], newRPrDefault)}</w:docDefaults>`;
        stylesXml = stylesXml.replace(docDefaultsMatch[0], newDocDefaults);
      }
    }

    const normalStyleRegex = /<w:style\b[^>]*\bw:styleId="Normal"[^>]*>([\s\S]*?)<\/w:style>/;
    const normalMatch = stylesXml.match(normalStyleRegex);
    if (normalMatch) {
      const styleInner = normalMatch[1];
      let rPrMatch = styleInner.match(/<w:rPr\b([^>]*)>([\s\S]*?)<\/w:rPr>/);
      let newRPrInner;
      let rPrAttrs = '';
      if (!rPrMatch) {
        newRPrInner = '';
      } else {
        rPrAttrs = rPrMatch[1] || '';
        newRPrInner = rPrMatch[2] || '';
      }
      if (rFontsXml) {
        newRPrInner = newRPrInner.replace(/<w:rFonts\b[^\/]*\/>/g, '').replace(/<w:rFonts\b[^>]*>[\s\S]*?<\/w:rFonts>/g, '');
        newRPrInner = rFontsXml + newRPrInner;
      }
      if (szXml) {
        newRPrInner = newRPrInner.replace(/<w:sz\b[^\/]*\/>/g, '').replace(/<w:sz\b[^>]*>[\s\S]*?<\/w:sz>/g, '');
        newRPrInner = szXml + szCsXml + newRPrInner;
      }
      const newRPr = `<w:rPr${rPrAttrs}>${newRPrInner}</w:rPr>`;
      let newStyleInner;
      if (styleInner.includes('<w:rPr')) {
        newStyleInner = styleInner.replace(rPrMatch[0], newRPr);
      } else {
        newStyleInner = styleInner + newRPr;
      }
      const newStyle = normalMatch[0].replace(normalMatch[1], newStyleInner);
      stylesXml = stylesXml.replace(normalMatch[0], newStyle);
    }

    zip.file('word/styles.xml', ensureXmlDirective(stylesXml));
  } catch (e) {
    console.error('[SmartDocumentFormatter] Body font injection failed:', e.message);
  }
}

class SmartDocumentFormatter {

  mmToTwips(mm) {
    return mmToTwips(mm);
  }

  mmToEmu(mm) {
    return mmToEmu(mm);
  }

  async applyStyleProfileToDocxBuffer({ docxBuffer, styleProfile, headerValues, footerValues, systemValues }) {
    try {
      if (!Buffer.isBuffer(docxBuffer)) {
        throw new BadRequestError('docxBuffer must be a Buffer');
      }

      let zip;
      try {
        zip = new PizZip(docxBuffer);
      } catch (e) {
        throw new BadRequestError('Invalid DOCX buffer: unable to unzip');
      }

      const docFile = zip.file('word/document.xml');
      if (!docFile) {
        throw new BadRequestError('DOCX missing word/document.xml');
      }

      let docXml = docFile.asText();

      const sp = styleProfile && typeof styleProfile === 'object' ? styleProfile : {};
      const sv = systemValues && typeof systemValues === 'object' ? systemValues : {};
      const hv = headerValues || {};
      const fv = footerValues || {};

      try {
        docXml = applyTypographyStyles(zip, docXml, sp);
      } catch (typeErr) {
        console.error('[SmartDocumentFormatter] Typography pipeline failed (continuing):', typeErr.message);
      }

      try {
        docXml = applyPageGeometry(docXml, sp);
      } catch (geomErr) {
        console.error('[SmartDocumentFormatter] Geometry pipeline failed (continuing):', geomErr.message);
      }

      try {
        docXml = injectHeaderFooter(zip, docXml, sp, hv, fv, sv);
      } catch (hfErr) {
        console.error('[SmartDocumentFormatter] Header/footer pipeline failed (continuing):', hfErr.message);
      }

      try {
        injectBodyFontDefaults(zip, sp);
      } catch (fontErr) {
        console.error('[SmartDocumentFormatter] Font defaults pipeline failed (continuing):', fontErr.message);
      }

      docXml = ensureXmlDirective(docXml);

      zip.file('word/document.xml', docXml);

      const outBuffer = zip.generate({
        type: 'nodebuffer',
        compression: 'DEFLATE'
      });

      return outBuffer;

    } catch (error) {
      if (error instanceof BadRequestError) throw error;
      throw new BadRequestError('Style profile application failed: ' + error.message);
    }
  }
}

module.exports = new SmartDocumentFormatter();
