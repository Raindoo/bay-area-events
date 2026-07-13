import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { datesFromJsonLd, normalizeName, validateDataset } from './lib/data-model.mjs';
import { extractConfiguredDateRange, hasConfiguredEvidence } from './lib/html-dates.mjs';
import { extractJsonLdEvents } from './lib/json-ld.mjs';
import { addRecurringOccurrences } from './lib/recurrence.mjs';

const root = new URL('../', import.meta.url);
function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

function fileOption(name, fallback) {
  const value = argument(name);
  return value === null ? fallback : resolve(value);
}

const eventsUrl = fileOption('--events', new URL('data/events.json', root));
const sourcesUrl = fileOption('--sources', new URL('data/sources.json', root));
const reportUrl = fileOption('--report', new URL('data/refresh-report.json', root));
const write = process.argv.includes('--write');
const today = argument('--today') || new Date().toISOString().slice(0, 10);

const dataset = JSON.parse(await readFile(eventsUrl, 'utf8'));
const registry = JSON.parse(await readFile(sourcesUrl, 'utf8'));
const eventsById = new Map(dataset.events.map(event => [event.id, event]));
const report = { checkedAt: new Date().toISOString(), confirmed: [], changed: [], needsReview: [], failures: [] };

async function fetchWithRetry(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(20_000),
        headers: { 'user-agent': 'BayAreaVendorTracker/1.0 (+https://github.com/Raindoo/bay-area-events)' }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, attempt * 750));
    }
  }
  throw lastError;
}

function chooseJsonLdCandidate(candidates, source, event) {
  const expected = normalizeName(source.parser?.name || event.name);
  const exact = candidates.filter(candidate => normalizeName(candidate.name) === expected);
  if (exact.length === 1) return exact[0];
  const contains = candidates.filter(candidate => {
    const candidateName = normalizeName(candidate.name);
    return candidateName.includes(expected) || expected.includes(candidateName);
  });
  return contains.length === 1 ? contains[0] : null;
}

function dayDistance(left, right) {
  return Math.abs((new Date(`${left}T00:00:00Z`) - new Date(`${right}T00:00:00Z`)) / 86_400_000);
}

function markSourceTargetsStale(event, source) {
  const staleAfterDays = source.staleAfterDays ?? 30;
  const targets = source.parser?.type === 'evidence'
    ? (source.parser.targets || [source.parser.target || 'identity'])
    : ['occurrence'];
  const changed = [];

  for (const target of targets) {
    let verification;
    if (target === 'identity') verification = event.source;
    if (target === 'recurrence') verification = event.recurrence?.verification;
    if (target === 'opportunity') verification = event.opportunity?.verification;
    if (target === 'occurrence') verification = event.occurrences.find(item => item.id === source.occurrenceId)?.verification;
    if (!verification?.lastVerifiedAt || dayDistance(verification.lastVerifiedAt, today) <= staleAfterDays) continue;
    if (verification.status !== 'stale') {
      verification.status = 'stale';
      if (target === 'opportunity') event.opportunity.applicationStatus = 'unknown';
      changed.push(target);
    }
  }

  if (changed.length) report.changed.push({ eventId: event.id, action: 'mark-stale', targets: changed, url: source.url });
}

function verificationForTarget(event, source, target) {
  if (target === 'identity') return event.source;
  if (target === 'recurrence') return event.recurrence?.verification;
  if (target === 'opportunity') return event.opportunity?.verification;
  if (target === 'occurrence') {
    return event.occurrences.find(item => item.id === source.occurrenceId)?.verification;
  }
  return null;
}

function refreshSourceTargets(event, source, targets, status) {
  const changed = [];
  for (const target of targets) {
    const verification = verificationForTarget(event, source, target);
    if (!verification) continue;
    const before = JSON.stringify(verification);
    verification.lastVerifiedAt = today;
    if (status) verification.status = status;
    if (target === 'identity') verification.verificationMethod = 'generated';
    else verification.method = 'generated';
    if (JSON.stringify(verification) !== before) changed.push(target);
  }
  if (changed.length) {
    report.changed.push({ eventId: event.id, action: 'refresh-verification', targets: changed, url: source.url });
  }
}

async function processSource(source) {
  const event = eventsById.get(source.eventId);
  if (!event) {
    report.failures.push({ eventId: source.eventId, url: source.url, error: 'Source references an unknown event' });
    return;
  }

  try {
    const html = await fetchWithRetry(source.url);
    let dates = null;
    if (source.parser?.type === 'jsonld') {
      const candidate = chooseJsonLdCandidate(extractJsonLdEvents(html), source, event);
      dates = datesFromJsonLd(candidate);
    } else if (source.parser?.type === 'date-pattern') {
      dates = extractConfiguredDateRange(html, source.parser);
    } else if (source.parser?.type === 'evidence') {
      if (hasConfiguredEvidence(html, source.parser)) {
        const targets = source.parser.targets || [source.parser.target || 'identity'];
        refreshSourceTargets(event, source, targets, source.parser.verifies || null);
        report.confirmed.push({ eventId: event.id, targets, method: 'evidence-monitor', url: source.url });
      } else {
        report.needsReview.push({ eventId: event.id, reason: 'Expected official-source evidence changed or disappeared', url: source.url });
        markSourceTargetsStale(event, source);
      }
      return;
    } else {
      report.needsReview.push({ eventId: event.id, reason: 'Source is reachable but has no deterministic parser', url: source.url });
      return;
    }

    if (!dates) {
      report.needsReview.push({ eventId: event.id, reason: `No unique valid ${source.parser.type} date match`, url: source.url });
      markSourceTargetsStale(event, source);
      return;
    }

    const candidateYear = Number(dates.startDate.slice(0, 4));
    const allowedYears = source.allowedYears || [Number(today.slice(0, 4)), Number(today.slice(0, 4)) + 1];
    if (!allowedYears.includes(candidateYear)) {
      report.needsReview.push({ eventId: event.id, reason: `Candidate year ${candidateYear} is outside the configured allowlist`, candidate: dates, url: source.url });
      return;
    }

    const current = event.occurrences.find(occurrence => occurrence.id === source.occurrenceId);
    if (!current) {
      report.failures.push({ eventId: event.id, error: `Unknown occurrence ${source.occurrenceId}` });
      return;
    }

    const existingCandidate = event.occurrences.find(occurrence => occurrence.startDate === dates.startDate && occurrence.endDate === dates.endDate);
    const currentYear = Number(current.startDate.slice(0, 4));
    if (candidateYear > currentYear && source.rollForward === true) {
      report.needsReview.push({
        eventId: event.id,
        reason: existingCandidate ? 'Newer occurrence already exists and awaits human verification' : 'Official source suggests a new occurrence',
        candidate: dates,
        url: source.url
      });
      return;
    }

    if (candidateYear < currentYear) {
      report.needsReview.push({ eventId: event.id, reason: 'Official source appears to have rolled back to an older occurrence', current: { startDate: current.startDate, endDate: current.endDate }, candidate: dates, url: source.url });
      return;
    }

    const difference = current.startDate !== dates.startDate || current.endDate !== dates.endDate;
    if (difference) {
      const maxShiftDays = source.maxShiftDays ?? 14;
      report.needsReview.push({
        eventId: event.id,
        reason: dayDistance(current.startDate, dates.startDate) > maxShiftDays
          ? `Candidate moved more than ${maxShiftDays} days`
          : 'Official dates differ; human review is required',
        current: { startDate: current.startDate, endDate: current.endDate },
        candidate: dates,
        url: source.url
      });
      return;
    }
    refreshSourceTargets(event, source, ['occurrence'], 'verified');
    report.confirmed.push({ eventId: event.id, targets: ['occurrence'], method: source.parser.type, observed: dates, url: source.url });
  } catch (error) {
    report.failures.push({ eventId: event.id, url: source.url, error: error.message });
    markSourceTargetsStale(event, source);
  }
}

const pendingSources = registry.sources.filter(source => source.enabled !== false);
const sourceGroups = [...Map.groupBy(pendingSources, source => new URL(source.url).hostname).values()];
const concurrency = Math.min(5, sourceGroups.length || 1);
let nextGroupIndex = 0;
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (nextGroupIndex < sourceGroups.length) {
    const group = sourceGroups[nextGroupIndex];
    nextGroupIndex += 1;
    for (const source of group) await processSource(source);
  }
}));

report.changed.sort((a, b) => a.eventId.localeCompare(b.eventId));
report.confirmed.sort((a, b) => a.eventId.localeCompare(b.eventId));
report.needsReview.sort((a, b) => a.eventId.localeCompare(b.eventId));
report.failures.sort((a, b) => String(a.eventId || '').localeCompare(String(b.eventId || '')));

for (const event of dataset.events) {
  for (const occurrence of addRecurringOccurrences(event, today)) {
    report.changed.push({ eventId: event.id, action: 'add-recurring-occurrence', after: occurrence, url: event.source.officialUrl });
  }
}
report.changed.sort((a, b) => a.eventId.localeCompare(b.eventId));

if (report.changed.length) dataset.generatedAt = new Date().toISOString();
const validationErrors = validateDataset(dataset);
if (validationErrors.length) {
  for (const error of validationErrors) report.failures.push({ error: `Validation: ${error}` });
}

if (write && report.changed.length && validationErrors.length === 0) {
  await writeFile(eventsUrl, `${JSON.stringify(dataset, null, 2)}\n`);
}
await writeFile(reportUrl, `${JSON.stringify(report, null, 2)}\n`);

console.log(`Checked ${pendingSources.length} sources: ${report.confirmed.length} confirmed monitor(s), ${report.changed.length} data change(s), ${report.needsReview.length} review item(s), ${report.failures.length} failure(s).`);
if (validationErrors.length || (process.argv.includes('--strict') && report.failures.length)) process.exitCode = 1;
