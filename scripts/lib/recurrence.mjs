const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function asUtcDate(value) {
  return new Date(`${value}T00:00:00Z`);
}

function iso(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function expandRecurrence(recurrence, fromDate, throughDate) {
  if (!recurrence || !Array.isArray(recurrence.byWeekdays)) return [];
  const start = asUtcDate(recurrence.startDate > fromDate ? recurrence.startDate : fromDate);
  const configuredEnd = recurrence.endDate && recurrence.endDate < throughDate ? recurrence.endDate : throughDate;
  const end = asUtcDate(configuredEnd);
  const excluded = new Set(recurrence.exceptions || []);
  const output = [];

  for (let date = start; date <= end; date = addDays(date, 1)) {
    const value = iso(date);
    const weekday = WEEKDAYS[date.getUTCDay()];
    if (!recurrence.byWeekdays.includes(weekday) || excluded.has(value)) continue;
    if (recurrence.frequency === 'monthly') {
      const weekOfMonth = Math.floor((date.getUTCDate() - 1) / 7) + 1;
      if (weekOfMonth !== recurrence.weekOfMonth) continue;
    } else if (recurrence.frequency !== 'weekly') {
      continue;
    }
    output.push(value);
  }
  return output;
}

export function addRecurringOccurrences(event, today) {
  if (!event.recurrence) return [];
  const through = addDays(asUtcDate(today), event.recurrence.horizonDays || 120);
  const dates = expandRecurrence(event.recurrence, today, iso(through));
  const existing = new Set(event.occurrences.map(occurrence => occurrence.startDate));
  const added = [];
  for (const date of dates) {
    if (existing.has(date)) continue;
    const occurrence = {
      id: `${event.id}@${date}`,
      startDate: date,
      endDate: date,
      verification: {
        status: 'partial',
        method: 'generated',
        lastVerifiedAt: event.recurrence.verification.lastVerifiedAt
      }
    };
    event.occurrences.push(occurrence);
    added.push(occurrence);
  }
  event.occurrences.sort((left, right) => left.startDate.localeCompare(right.startDate));
  return added;
}
