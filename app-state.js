// app-state.js
// Personal vendor state overlay, stored separately from the read-only catalog.
// Versioned + corrupt-tolerant. Legacy `bayAreaEvents` localStorage is migrated once, safely.

export const PERSONAL_STORAGE_KEY = 'bayAreaEvents.personal';
export const LEGACY_STORAGE_KEY = 'bayAreaEvents';
export const PERSONAL_SCHEMA_VERSION = 1;

// The user's own application pipeline (distinct from the catalog's application window).
export const PERSONAL_STATUSES = [
  'Not Applied',
  'Applied',
  'Accepted',
  'Rejected',
  'Waitlisted',
];

const KNOWN_PERSONAL_STATUSES = new Set(PERSONAL_STATUSES);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Keep only well-formed personal fields. Returns a clean object (may be empty).
export function sanitizeEventState(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  if (typeof raw.status === 'string' && KNOWN_PERSONAL_STATUSES.has(raw.status)) out.status = raw.status;
  if (typeof raw.notes === 'string') out.notes = raw.notes;
  if (raw.deadline === null || (typeof raw.deadline === 'string' && DATE_RE.test(raw.deadline))) {
    out.deadline = raw.deadline;
  }
  if (typeof raw.fee === 'string') out.fee = raw.fee;
  return out;
}

// Extract personal state from the legacy flat event records.
// Personal records are intentionally retained even when an event temporarily leaves the
// published catalog. The UI only displays current catalog ids, but backups must not lose
// notes for quarantined or later-restored events.
export function migrateLegacy(legacyRecords) {
  const overlay = {};
  if (!Array.isArray(legacyRecords)) return overlay;
  for (const item of legacyRecords) {
    if (!item || typeof item !== 'object' || !item.id) continue;
    const ev = {};
    if (typeof item.vendorStatus === 'string') {
      ev.status = KNOWN_PERSONAL_STATUSES.has(item.vendorStatus) ? item.vendorStatus : 'Not Applied';
    }
    if (typeof item.notes === 'string' && item.notes.trim()) ev.notes = item.notes;
    if (typeof item.applicationDeadline === 'string' && DATE_RE.test(item.applicationDeadline)) {
      ev.deadline = item.applicationDeadline;
    }
    if (typeof item.vendorFee === 'string' && item.vendorFee.trim()) ev.fee = item.vendorFee;
    if (Object.keys(ev).length) overlay[item.id] = ev;
  }
  return overlay;
}

function getStorage(storage) {
  if (storage) return storage;
  if (typeof localStorage !== 'undefined') return localStorage;
  return null;
}

// Load the personal overlay. Recovers gracefully from corrupt storage:
//  - corrupt personal state -> attempt legacy migration
//  - corrupt legacy state    -> start fresh (no throw)
// Returns { version, events, migrated } where `migrated` is true if legacy data was adopted.
export function loadPersonalState(_catalogIds, storage) {
  const store = getStorage(storage);
  const result = { version: PERSONAL_SCHEMA_VERSION, events: {}, migrated: false };

  const readJSON = (key) => {
    const raw = store.getItem(key);
    if (raw == null) return undefined;
    return JSON.parse(raw); // may throw -> caller handles
  };

  // 1) Try the current versioned overlay first.
  try {
    const raw = store.getItem(PERSONAL_STORAGE_KEY);
    if (raw != null) {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || typeof parsed.events !== 'object') {
        throw new Error('personal state shape invalid');
      }
      const events = {};
      for (const [id, val] of Object.entries(parsed.events)) {
        const clean = sanitizeEventState(val);
        if (Object.keys(clean).length) events[id] = clean;
      }
      result.events = events;
      result.version = parsed.version || PERSONAL_SCHEMA_VERSION;
      return result;
    }
  } catch (err) {
    console.warn('[app-state] personal overlay corrupt, attempting legacy recovery:', err);
  }

  // 2) Recover from the legacy flat store, if present.
  try {
    const legacy = readJSON(LEGACY_STORAGE_KEY);
    if (legacy !== undefined) {
      const overlay = migrateLegacy(legacy);
      if (Object.keys(overlay).length) {
        result.events = overlay;
        result.migrated = true;
      }
    }
  } catch (err) {
    console.warn('[app-state] legacy state corrupt, starting fresh:', err);
  }

  return result;
}

// Persist the personal overlay. Accepts an optional storage (for tests/migration).
export function savePersonalState(state, storage) {
  const store = getStorage(storage);
  const payload = {
    version: PERSONAL_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    events: state.events || {},
  };
  store.setItem(PERSONAL_STORAGE_KEY, JSON.stringify(payload));
}

export function getEventState(state, eventId) {
  return state.events[eventId] || {};
}

export function setEventState(state, eventId, patch) {
  const current = state.events[eventId] || {};
  state.events[eventId] = { ...current, ...patch };
}

// Validate + normalize an imported backup blob into a clean overlay.
// Returns { ok, events, error }. Never throws.
export function importPersonalBackup(rawText, _catalogIds) {
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { ok: false, events: {}, error: 'File is not valid JSON.' };
  }
  const src = parsed && typeof parsed === 'object' ? parsed.events : null;
  if (!src || typeof src !== 'object') {
    return { ok: false, events: {}, error: 'Backup has no "events" object.' };
  }
  const events = {};
  for (const [id, val] of Object.entries(src)) {
    const clean = sanitizeEventState(val);
    if (Object.keys(clean).length) events[id] = clean;
  }
  return { ok: true, events, error: null };
}
