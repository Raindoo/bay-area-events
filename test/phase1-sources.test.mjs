import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { hasConfiguredEvidence } from '../scripts/lib/html-dates.mjs';

const dataset = JSON.parse(await readFile(new URL('../data/events.json', import.meta.url), 'utf8'));
const registry = JSON.parse(await readFile(new URL('../data/sources.json', import.meta.url), 'utf8'));
const phase1Ids = new Set([
  'program-pcfma', 'program-aim', 'program-uvfm', 'dftsf-2026',
  'bhangra-beats-2026', 'hasf-2026', 'renegade-sf-winter-2026',
]);

test('every Phase 1 opportunity has an enabled deterministic monitor', () => {
  for (const id of phase1Ids) {
    const monitors = registry.sources.filter(source => source.eventId === id && source.enabled !== false);
    assert.ok(monitors.length > 0, `${id} has no enabled monitor`);
    assert.ok(monitors.every(source => source.parser.type !== 'manual'), `${id} relies on a manual monitor`);
  }
});

test('network opportunities do not invent event dates', () => {
  const networks = dataset.events.filter(event => event.recordType === 'vendor_network');
  assert.deepEqual(networks.map(event => event.id).sort(), ['program-aim', 'program-pcfma', 'program-uvfm']);
  assert.ok(networks.every(event => event.occurrences.length === 0));
  assert.ok(networks.every(event => event.opportunity.applicationStatus === 'rolling'));
});

test('removing any required evidence phrase fails its semantic monitor', () => {
  for (const source of registry.sources.filter(source => phase1Ids.has(source.eventId) && source.parser.type === 'evidence')) {
    const complete = source.parser.evidence.join(' | ');
    assert.equal(hasConfiguredEvidence(complete, source.parser), true);
    const missing = source.parser.evidence.slice(1).join(' | ');
    assert.equal(hasConfiguredEvidence(missing, source.parser), false);
  }
});

test('only explicit public application evidence is labeled open', () => {
  const byId = new Map(dataset.events.map(event => [event.id, event]));
  assert.equal(byId.get('hasf-2026').opportunity.applicationStatus, 'open');
  assert.equal(byId.get('renegade-sf-winter-2026').opportunity.applicationStatus, 'open');
  assert.equal(byId.get('dftsf-2026').opportunity.applicationStatus, 'unknown');
  assert.equal(byId.get('bhangra-beats-2026').opportunity.applicationStatus, 'unknown');
});
