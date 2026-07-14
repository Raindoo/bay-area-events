import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { hasConfiguredEvidence } from '../scripts/lib/html-dates.mjs';

const dataset = JSON.parse(await readFile(new URL('../data/events.json', import.meta.url), 'utf8'));
const registry = JSON.parse(await readFile(new URL('../data/sources.json', import.meta.url), 'utf8'));
const ids = new Set([
  'solano-stroll-2026', 'presidio-popup-2026-fall', 'sf-vegfest-2026',
  'ssf-concert-park-2026', 'program-napa-farmers-market',
  'program-365-night-market-2026', 'bizerkeley-food-fest-2026',
  'sonoma-tuesday-market-2026', 'program-heart-city-market',
  'sf-greek-food-festival-2026',
]);

test('every new official opportunity has a deterministic monitor', () => {
  const published = new Set(dataset.events.map(event => event.id));
  for (const id of ids) {
    assert.ok(published.has(id), `${id} is not published`);
    const sources = registry.sources.filter(source => source.eventId === id && source.enabled !== false);
    assert.ok(sources.length > 0, `${id} has no monitor`);
    assert.ok(sources.every(source => source.parser.type === 'evidence'));
  }
});

test('new monitors require all configured official evidence', () => {
  for (const source of registry.sources.filter(source => ids.has(source.eventId))) {
    assert.equal(hasConfiguredEvidence(source.parser.evidence.join(' | '), source.parser), true);
    assert.equal(hasConfiguredEvidence(source.parser.evidence.slice(1).join(' | '), source.parser), false);
  }
});

test('program sources do not invent dated occurrences', () => {
  const byId = new Map(dataset.events.map(event => [event.id, event]));
  for (const id of ['presidio-popup-2026-fall', 'program-napa-farmers-market', 'program-365-night-market-2026', 'program-heart-city-market']) {
    assert.equal(byId.get(id).recordType, 'vendor_network');
    assert.deepEqual(byId.get(id).occurrences, []);
  }
});
