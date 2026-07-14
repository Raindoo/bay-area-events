import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { hasConfiguredEvidence } from '../scripts/lib/html-dates.mjs';

const dataset = JSON.parse(await readFile(new URL('../data/events.json', import.meta.url), 'utf8'));
const registry = JSON.parse(await readFile(new URL('../data/sources.json', import.meta.url), 'utf8'));
const phase2Ids = new Set([
  'program-sunset-mercantile', 'fellowship-craft-winter-2026', 'program-sjmade',
  'laurel-streetfair-2026', 'program-off-the-grid-2026', 'sf-coffee-festival-2026',
]);

test('every Phase 2 opportunity has an enabled deterministic official-source monitor', () => {
  for (const id of phase2Ids) {
    const monitors = registry.sources.filter(source => source.eventId === id && source.enabled !== false);
    assert.ok(monitors.length > 0, `${id} has no enabled monitor`);
    assert.ok(monitors.every(source => source.parser.type === 'evidence'), `${id} has a non-evidence monitor`);
  }
});

test('Phase 2 does not invent dates for organizer networks', () => {
  const byId = new Map(dataset.events.map(event => [event.id, event]));
  for (const id of ['program-sunset-mercantile', 'program-sjmade', 'program-off-the-grid-2026']) {
    assert.equal(byId.get(id).recordType, 'vendor_network');
    assert.deepEqual(byId.get(id).occurrences, []);
  }
});

test('unknown application state is preserved where no public current-year route exists', () => {
  const byId = new Map(dataset.events.map(event => [event.id, event]));
  assert.equal(byId.get('program-sjmade').opportunity.applicationStatus, 'unknown');
  assert.equal(byId.get('sf-coffee-festival-2026').opportunity.applicationStatus, 'unknown');
  assert.equal(byId.get('sf-coffee-festival-2026').opportunity.applicationUrl, null);
});

test('removing Phase 2 evidence fails its semantic monitor', () => {
  for (const source of registry.sources.filter(source => phase2Ids.has(source.eventId))) {
    const complete = source.parser.evidence.join(' | ');
    assert.equal(hasConfiguredEvidence(complete, source.parser), true);
    assert.equal(hasConfiguredEvidence(source.parser.evidence.slice(1).join(' | '), source.parser), false);
  }
});
