import { isDate } from './data-model.mjs';

const MONTHS = new Map([
  ['jan', 1], ['january', 1], ['feb', 2], ['february', 2], ['mar', 3], ['march', 3],
  ['apr', 4], ['april', 4], ['may', 5], ['jun', 6], ['june', 6], ['jul', 7], ['july', 7],
  ['aug', 8], ['august', 8], ['sep', 9], ['sept', 9], ['september', 9], ['oct', 10],
  ['october', 10], ['nov', 11], ['november', 11], ['dec', 12], ['december', 12]
]);

export function htmlToText(html) {
  return String(html)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&ndash;|&mdash;|&#8211;|&#8212;/gi, '-')
    .replace(/[–—]/g, '-')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function monthNumber(value) {
  if (!value) return null;
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 12) return numeric;
  return MONTHS.get(String(value).toLowerCase()) || null;
}

function isoDate(year, month, day) {
  const value = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return isDate(value) ? value : null;
}

export function extractConfiguredDateRange(html, parser) {
  if (!parser?.pattern) return null;
  const text = parser.input === 'html' ? String(html) : htmlToText(html);
  const match = new RegExp(parser.pattern, parser.flags || 'i').exec(text);
  if (!match?.groups) return null;

  const startYear = Number(match.groups.startYear || match.groups.year);
  const startMonth = monthNumber(match.groups.startMonth || match.groups.month);
  const startDay = Number(match.groups.startDay);
  const endYear = Number(match.groups.endYear || startYear);
  const endMonth = monthNumber(match.groups.endMonth || startMonth);
  const endDay = Number(match.groups.endDay || startDay);
  const startDate = isoDate(startYear, startMonth, startDay);
  const endDate = isoDate(endYear, endMonth, endDay);
  if (!startDate || !endDate || endDate < startDate) return null;
  return { startDate, endDate, evidence: match[0].slice(0, 300) };
}

export function hasConfiguredEvidence(html, parser) {
  const text = parser.input === 'html' ? String(html) : htmlToText(html);
  return Array.isArray(parser.evidence) && parser.evidence.length > 0 && parser.evidence.every(value => {
    return text.toLowerCase().includes(String(value).toLowerCase());
  });
}
