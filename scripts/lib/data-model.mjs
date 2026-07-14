const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const HTTP_URL_PATTERN = /^https:\/\//;
const SOURCE_STATUSES = new Set(['verified', 'partial', 'unverified', 'stale']);
const VERIFICATION_METHODS = new Set(['human', 'generated']);
const WEEKDAYS = new Set(['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']);
const RECORD_TYPES = new Set(['dated_event', 'recurring_market', 'vendor_network']);

function validateVerification(value, path, errors) {
  if (!value || typeof value !== 'object') {
    errors.push(`${path} is required`);
    return;
  }
  if (!SOURCE_STATUSES.has(value.status)) errors.push(`${path}.status is invalid`);
  if (!VERIFICATION_METHODS.has(value.method)) errors.push(`${path}.method is invalid`);
  if (value.lastVerifiedAt !== null && !isDate(value.lastVerifiedAt)) {
    errors.push(`${path}.lastVerifiedAt must be null or YYYY-MM-DD`);
  }
}

export function isDate(value) {
  if (!DATE_PATTERN.test(value || '')) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateDataset(dataset) {
  const errors = [];
  if (dataset?.schemaVersion !== 1) errors.push('schemaVersion must equal 1');
  if (!Array.isArray(dataset?.events)) errors.push('events must be an array');
  if (errors.length) return errors;

  const eventIds = new Set();
  const occurrenceIds = new Set();

  for (const [index, event] of dataset.events.entries()) {
    const path = `events[${index}]`;
    const recordType = event.recordType || 'dated_event';
    if (!RECORD_TYPES.has(recordType)) errors.push(`${path}.recordType is invalid`);
    if (!event.id || typeof event.id !== 'string') errors.push(`${path}.id is required`);
    else if (eventIds.has(event.id)) errors.push(`${path}.id duplicates ${event.id}`);
    else eventIds.add(event.id);

    if (!event.name || typeof event.name !== 'string') errors.push(`${path}.name is required`);
    if (!event.location || typeof event.location !== 'string') errors.push(`${path}.location is required`);
    if (!Array.isArray(event.categories)) errors.push(`${path}.categories must be an array`);
    else {
      if (event.categories.some(category => typeof category !== 'string' || !category.trim())) errors.push(`${path}.categories must contain non-empty strings`);
      if (new Set(event.categories).size !== event.categories.length) errors.push(`${path}.categories must be unique`);
    }
    if (!['Small', 'Medium', 'Large', 'Massive'].includes(event.size)) errors.push(`${path}.size is invalid`);
    if (event.recurrence !== null && event.recurrence !== undefined) {
      if (!['weekly', 'monthly'].includes(event.recurrence.frequency)) errors.push(`${path}.recurrence.frequency is invalid`);
      if (!isDate(event.recurrence.startDate)) errors.push(`${path}.recurrence.startDate must be YYYY-MM-DD`);
      if (event.recurrence.endDate !== null && !isDate(event.recurrence.endDate)) errors.push(`${path}.recurrence.endDate must be null or YYYY-MM-DD`);
      if (!Array.isArray(event.recurrence.byWeekdays) || event.recurrence.byWeekdays.length === 0) errors.push(`${path}.recurrence.byWeekdays is required`);
      else {
        if (event.recurrence.byWeekdays.some(day => !WEEKDAYS.has(day))) errors.push(`${path}.recurrence.byWeekdays contains an invalid weekday`);
        if (new Set(event.recurrence.byWeekdays).size !== event.recurrence.byWeekdays.length) errors.push(`${path}.recurrence.byWeekdays must be unique`);
      }
      if (!Array.isArray(event.recurrence.exceptions)) errors.push(`${path}.recurrence.exceptions must be an array`);
      else {
        if (event.recurrence.exceptions.some(date => !isDate(date))) errors.push(`${path}.recurrence.exceptions must contain YYYY-MM-DD dates`);
        if (new Set(event.recurrence.exceptions).size !== event.recurrence.exceptions.length) errors.push(`${path}.recurrence.exceptions must be unique`);
      }
      if (!Number.isInteger(event.recurrence.horizonDays) || event.recurrence.horizonDays < 1) errors.push(`${path}.recurrence.horizonDays must be a positive integer`);
      if (event.recurrence.frequency === 'monthly' && !(event.recurrence.weekOfMonth >= 1 && event.recurrence.weekOfMonth <= 5)) {
        errors.push(`${path}.recurrence.weekOfMonth must be 1-5 for monthly recurrence`);
      }
      validateVerification(event.recurrence.verification, `${path}.recurrence.verification`, errors);
    }
    if (!Array.isArray(event.occurrences) || (event.occurrences.length === 0 && recordType !== 'vendor_network')) {
      errors.push(`${path}.occurrences must contain at least one occurrence unless recordType is vendor_network`);
    } else {
      for (const [occurrenceIndex, occurrence] of event.occurrences.entries()) {
        const occurrencePath = `${path}.occurrences[${occurrenceIndex}]`;
        if (!occurrence.id) errors.push(`${occurrencePath}.id is required`);
        else if (occurrenceIds.has(occurrence.id)) errors.push(`${occurrencePath}.id duplicates ${occurrence.id}`);
        else occurrenceIds.add(occurrence.id);
        if (!isDate(occurrence.startDate)) errors.push(`${occurrencePath}.startDate must be YYYY-MM-DD`);
        if (!isDate(occurrence.endDate)) errors.push(`${occurrencePath}.endDate must be YYYY-MM-DD`);
        if (isDate(occurrence.startDate) && isDate(occurrence.endDate) && occurrence.endDate < occurrence.startDate) {
          errors.push(`${occurrencePath}.endDate precedes startDate`);
        }
        validateVerification(occurrence.verification, `${occurrencePath}.verification`, errors);
      }
    }

    const opportunity = event.opportunity;
    if (!opportunity || typeof opportunity !== 'object') {
      errors.push(`${path}.opportunity is required`);
    } else {
      if (!['open', 'rolling', 'closed', 'unknown'].includes(opportunity.applicationStatus)) {
        errors.push(`${path}.opportunity.applicationStatus is invalid`);
      }
      if (opportunity.deadline !== null && !isDate(opportunity.deadline)) {
        errors.push(`${path}.opportunity.deadline must be null or YYYY-MM-DD`);
      }
      if (opportunity.applicationUrl !== null && !HTTP_URL_PATTERN.test(opportunity.applicationUrl || '')) {
        errors.push(`${path}.opportunity.applicationUrl must be null or an https URL`);
      }
      validateVerification(opportunity.verification, `${path}.opportunity.verification`, errors);
    }

    const source = event.source;
    if (!source || typeof source !== 'object') {
      errors.push(`${path}.source is required`);
    } else {
      if (!HTTP_URL_PATTERN.test(source.officialUrl || '')) errors.push(`${path}.source.officialUrl must be an https URL`);
      if (!SOURCE_STATUSES.has(source.status)) errors.push(`${path}.source.status is invalid`);
      if (!VERIFICATION_METHODS.has(source.verificationMethod)) errors.push(`${path}.source.verificationMethod is invalid`);
      if (source.lastVerifiedAt !== null && !isDate(source.lastVerifiedAt)) {
        errors.push(`${path}.source.lastVerifiedAt must be null or YYYY-MM-DD`);
      }
    }
  }

  return errors;
}

export function validateRegistry(registry, dataset) {
  const errors = [];
  if (registry?.schemaVersion !== 1) errors.push('source registry schemaVersion must equal 1');
  if (!Array.isArray(registry?.sources)) return [...errors, 'source registry sources must be an array'];
  const eventIds = new Set((dataset?.events || []).map(event => event.id));
  const occurrenceIds = new Set((dataset?.events || []).flatMap(event => event.occurrences.map(occurrence => occurrence.id)));
  const keys = new Set();
  const parserTypes = new Set(['manual', 'jsonld', 'date-pattern', 'evidence']);
  const evidenceTargets = new Set(['identity', 'recurrence', 'occurrence', 'opportunity']);

  for (const [index, source] of registry.sources.entries()) {
    const path = `sources[${index}]`;
    if (!eventIds.has(source.eventId)) errors.push(`${path}.eventId references unknown event ${source.eventId}`);
    if (!HTTP_URL_PATTERN.test(source.url || '')) errors.push(`${path}.url must be an https URL`);
    const key = `${source.eventId}\n${source.url}`;
    if (keys.has(key)) errors.push(`${path} duplicates eventId and url`);
    keys.add(key);
    if (!parserTypes.has(source.parser?.type)) errors.push(`${path}.parser.type is invalid`);

    const requiresOccurrence = ['jsonld', 'date-pattern'].includes(source.parser?.type)
      || source.parser?.target === 'occurrence'
      || source.parser?.targets?.includes('occurrence');
    if (requiresOccurrence && !occurrenceIds.has(source.occurrenceId)) {
      errors.push(`${path}.occurrenceId references an unknown occurrence`);
    }

    if (source.parser?.type === 'evidence') {
      if (!Array.isArray(source.parser.evidence) || source.parser.evidence.length === 0) errors.push(`${path}.parser.evidence is required`);
      const targets = source.parser.targets || [source.parser.target || 'identity'];
      if (targets.some(target => !evidenceTargets.has(target))) errors.push(`${path}.parser has an invalid evidence target`);
      if (source.parser.verifies !== undefined && !SOURCE_STATUSES.has(source.parser.verifies)) errors.push(`${path}.parser.verifies is invalid`);
    }

    if (Object.hasOwn(source, 'autopublish')) errors.push(`${path}.autopublish is unsupported; machine changes require human review`);
    if (['jsonld', 'date-pattern'].includes(source.parser?.type) && (!Array.isArray(source.allowedYears) || source.allowedYears.length === 0)) {
      errors.push(`${path} deterministic parser requires allowedYears`);
    }
    if (source.maxShiftDays !== undefined && (!Number.isInteger(source.maxShiftDays) || source.maxShiftDays < 0)) {
      errors.push(`${path}.maxShiftDays must be a non-negative integer`);
    }
  }
  return errors;
}

export function validatePublishedDataset(dataset) {
  const errors = [];
  for (const [index, event] of (dataset?.events || []).entries()) {
    const path = `events[${index}]`;
    if (event.source?.status === 'unverified') errors.push(`${path} is unverified and belongs in quarantine, not the published catalog`);
    if (['open', 'rolling'].includes(event.opportunity?.applicationStatus)
      && !['verified', 'partial'].includes(event.opportunity?.verification?.status)) {
      errors.push(`${path} claims an actionable application status without current verification`);
    }
    if ((event.recordType || 'dated_event') === 'vendor_network') continue;
    const futureOccurrences = (event.occurrences || []).filter(occurrence => occurrence.endDate >= new Date().toISOString().slice(0, 10));
    if (futureOccurrences.length && futureOccurrences.every(occurrence => occurrence.verification?.status === 'unverified')) {
      errors.push(`${path} has only unverified future occurrences`);
    }
  }
  return errors;
}

export function normalizeName(value) {
  return String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function datesFromJsonLd(event) {
  if (!event || !isDate(String(event.startDate || '').slice(0, 10))) return null;
  const startDate = String(event.startDate).slice(0, 10);
  const candidateEnd = String(event.endDate || event.startDate).slice(0, 10);
  return {
    startDate,
    endDate: isDate(candidateEnd) && candidateEnd >= startDate ? candidateEnd : startDate
  };
}
