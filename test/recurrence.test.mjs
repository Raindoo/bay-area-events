import test from 'node:test';
import assert from 'node:assert/strict';
import { addRecurringOccurrences, expandRecurrence } from '../scripts/lib/recurrence.mjs';

test('expands weekly recurrence only on configured weekdays', () => {
  assert.deepEqual(expandRecurrence({
    frequency: 'weekly', startDate: '2026-07-01', endDate: null, byWeekdays: ['TU', 'TH', 'SA']
  }, '2026-07-13', '2026-07-20'), ['2026-07-14', '2026-07-16', '2026-07-18']);
});

test('expands first-Friday recurrence and honors exceptions', () => {
  assert.deepEqual(expandRecurrence({
    frequency: 'monthly', startDate: '2026-01-01', endDate: '2026-12-31', byWeekdays: ['FR'], weekOfMonth: 1,
    exceptions: ['2026-09-04']
  }, '2026-07-01', '2026-10-31'), ['2026-07-03', '2026-08-07', '2026-10-02']);
});

test('adds stable occurrence ids without duplicating existing dates', () => {
  const event = {
    id: 'market',
    recurrence: {
      frequency: 'weekly', startDate: '2026-07-01', endDate: null, byWeekdays: ['SA'], horizonDays: 14,
      verification: { status: 'verified', method: 'human', lastVerifiedAt: '2026-07-13' }
    },
    occurrences: [{ id: 'market@2026-07-18', startDate: '2026-07-18', endDate: '2026-07-18', verification: { status: 'partial', method: 'generated', lastVerifiedAt: '2026-07-13' } }]
  };
  assert.deepEqual(addRecurringOccurrences(event, '2026-07-13').map(item => item.id), ['market@2026-07-25']);
  assert.equal(event.occurrences.at(-1).verification.method, 'generated');
  assert.equal(event.occurrences.at(-1).verification.status, 'partial');
});
