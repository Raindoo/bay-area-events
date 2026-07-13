import test from 'node:test';
import assert from 'node:assert/strict';
import { datesFromJsonLd, isDate, normalizeName, validateDataset, validatePublishedDataset, validateRegistry } from '../scripts/lib/data-model.mjs';

function validDataset() {
  return {
    schemaVersion: 1,
    generatedAt: null,
    events: [{
      id: 'example',
      name: 'Example Event',
      location: 'Oakland, CA',
      size: 'Medium',
      categories: ['Food'],
      occurrences: [{ id: 'example-2026', startDate: '2026-08-01', endDate: '2026-08-02', verification: { status: 'unverified', method: 'human', lastVerifiedAt: null } }],
      opportunity: { applicationStatus: 'unknown', deadline: null, fee: null, eligibility: null, applicationUrl: null, verification: { status: 'unverified', method: 'human', lastVerifiedAt: null } },
      source: { officialUrl: 'https://example.com/event', status: 'unverified', verificationMethod: 'human', lastVerifiedAt: null }
    }]
  };
}

test('strictly validates calendar dates', () => {
  assert.equal(isDate('2026-02-28'), true);
  assert.equal(isDate('2026-02-30'), false);
  assert.equal(isDate('07/13/2026'), false);
});

test('rejects duplicate event and occurrence identifiers', () => {
  const dataset = validDataset();
  dataset.events.push(structuredClone(dataset.events[0]));
  const errors = validateDataset(dataset);
  assert.ok(errors.some(error => error.includes('id duplicates example')));
  assert.ok(errors.some(error => error.includes('occurrence') && error.includes('duplicates')));
});

test('rejects inverted occurrence ranges and insecure source URLs', () => {
  const dataset = validDataset();
  dataset.events[0].occurrences[0].endDate = '2026-07-31';
  dataset.events[0].source.officialUrl = 'http://example.com/event';
  const errors = validateDataset(dataset);
  assert.ok(errors.some(error => error.includes('precedes')));
  assert.ok(errors.some(error => error.includes('https URL')));
});

test('normalizes event names without fuzzy guessing', () => {
  assert.equal(normalizeName('SF Pride & Festival!'), 'sf pride and festival');
});

test('extracts date-only facts from JSON-LD', () => {
  assert.deepEqual(datesFromJsonLd({ startDate: '2026-09-05T12:00:00-07:00', endDate: '2026-09-06' }), {
    startDate: '2026-09-05',
    endDate: '2026-09-06'
  });
});

test('rejects machine auto-publication and requires deterministic parser year guards', () => {
  const dataset = validDataset();
  const registry = {
    schemaVersion: 1,
    sources: [{
      eventId: 'example',
      occurrenceId: 'example-2026',
      url: 'https://example.com/event',
      autopublish: true,
      parser: { type: 'date-pattern', pattern: 'example' }
    }]
  };
  const errors = validateRegistry(registry, dataset);
  assert.ok(errors.some(error => error.includes('autopublish is unsupported')));
  assert.ok(errors.some(error => error.includes('allowedYears')));
});

test('rejects source monitors that reference unpublished events', () => {
  const errors = validateRegistry({
    schemaVersion: 1,
    sources: [{ eventId: 'missing', url: 'https://example.com', parser: { type: 'manual' } }]
  }, validDataset());
  assert.ok(errors.some(error => error.includes('unknown event')));
});

test('rejects malformed recurrence and evidence verification configuration', () => {
  const dataset = validDataset();
  dataset.events[0].recurrence = {
    frequency: 'weekly',
    startDate: '2026-01-01',
    endDate: null,
    byWeekdays: ['FR', 'FR', 'NOPE'],
    exceptions: ['not-a-date'],
    horizonDays: 0,
    verification: { status: 'partial', method: 'human', lastVerifiedAt: '2026-01-01' },
  };
  const dataErrors = validateDataset(dataset);
  assert.ok(dataErrors.some(error => error.includes('invalid weekday')));
  assert.ok(dataErrors.some(error => error.includes('must be unique')));
  assert.ok(dataErrors.some(error => error.includes('exceptions')));
  assert.ok(dataErrors.some(error => error.includes('positive integer')));

  const registry = {
    schemaVersion: 1,
    sources: [{
      eventId: 'example',
      url: 'https://example.com/vendors',
      parser: { type: 'evidence', targets: ['opportunity'], evidence: ['Apply'], verifies: 'certain' },
      maxShiftDays: -1,
    }],
  };
  const sourceErrors = validateRegistry(registry, validDataset());
  assert.ok(sourceErrors.some(error => error.includes('verifies is invalid')));
  assert.ok(sourceErrors.some(error => error.includes('maxShiftDays')));
});

test('keeps unverified records out of the published catalog', () => {
  const errors = validatePublishedDataset(validDataset());
  assert.ok(errors.some(error => error.includes('belongs in quarantine')));
});
