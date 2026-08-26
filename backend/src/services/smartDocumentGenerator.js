const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const { BadRequestError } = require('../utils/errors');

const SYSTEM_PLACEHOLDER_MAP = {
  referenceCode: 'system_reference_code',
  version: 'system_version',
  documentTypeName: 'system_document_type_name',
  preparedByFullName: 'system_prepared_by_full_name',
  reviewedByFullName: 'system_reviewed_by_full_name',
  approvedByFullName: 'system_approved_by_full_name',
  preparedDate: 'system_prepared_date',
  publishedDate: 'system_published_date'
};

function formatDate(dateInput, formatStr) {
  if (!dateInput) return '';
  let d;
  if (dateInput instanceof Date) {
    d = dateInput;
  } else {
    d = new Date(dateInput);
  }
  if (isNaN(d.getTime())) return String(dateInput || '');

  const fmt = formatStr || 'DD/MM/YYYY';
  const pad = (n) => String(n).padStart(2, '0');
  const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthsLong = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const mapFull = {
    DD: pad(d.getDate()),
    MM: pad(d.getMonth() + 1),
    YYYY: String(d.getFullYear()),
    YY: String(d.getFullYear()).slice(-2),
    HH: pad(d.getHours()),
    mm: pad(d.getMinutes()),
    ss: pad(d.getSeconds()),
    MMM: monthsShort[d.getMonth()],
    MMMM: monthsLong[d.getMonth()]
  };
  return fmt.replace(/DD|MMMM|MMM|MM|YYYY|YY|HH|mm|ss/g, (m) => mapFull[m] || m);
}

function formatNumber(raw, outputFormat) {
  let n;
  if (typeof raw === 'number') n = raw;
  else {
    n = parseFloat(String(raw));
    if (isNaN(n)) return String(raw == null ? '' : raw);
  }
  const fmt = outputFormat || {};
  let str;
  if (typeof fmt.decimalPlaces === 'number' && fmt.decimalPlaces >= 0) {
    str = n.toFixed(fmt.decimalPlaces);
  } else {
    str = String(n);
  }
  if (fmt.thousandSeparator) {
    const parts = str.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    str = parts.join('.');
  }
  if (fmt.prefix) str = String(fmt.prefix) + str;
  if (fmt.suffix) str = str + String(fmt.suffix);
  return str;
}

function formatError(error) {
  try {
    if (!error) return new BadRequestError('Unknown document generation error');
    if (error.properties && error.properties.errors) {
      const errs = error.properties.errors.map((e) => {
        const scope = e.properties ? (e.properties.id || e.properties.explanation || '') : '';
        const param = e.properties ? (e.properties.parameter || '') : '';
        return `[${e.message}]${scope ? ' scope=' + scope : ''}${param ? ' param=' + param : ''}`;
      }).join('; ');
      return new BadRequestError('DOCX template render failed: ' + errs);
    }
    if (error.message) {
      return new BadRequestError('DOCX template render failed: ' + error.message);
    }
    return new BadRequestError('DOCX template render failed');
  } catch (e) {
    return new BadRequestError('DOCX template render failed');
  }
}

function safeJsonParse(raw, fallback) {
  if (raw == null) return fallback != null ? fallback : null;
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return fallback != null ? fallback : null;
  const s = raw.trim();
  if (!s) return fallback != null ? fallback : null;
  try {
    return JSON.parse(s);
  } catch (_) {
    return fallback != null ? fallback : null;
  }
}

function resolveDropdownLabel(rawValue, formField, fieldMapping) {
  const outputFormat = fieldMapping && fieldMapping.outputFormatJson ? fieldMapping.outputFormatJson : {};
  const optsRaw = safeJsonParse(formField && formField.optionsJson ? formField.optionsJson : null, null);
  let optionsArr = null;
  if (Array.isArray(optsRaw)) {
    optionsArr = optsRaw;
  } else if (optsRaw && typeof optsRaw === 'object') {
    if (Array.isArray(optsRaw.options)) optionsArr = optsRaw.options;
    else if (Array.isArray(optsRaw.items)) optionsArr = optsRaw.items;
    else if (Array.isArray(optsRaw.values)) optionsArr = optsRaw.values;
    else if (Array.isArray(optsRaw.choices)) optionsArr = optsRaw.choices;
  }
  if (!Array.isArray(optionsArr)) {
    optionsArr = Array.isArray(formField && formField.options) ? formField.options : null;
  }
  const useLabel = outputFormat.useLabel !== false;
  if (!useLabel || !Array.isArray(optionsArr) || optionsArr.length === 0 || rawValue == null || rawValue === '') {
    return rawValue == null ? '' : String(rawValue);
  }
  const rawStr = String(rawValue);
  const chosen = optionsArr.find((o) => o && (
    (o.value != null && String(o.value) === rawStr) ||
    (o.key != null && String(o.key) === rawStr) ||
    (o.id != null && String(o.id) === rawStr) ||
    (o.code != null && String(o.code) === rawStr)
  ));
  if (chosen && chosen.label != null && String(chosen.label) !== '') return String(chosen.label);
  if (chosen && chosen.text != null && String(chosen.text) !== '') return String(chosen.text);
  if (chosen && chosen.displayName != null && String(chosen.displayName) !== '') return String(chosen.displayName);
  return rawValue == null ? '' : String(rawValue);
}

class SmartDocumentGenerator {

  stripHtml(html) {
    if (html == null) return '';
    let str = String(html);
    str = str.replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '$&\n');
    str = str.replace(/<br\s*\/?>/gi, '\n');
    str = str.replace(/<[^>]+>/g, '');
    str = str.replace(/&nbsp;/gi, ' ');
    str = str.replace(/&amp;/gi, '&');
    str = str.replace(/&lt;/gi, '<');
    str = str.replace(/&gt;/gi, '>');
    str = str.replace(/&quot;/gi, '"');
    str = str.replace(/&#39;/gi, "'");
    return str;
  }

  buildSubstitutionValue({ formField, fieldMapping, rawValue, styleProfile, systemValues }) {
    if (rawValue == null || rawValue === undefined) {
      return '';
    }

    const inputTypeRaw = formField && formField.inputType ? formField.inputType : (formField && formField.type ? formField.type : 'TEXT');
    const inputType = typeof inputTypeRaw === 'string' ? inputTypeRaw.toUpperCase() : 'TEXT';
    const outputFormat = fieldMapping && fieldMapping.outputFormatJson ? fieldMapping.outputFormatJson : {};
    const dateFormat = outputFormat.dateFormat || 'DD/MM/YYYY';

    // Aggressive universal dropdown label fallback — for ANY type, if options exist and value matches, use label
    const universalLabeled = resolveDropdownLabel(rawValue, formField, fieldMapping);
    const hasOptionsJson = (() => {
      const o1 = safeJsonParse(formField && formField.optionsJson ? formField.optionsJson : null, null);
      if (Array.isArray(o1) && o1.length > 0) return true;
      if (o1 && typeof o1 === 'object') {
        if (Array.isArray(o1.options) && o1.options.length > 0) return true;
        if (Array.isArray(o1.items) && o1.items.length > 0) return true;
        if (Array.isArray(o1.values) && o1.values.length > 0) return true;
        if (Array.isArray(o1.choices) && o1.choices.length > 0) return true;
      }
      if (formField && Array.isArray(formField.options) && formField.options.length > 0) return true;
      return false;
    })();
    if (hasOptionsJson && rawValue != null && rawValue !== '' && String(universalLabeled) !== String(rawValue == null ? '' : rawValue)) {
      return String(universalLabeled);
    }

    switch (inputType) {
      case 'TEXT': {
        return String(rawValue == null ? '' : rawValue);
      }
      case 'DROPDOWN':
      case 'SINGLE_SELECT': {
        return String(universalLabeled);
      }
      case 'MULTI_SELECT': {
        const values = Array.isArray(rawValue) ? rawValue : (rawValue ? [rawValue] : []);
        const sep = outputFormat.joinSeparator != null ? String(outputFormat.joinSeparator) : ', ';
        const labeled = values.map((v) => {
          const label = resolveDropdownLabel(v, formField, fieldMapping);
          if (label != null && String(label) !== '') return String(label);
          return v == null ? '' : String(v);
        }).filter((s) => s !== '');
        return labeled.join(sep);
      }
      case 'NUMBER':
        return formatNumber(rawValue, outputFormat);

      case 'CHECKBOX': {
        if (typeof rawValue === 'boolean') {
          if (rawValue) return String(outputFormat.trueLabel || 'Yes');
          return String(outputFormat.falseLabel || 'No');
        }
        if (rawValue === 1 || rawValue === '1' || rawValue === 'true' || rawValue === 'TRUE' || rawValue === 'yes') {
          return String(outputFormat.trueLabel || 'Yes');
        }
        if (rawValue === 0 || rawValue === '0' || rawValue === 'false' || rawValue === 'FALSE' || rawValue === 'no' || rawValue === '') {
          return String(outputFormat.falseLabel || 'No');
        }
        return String(rawValue == null ? '' : rawValue);
      }

      case 'TEXTAREA': {
        const text = String(rawValue == null ? '' : rawValue);
        if (outputFormat.preserveLineBreaks === false) return text;
        return text;
      }

      case 'RICH_TEXT': {
        const shouldStrip = outputFormat.stripHtml !== false;
        if (shouldStrip) return this.stripHtml(rawValue);
        return String(rawValue == null ? '' : rawValue);
      }

      case 'DATE':
      case 'DATETIME':
        return formatDate(rawValue, dateFormat);

      case 'USER_LOOKUP': {
        if (rawValue && typeof rawValue === 'object') {
          const mode = outputFormat.displayFormat || 'fullName';
          const fallback = outputFormat.fallback || 'email';
          const tryOrder = [];
          if (mode === 'fullName') tryOrder.push('fullName', 'displayFullName');
          if (mode === 'firstName') tryOrder.push('firstName');
          if (mode === 'lastName') tryOrder.push('lastName');
          if (mode === 'email') tryOrder.push('email');
          if (mode === 'employeeId') tryOrder.push('employeeId', 'staffId', 'empId');
          tryOrder.push('firstName', 'lastName');
          if (fallback === 'email') tryOrder.push('email');
          for (const k of tryOrder) {
            if (rawValue[k]) return String(rawValue[k]);
          }
          const combined = [rawValue.firstName, rawValue.lastName].filter(Boolean).join(' ');
          if (combined) return combined;
        }
        return String(rawValue || '');
      }

      case 'TABLE': {
        if (Array.isArray(rawValue)) {
          return rawValue;
        }
        if (rawValue && typeof rawValue === 'object' && Array.isArray(rawValue.rows)) {
          return rawValue.rows;
        }
        return [];
      }

      case 'REPEATER': {
        if (Array.isArray(rawValue)) {
          return rawValue;
        }
        if (rawValue && typeof rawValue === 'object' && Array.isArray(rawValue.rows)) {
          return rawValue.rows;
        }
        if (rawValue && typeof rawValue === 'object' && Array.isArray(rawValue.items)) {
          return rawValue.items;
        }
        return [];
      }

      case 'IMAGE':
      case 'ATTACHMENT': {
        if (Array.isArray(rawValue) && rawValue.length > 0) {
          const first = rawValue[0];
          if (first && typeof first === 'object') {
            return String(first.fileName || first.originalName || first.name || '');
          }
          return String(first || '');
        }
        if (rawValue && typeof rawValue === 'object') {
          return String(rawValue.fileName || rawValue.originalName || rawValue.name || '');
        }
        return String(rawValue || '');
      }

      case 'SYSTEM_GENERATED': {
        if (systemValues && typeof systemValues === 'object') {
          const cfg = formField && formField.systemFieldConfigJson ? formField.systemFieldConfigJson : {};
          const source = cfg.sourceType || '';
          if (source === 'REFERENCE_CODE' && systemValues.referenceCode) return String(systemValues.referenceCode);
          if (source === 'REVISION' && systemValues.version) return String(systemValues.version);
          if (source === 'DOCUMENT_TYPE' && systemValues.documentTypeName) return String(systemValues.documentTypeName);
          if (source === 'PREPARED_BY' && systemValues.preparedByFullName) return String(systemValues.preparedByFullName);
          if (source === 'REVIEWED_BY' && systemValues.reviewedByFullName) return String(systemValues.reviewedByFullName);
          if (source === 'APPROVED_BY' && systemValues.approvedByFullName) return String(systemValues.approvedByFullName);
          if (source === 'PREPARED_DATE') return formatDate(systemValues.preparedDate, dateFormat);
          if (source === 'PUBLISHED_DATE') return formatDate(systemValues.publishedDate, dateFormat);
        }
        return String(rawValue || '');
      }

      default:
        return String(rawValue == null ? '' : rawValue);
    }
  }

  async generateDocx({ templateBuffer, fieldValuesMap, formFields, fieldMappings, styleProfile, systemValues }) {
    try {
      if (!Buffer.isBuffer(templateBuffer)) {
        throw new BadRequestError('templateBuffer must be a Buffer');
      }

      const substitutionMap = {};
      const mappingByFieldId = new Map();
      const formFieldByKey = new Map();

      if (Array.isArray(formFields)) {
        formFields.forEach((ff) => {
          if (!ff || typeof ff !== 'object') return;
          const optsParsed = safeJsonParse(ff.optionsJson, null);
          let unwrapped = null;
          if (Array.isArray(optsParsed)) unwrapped = optsParsed;
          else if (optsParsed && typeof optsParsed === 'object') {
            if (Array.isArray(optsParsed.options)) unwrapped = optsParsed.options;
            else if (Array.isArray(optsParsed.items)) unwrapped = optsParsed.items;
            else if (Array.isArray(optsParsed.values)) unwrapped = optsParsed.values;
            else if (Array.isArray(optsParsed.choices)) unwrapped = optsParsed.choices;
          }
          if (Array.isArray(unwrapped)) {
            ff.options = unwrapped;
          } else if (optsParsed == null && !Array.isArray(ff.options)) {
            ff.options = [];
          }
          if (ff && ff.fieldKey) formFieldByKey.set(ff.fieldKey, ff);
          if (ff && ff.id) formFieldByKey.set('id:' + ff.id, ff);
        });
      }

      if (Array.isArray(fieldMappings)) {
        fieldMappings.forEach((fm) => {
          if (fm && fm.smartFormFieldId) mappingByFieldId.set(fm.smartFormFieldId, fm);
          if (fm && fm.placeholderName && fm.smartFormField) {
            // already covered via formFieldId linkage
          }
        });
      }

      if (Array.isArray(fieldMappings)) {
        fieldMappings.forEach((fm) => {
          if (!fm || !fm.placeholderName) return;

          let formField = null;
          if (fm.smartFormField) {
            formField = fm.smartFormField;
          } else if (fm.smartFormFieldId) {
            formField = formFieldByKey.get('id:' + fm.smartFormFieldId) || null;
          }

          let rawValue = null;
          if (formField && formField.fieldKey && fieldValuesMap && fieldValuesMap[formField.fieldKey] !== undefined) {
            rawValue = fieldValuesMap[formField.fieldKey];
          }

          let placeholderKey = fm.placeholderName;
          placeholderKey = placeholderKey.replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '');

          const value = this.buildSubstitutionValue({
            formField: formField || {},
            fieldMapping: fm,
            rawValue: rawValue,
            styleProfile: styleProfile || {},
            systemValues: systemValues || {}
          });

          substitutionMap[placeholderKey] = value;
        });
      }

      if (systemValues && typeof systemValues === 'object') {
        Object.keys(SYSTEM_PLACEHOLDER_MAP).forEach((sysKey) => {
          if (systemValues[sysKey] != null) {
            const phKey = SYSTEM_PLACEHOLDER_MAP[sysKey];
            let value = systemValues[sysKey];
            if (sysKey === 'preparedDate' || sysKey === 'publishedDate') {
              value = formatDate(value, 'DD/MM/YYYY');
            }
            substitutionMap[phKey] = String(value);
          }
        });
      }

      function parseVisibilityRules(raw) {
        if (!raw) return { enabled: false, match: 'ALL', rules: [] }
        let obj = null
        if (typeof raw === 'object' && raw !== null) obj = raw
        else if (typeof raw === 'string' && raw.trim()) { try { obj = JSON.parse(raw.trim()) } catch (_) { obj = null } }
        if (!obj || typeof obj !== 'object') return { enabled: false, match: 'ALL', rules: [] }
        const rules = Array.isArray(obj.rules) ? obj.rules.filter(r => r && r.fieldKey) : []
        return {
          enabled: !!obj.enabled,
          match: obj.match === 'ANY' ? 'ANY' : 'ALL',
          rules: rules.map(r => ({ fieldKey: String(r.fieldKey), operator: String(r.operator || 'equals'), value: r.value }))
        }
      }
      function evaluateSingleRule(rule, values) {
        const actual = (values && rule.fieldKey && values[rule.fieldKey] !== undefined) ? values[rule.fieldKey] : null
        const expected = rule.value
        const nStr = (v) => v == null ? '' : String(v).trim().toLowerCase()
        const nArr = (v) => {
          if (Array.isArray(v)) return v.map(x => nStr(x)).filter(x => x !== '')
          if (v == null || v === '') return []
          return String(v).split(',').map(x => nStr(x)).filter(Boolean)
        }
        const actualIsArray = Array.isArray(actual)
        const actualArr = actualIsArray ? actual.map(x => nStr(x)).filter(x => x !== '') : (actual == null || actual === '' ? [] : [nStr(actual)])
        const expectedStr = nStr(expected)
        const expectedArr = nArr(expected)
        const op = String(rule.operator || 'equals').toLowerCase()
        switch (op) {
          case 'equals': case 'equal': case 'eq': {
            if (actualIsArray) return actualArr.indexOf(expectedStr) !== -1
            return nStr(actual) === expectedStr
          }
          case 'notequals': case 'notequal': case 'neq': case 'ne': {
            if (actualIsArray) return actualArr.indexOf(expectedStr) === -1
            return nStr(actual) !== expectedStr
          }
          case 'contains': {
            if (actualIsArray) return actualArr.some(a => expectedStr.length > 0 && a.indexOf(expectedStr) !== -1)
            return nStr(actual).length > 0 && expectedStr.length > 0 && nStr(actual).indexOf(expectedStr) !== -1
          }
          case 'notcontains': case 'doesnotcontain': {
            if (actualIsArray) return !(actualArr.some(a => expectedStr.length > 0 && a.indexOf(expectedStr) !== -1))
            return !(nStr(actual).length > 0 && expectedStr.length > 0 && nStr(actual).indexOf(expectedStr) !== -1)
          }
          case 'isempty': case 'empty': case 'blank': return actualArr.length === 0
          case 'isnotempty': case 'notempty': case 'filled': case 'notblank': return actualArr.length > 0
          case 'in': {
            if (expectedArr.length === 0) return false
            if (actualIsArray) return actualArr.some(a => expectedArr.indexOf(a) !== -1)
            return expectedArr.indexOf(nStr(actual)) !== -1
          }
          case 'notin': case 'not_in': {
            if (expectedArr.length === 0) return true
            if (actualIsArray) return !actualArr.some(a => expectedArr.indexOf(a) !== -1)
            return expectedArr.indexOf(nStr(actual)) === -1
          }
          default: return actualIsArray ? actualArr.indexOf(expectedStr) !== -1 : (nStr(actual) === expectedStr)
        }
      }
      function isFieldVisible(formField, values) {
        if (!formField) return true
        const cfg = parseVisibilityRules(formField.visibilityRulesJson)
        if (!cfg.enabled) return true
        if (!Array.isArray(cfg.rules) || cfg.rules.length === 0) return true
        const results = cfg.rules.map(r => evaluateSingleRule(r, values))
        return cfg.match === 'ANY' ? results.some(Boolean) : results.every(Boolean)
      }
      function hasConditionalVisibilityEnabled(formField) {
        if (!formField) return false
        const cfg = parseVisibilityRules(formField.visibilityRulesJson)
        return cfg.enabled && Array.isArray(cfg.rules) && cfg.rules.length > 0
      }

      if (Array.isArray(formFields)) {
        const parsedFormFields = formFields.map((ff) => {
          if (!ff || typeof ff !== 'object') return ff;
          const next = { ...ff };
          const optsParsed = safeJsonParse(ff.optionsJson, null);
          let unwrapped = null;
          if (Array.isArray(optsParsed)) unwrapped = optsParsed;
          else if (optsParsed && typeof optsParsed === 'object') {
            if (Array.isArray(optsParsed.options)) unwrapped = optsParsed.options;
            else if (Array.isArray(optsParsed.items)) unwrapped = optsParsed.items;
            else if (Array.isArray(optsParsed.values)) unwrapped = optsParsed.values;
            else if (Array.isArray(optsParsed.choices)) unwrapped = optsParsed.choices;
          }
          if (Array.isArray(unwrapped)) next.options = unwrapped;
          else if (Array.isArray(ff.options)) next.options = ff.options;
          else next.options = [];
          next.optionsJsonParsed = Array.isArray(unwrapped) ? unwrapped : (Array.isArray(ff.options) ? ff.options : null);
          next.visibilityRulesJsonParsed = safeJsonParse(ff.visibilityRulesJson, null);
          next.validationRulesJsonParsed = safeJsonParse(ff.validationRulesJson, null);
          next.outputFormatJsonParsed = safeJsonParse(ff.outputFormatJson, null);
          return next;
        });
        const initial = parsedFormFields
          .filter((ff) => ff && ff.fieldKey && (!!ff.isSupportingField || hasConditionalVisibilityEnabled(ff)))
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
        const supportingFields = (fieldValuesMap && typeof fieldValuesMap === 'object')
          ? initial.filter(ff => isFieldVisible(ff, fieldValuesMap))
          : initial;

        if (supportingFields.length > 0) {
          const entries = [];
          let hasAny = false;
          supportingFields.forEach((ff) => {
            const key = ff.fieldKey;
            const label = ff.fieldLabel || ff.fieldKey;
            const raw = (fieldValuesMap && fieldValuesMap[key] !== undefined) ? fieldValuesMap[key] : null;
            let displayValue = '';
            if (raw != null && raw !== undefined && raw !== '') {
              const fieldMapping = (Array.isArray(fieldMappings) ? fieldMappings.find((fm) => fm && fm.smartFormFieldId === ff.id) : null) || {};
              displayValue = this.buildSubstitutionValue({
                formField: ff,
                fieldMapping: fieldMapping,
                rawValue: raw,
                styleProfile: styleProfile || {},
                systemValues: systemValues || {}
              });
            }
            const isEmpty = (displayValue == null || displayValue === '' || displayValue === undefined);
            if (!isEmpty) hasAny = true;
            entries.push({ label, displayValue: isEmpty ? '—' : String(displayValue), isEmpty });
          });

          if (hasAny) {
            const visibleEntries = entries.filter((e) => !e.isEmpty || (e.displayValue && e.displayValue !== '—'));
            const totalEntries = visibleEntries.length > 0 ? visibleEntries.length : 1;
            let rendered = '';
            if (totalEntries <= 3) {
              const parts = [];
              entries.forEach(({ label, displayValue }) => {
                const multiLine = String(displayValue).includes('\n');
                if (multiLine) {
                  parts.push('' + label + ':');
                  String(displayValue).split('\n').forEach((ln) => parts.push('  ' + ln));
                } else {
                  parts.push(label + ' : ' + String(displayValue));
                }
              });
              rendered = parts.join('\n');
            } else {
              const lines = [];
              lines.push('Supporting Information');
              lines.push('─'.repeat(40));
              entries.forEach(({ label, displayValue }) => {
                const multiLine = String(displayValue).includes('\n');
                if (multiLine) {
                  lines.push('' + label + ':');
                  String(displayValue).split('\n').forEach((ln) => lines.push('  ' + ln));
                } else {
                  const maxLabel = 30;
                  const safeLabel = String(label || '').length > maxLabel ? String(label).slice(0, maxLabel - 1) + '…' : String(label || '');
                  const labelPadded = (safeLabel + ' ').padEnd(maxLabel, '·');
                  lines.push(labelPadded + ' : ' + String(displayValue));
                }
              });
              rendered = lines.join('\n');
            }
            substitutionMap['supporting_data'] = rendered;
          } else {
            substitutionMap['supporting_data'] = '';
          }
        } else {
          substitutionMap['supporting_data'] = '';
        }
      } else {
        substitutionMap['supporting_data'] = '';
      }

      let zip;
      try {
        zip = new PizZip(templateBuffer);
      } catch (e) {
        throw new BadRequestError('Invalid DOCX template buffer');
      }

      let doc;
      try {
        doc = new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks: true,
          delimiters: { start: '{{', end: '}}' },
          nullGetter: function () { return ''; }
        });
      } catch (e) {
        throw formatError(e);
      }

      try {
        doc.render(substitutionMap);
      } catch (e) {
        throw formatError(e);
      }

      let outBuffer;
      try {
        outBuffer = doc.getZip().generate({
          type: 'nodebuffer',
          compression: 'DEFLATE'
        });
      } catch (e) {
        throw new BadRequestError('Failed to generate DOCX output buffer: ' + e.message);
      }

      return outBuffer;

    } catch (error) {
      if (error instanceof BadRequestError) throw error;
      throw new BadRequestError('Smart document generation failed: ' + error.message);
    }
  }
}

module.exports = new SmartDocumentGenerator();
