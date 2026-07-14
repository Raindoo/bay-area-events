import test from 'node:test';
import assert from 'node:assert/strict';
import { expandRecurringOccurrences, matchesDashboardView } from '../app-logic.js';
import {
  PERSONAL_STORAGE_KEY,
  importPersonalBackup,
  loadPersonalState,
  migrateLegacy,
} from '../app-state.js';

function memoryStorage(values = {}) {
  const data = new Map(Object.entries(values));
  return {
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, value),
  };
}

test('browser recurrence expansion honors configured exceptions', () => {
  const event = {
    id: 'market',
    occurrences: [],
    recurrence: {
      frequency: 'weekly',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      byWeekdays: ['FR'],
      exceptions: ['2026-07-10'],
      horizonDays: 60,
      verification: { status: 'partial', lastVerifiedAt: '2026-07-01' },
    },
  };
  expandRecurringOccurrences(event, new Date('2026-07-01T12:00:00'));
  assert.deepEqual(event.occurrences.map(item => item.startDate), [
    '2026-07-03',
    '2026-07-17',
    '2026-07-24',
    '2026-07-31',
  ]);
});

test('personal state survives temporary removal from the published catalog', () => {
  const stored = {
    version: 1,
    events: {
      published: { status: 'Applied' },
      quarantined: { notes: 'Keep this research' },
    },
  };
  const state = loadPersonalState(new Set(['published']), memoryStorage({
    [PERSONAL_STORAGE_KEY]: JSON.stringify(stored),
  }));
  assert.deepEqual(state.events, stored.events);
});

test('legacy migration and backup restore retain orphaned event notes', () => {
  const migrated = migrateLegacy([
    { id: 'old-event', vendorStatus: 'Applied', notes: 'Useful later' },
  ], new Set());
  assert.equal(migrated['old-event'].notes, 'Useful later');

  const imported = importPersonalBackup(JSON.stringify({
    version: 1,
    events: { 'old-event': { notes: 'Still useful' } },
  }), new Set());
  assert.equal(imported.ok, true);
  assert.equal(imported.events['old-event'].notes, 'Still useful');
});

test('dashboard application views include only ongoing or future events', () => {
  const past = { occurrences: [{ startDate: '2026-07-01', endDate: '2026-07-01' }] };
  const future = { occurrences: [{ startDate: '2026-08-01', endDate: '2026-08-02' }] };
  const today = new Date('2026-07-13T12:00:00');

  assert.equal(matchesDashboardView(past, 'Applied', 'applied', today), false);
  assert.equal(matchesDashboardView(future, 'Applied', 'applied', today), true);
  assert.equal(matchesDashboardView(future, 'Waitlisted', 'applied', today), true);
  assert.equal(matchesDashboardView(future, 'Accepted', 'accepted', today), true);
  assert.equal(matchesDashboardView(past, 'Not Applied', 'upcoming', today), false);
  assert.equal(matchesDashboardView(future, 'Not Applied', 'upcoming', today), true);
});
