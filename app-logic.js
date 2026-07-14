// app-logic.js
// Pure, testable helpers for the Bay Area Event Tracker UI.
// No DOM access at module scope; `el` references document only when called (browser only).

// ---------- Date helpers ----------
export function parseDate(value) {
  if (!value || typeof value !== 'string') return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.valueOf()) ? null : d;
}

export function formatDate(value) {
  const d = parseDate(value);
  if (!d) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Date-only "today" (local midnight), so day-boundary math is stable regardless of clock time.
export function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Expand a recurring event's occurrences forward from `now` up to its horizon.
// Mutates event.occurrences in place (catalog is an in-memory copy, so this is safe).
// Mirrors scripts/lib/recurrence.mjs but stays self-contained for the browser.
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
export function expandRecurringOccurrences(event, now = new Date()) {
  const rec = event && event.recurrence;
  if (!rec || !Array.isArray(rec.byWeekdays) || !Array.isArray(event.occurrences)) return;
  const horizon = rec.horizonDays || 120;
  const start = startOfDay(now);
  const through = new Date(start);
  through.setDate(through.getDate() + horizon);
  const base = parseDate(rec.startDate) || start;
  const rangeStart = base > start ? base : start;
  const end = rec.endDate ? parseDate(rec.endDate) : through;
  const rangeEnd = end < through ? end : through;
  const existing = new Set(event.occurrences.map((o) => o.startDate));
  const excluded = new Set(rec.exceptions || []);
  for (let d = new Date(rangeStart); d <= rangeEnd; d.setDate(d.getDate() + 1)) {
    const iso = isoDate(d);
    if (excluded.has(iso)) continue;
    const wd = WEEKDAYS[d.getDay()];
    if (!rec.byWeekdays.includes(wd)) continue;
    if (rec.frequency === 'monthly') {
      const weekOfMonth = Math.floor((d.getDate() - 1) / 7) + 1;
      if (weekOfMonth !== rec.weekOfMonth) continue;
    } else if (rec.frequency !== 'weekly') {
      continue;
    }
    if (existing.has(iso)) continue;
    event.occurrences.push({
      id: `${event.id}@${iso}`,
      startDate: iso,
      endDate: iso,
      verification: { ...(rec.verification || { status: 'unverified', lastVerifiedAt: null }) },
    });
    existing.add(iso);
  }
  event.occurrences.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function dayDiff(from, to) {
  return Math.round((startOfDay(to) - startOfDay(from)) / 86400000);
}

// ---------- Deadline semantics ----------
// A deadline date is INCLUSIVE: you may still apply on the deadline day.
// We compare whole calendar days so partial days left in the clock don't mis-report.
export function getDeadlineInfo(deadlineStr, now = new Date()) {
  if (!deadlineStr) return null;
  const deadline = parseDate(deadlineStr);
  if (!deadline) return null;
  const diff = dayDiff(now, deadline); // whole days until the deadline date
  if (diff < 0) return { text: 'Deadline passed', urgent: false, state: 'expired' };
  if (diff === 0) return { text: 'Due today', urgent: true, state: 'due-today' };
  if (diff <= 14) return { text: `${diff} day${diff === 1 ? '' : 's'} left to apply`, urgent: true, state: 'soon' };
  if (diff <= 30) return { text: `${diff} days to deadline`, urgent: false, state: 'upcoming' };
  return { text: `Due ${formatDate(deadlineStr)}`, urgent: false, state: 'upcoming' };
}

// ---------- Occurrences & upcoming/expired state ----------
export function occurrenceState(occ, now = new Date()) {
  const start = parseDate(occ.startDate);
  const end = parseDate(occ.endDate) || start;
  if (!start) return 'unknown';
  const today = startOfDay(now);
  if (today > startOfDay(end)) return 'expired';
  if (today >= startOfDay(start) && today <= startOfDay(end)) return 'ongoing';
  return 'upcoming';
}

// Summarize an event's occurrences relative to "now".
// Returns { next, futureCount, pastCount, state, sorted } where state is one of
// 'upcoming' | 'ongoing' | 'expired' | 'unknown'.
export function summarizeOccurrences(occurrences, now = new Date()) {
  const list = (occurrences || []).slice();
  const today = startOfDay(now);
  const future = [];
  let past = 0;
  for (const o of list) {
    const end = parseDate(o.endDate) || parseDate(o.startDate);
    if (end && startOfDay(end) >= today) future.push(o);
    else past += 1;
  }
  future.sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
  const next = future[0] || null;
  let state = 'unknown';
  if (next) {
    const start = parseDate(next.startDate);
    const end = parseDate(next.endDate) || start;
    if (today >= startOfDay(start) && today <= startOfDay(end)) state = 'ongoing';
    else state = 'upcoming';
  } else if (past > 0) {
    state = 'expired';
  }
  return { next, futureCount: future.length, pastCount: past, state, sorted: future };
}

export function hasFutureOccurrence(event, now = new Date()) {
  const state = summarizeOccurrences(event?.occurrences, now).state;
  return state === 'upcoming' || state === 'ongoing';
}

// Dashboard views are deliberately future-aware. Personal application states remain
// stored after an event passes, but they do not clutter the actionable pipeline views.
export function matchesDashboardView(event, personalStatus = 'Not Applied', view = 'all', now = new Date()) {
  if (view === 'all') return true;
  if (!hasFutureOccurrence(event, now)) return false;
  if (view === 'upcoming') return true;
  if (view === 'applied') return personalStatus === 'Applied' || personalStatus === 'Waitlisted';
  if (view === 'accepted') return personalStatus === 'Accepted';
  return false;
}

// ---------- Verification / stale badges ----------
export const STALE_MAX_AGE_DAYS = 90;

export function isStale(lastVerifiedAt, now = new Date(), maxAgeDays = STALE_MAX_AGE_DAYS) {
  if (!lastVerifiedAt) return false;
  const d = parseDate(lastVerifiedAt);
  if (!d) return false;
  return dayDiff(d, now) > maxAgeDays;
}

// Accepts a verification object { status, lastVerifiedAt } or a source/opportunity with those fields.
export function verificationBadge(obj, now = new Date()) {
  const status = (obj && obj.status) || 'unverified';
  if (status === 'stale') return { label: 'Stale', kind: 'stale' };
  if (status === 'verified') {
    if (isStale(obj && obj.lastVerifiedAt, now)) return { label: 'Stale', kind: 'stale' };
    return { label: 'Verified', kind: 'verified' };
  }
  if (status === 'partial') return { label: 'Partially verified', kind: 'partial' };
  return { label: 'Unverified', kind: 'unverified' };
}

// ---------- Safe URLs ----------
// Only allow http(s) links; reject javascript:, data:, and other schemes to prevent XSS / unsafe navigation.
export function isSafeUrl(url) {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const base = typeof window !== 'undefined' && window.location ? window.location.href : undefined;
    const u = new URL(trimmed, base);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

export function safeUrl(url) {
  return isSafeUrl(url) ? String(url).trim() : null;
}

// ---------- Application-window label ----------
const APPLICATION_LABELS = {
  open: 'Applications Open',
  rolling: 'Rolling Applications',
  closed: 'Applications Closed',
  unknown: 'Applications Unknown',
};
export function applicationWindowLabel(status) {
  return APPLICATION_LABELS[status] || APPLICATION_LABELS.unknown;
}

// ---------- Tiny DOM builder (browser only) ----------
// el('div', { class, text, dataset:{id}, onclick, 'aria-label' }, [child|string])
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      node.setAttribute(key, value === true ? '' : String(value));
    }
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}
