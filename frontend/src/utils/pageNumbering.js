const ROMAN_NUMERAL_MAP = [
  [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'],
  [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'],
  [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']
];

export function toRomanNumeral(num, options = {}) {
  const { uppercase = false } = options;
  const n = Math.floor(Number(num));
  if (!Number.isFinite(n) || n <= 0 || n > 3999) return String(num);
  let remaining = n;
  let result = '';
  for (const [value, symbol] of ROMAN_NUMERAL_MAP) {
    while (remaining >= value) {
      result += symbol;
      remaining -= value;
    }
  }
  return uppercase ? result.toUpperCase() : result;
}

export function romanToArabic(romanStr) {
  if (typeof romanStr !== 'string') return NaN;
  const s = romanStr.trim().toLowerCase();
  if (!s) return NaN;
  const values = { m: 1000, d: 500, c: 100, l: 50, x: 10, v: 5, i: 1 };
  let total = 0;
  let prev = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    const curr = values[s[i]];
    if (!curr) return NaN;
    total += curr < prev ? -curr : curr;
    prev = curr;
  }
  return total;
}

export function formatHybridPageNumber(absolutePageNumber, options = {}) {
  const {
    frontMatterThreshold = 4,
    frontMatterFormat = 'lowerRoman',
    mainContentStart = 1,
    uppercaseRoman = false
  } = options;

  const page = Math.floor(Number(absolutePageNumber));
  if (!Number.isFinite(page) || page < 1) return String(absolutePageNumber);

  if (page <= frontMatterThreshold) {
    switch (frontMatterFormat) {
      case 'upperRoman':
        return toRomanNumeral(page, { uppercase: true });
      case 'lowerLetter':
        return String.fromCharCode(96 + page);
      case 'upperLetter':
        return String.fromCharCode(64 + page);
      case 'lowerRoman':
      default:
        return toRomanNumeral(page, { uppercase: uppercaseRoman });
    }
  }

  const mainPage = page - frontMatterThreshold + mainContentStart - 1;
  return String(mainPage);
}

export function formatHybridPageNumberLabel(absolutePageNumber, options = {}) {
  const {
    labelFormat = 'Page X of Y',
    frontMatterThreshold = 4,
    totalPages = null,
    frontMatterTotalPages = null,
    uppercaseRoman = false
  } = options;

  const current = formatHybridPageNumber(absolutePageNumber, {
    frontMatterThreshold,
    uppercaseRoman
  });

  const isFrontMatter = absolutePageNumber <= frontMatterThreshold;

  let totalLabel = '';
  if (totalPages != null) {
    if (isFrontMatter) {
      if (frontMatterTotalPages != null) {
        totalLabel = formatHybridPageNumber(frontMatterTotalPages, {
          frontMatterThreshold,
          uppercaseRoman
        });
      } else if (totalPages <= frontMatterThreshold) {
        totalLabel = formatHybridPageNumber(totalPages, { frontMatterThreshold, uppercaseRoman });
      } else {
        totalLabel = toRomanNumeral(frontMatterThreshold, { uppercase: uppercaseRoman });
      }
    } else {
      const mainTotal = Math.max(0, totalPages - frontMatterThreshold);
      totalLabel = String(mainTotal);
    }
  }

  const pnf = String(labelFormat);
  if (pnf === '- X -') return `- ${current} -`;
  if (pnf === 'Page X') return `Page ${current}`;
  if (pnf === 'None') return '';
  if (totalPages != null) return `Page ${current} of ${totalLabel}`;
  return `Page ${current}`;
}

export function buildPgNumTypeXml(fmt, startAttr = null) {
  const validFmts = new Set([
    'decimal', 'upperRoman', 'lowerRoman', 'upperLetter', 'lowerLetter',
    'ordinal', 'cardinalText', 'ordinalText', 'hex', 'chicago',
    'ideographDigital', 'japaneseCounting', 'aiueo', 'iroha',
    'decimalFullWidth', 'decimalHalfWidth', 'japaneseLegal', 'japaneseDigitalTenThousand'
  ]);
  const safeFmt = validFmts.has(fmt) ? fmt : 'decimal';
  const attrs = [`w:fmt="${safeFmt}"`];
  if (startAttr != null) {
    const s = Math.floor(Number(startAttr));
    if (Number.isFinite(s) && s >= 0) attrs.push(`w:start="${s}"`);
  }
  return `<w:pgNumType ${attrs.join(' ')}/>`;
}

export function buildSectionBreakXml({
  frontMatterThreshold = 4,
  mainContentStart = 1
} = {}) {
  return [
    '<w:p>',
    '<w:pPr>',
    '<w:sectPr>',
    buildPgNumTypeXml('lowerRoman', 1),
    '<w:type w:val="continuous"/>',
    '</w:sectPr>',
    '</w:pPr>',
    '</w:p>'
  ].join('');
}

export function generateHybridPageSeries(totalPages, options = {}) {
  const n = Math.max(0, Math.floor(Number(totalPages)));
  const series = [];
  for (let i = 1; i <= n; i++) {
    series.push({
      absolutePage: i,
      label: formatHybridPageNumber(i, options),
      isFrontMatter: i <= (options.frontMatterThreshold || 4)
    });
  }
  return series;
}
