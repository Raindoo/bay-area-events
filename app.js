// app.js — Bay Area Event Tracker (UI)
// The UI fetches the published, read-only catalog at data/events.json. Personal vendor
// state is kept in a separate versioned localStorage overlay (see app-state.js).
import {
  loadPersonalState,
  savePersonalState,
  getEventState,
  setEventState,
  importPersonalBackup,
  PERSONAL_SCHEMA_VERSION,
} from './app-state.js';
import {
  formatDate,
  parseDate,
  startOfDay,
  getDeadlineInfo,
  summarizeOccurrences,
  occurrenceState,
  verificationBadge,
  safeUrl,
  applicationWindowLabel,
  el,
  expandRecurringOccurrences,
  hasFutureOccurrence,
  matchesDashboardView,
} from './app-logic.js';

// === State ===
let catalog = [];
let personal = { version: PERSONAL_SCHEMA_VERSION, events: {} };
let calendarDate = new Date();
let lastFocused = null;
let dashboardView = 'all';

// === Init ===
async function init() {
  // Load any pre-existing personal state (no catalog filtering yet).
  personal = loadPersonalState(null);

  // Fetch the read-only catalog.
  try {
    const res = await fetch('data/events.json?cb=' + Date.now());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    catalog = Array.isArray(data.events) ? data.events : [];
  } catch (err) {
    console.error('Failed to load event catalog:', err);
    showBanner('Could not load the event catalog (data/events.json).', 'error');
    catalog = [];
  }

  // Expand recurring events forward from today (in-memory copy only).
  for (const e of catalog) {
    try {
      expandRecurringOccurrences(e, new Date());
    } catch (err) {
      console.warn('Recurrence expansion failed for', e && e.id, err);
    }
  }

  // Re-load in case legacy data needs migration. Personal records for events that are
  // currently quarantined remain preserved; rendering is naturally limited by catalog.
  personal = loadPersonalState(null);
  if (personal.migrated) {
    savePersonalState(personal);
    showBanner('Restored your previous vendor notes from local storage.', 'ok');
  }

  populateCategoryFilter();
  updateDashboard();
  renderList();
  bindEvents();
  showCatalogFreshness();
}

// === Last updated indicator ===
function showCatalogFreshness() {
  const dates = [];
  for (const event of catalog) {
    dates.push(event.source && event.source.lastVerifiedAt);
    dates.push(event.opportunity && event.opportunity.verification && event.opportunity.verification.lastVerifiedAt);
    dates.push(event.recurrence && event.recurrence.verification && event.recurrence.verification.lastVerifiedAt);
    for (const occurrence of event.occurrences || []) {
      dates.push(occurrence.verification && occurrence.verification.lastVerifiedAt);
    }
  }
  const latest = dates.filter(Boolean).sort().at(-1);
  if (!latest) return;
  const d = parseDate(latest);
  if (!d) return;
  const fmt = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  document.getElementById('lastUpdated').textContent = 'Sources checked ' + fmt;
}

// === Filters & search ===
function getFiltered() {
  const search = document.getElementById('searchInput').value.trim().toLowerCase();
  const month = document.getElementById('filterMonth').value;
  const size = document.getElementById('filterSize').value;
  const status = document.getElementById('filterStatus').value;
  const category = document.getElementById('filterCategory').value;
  const sortBy = document.getElementById('sortBy').value;
  const now = new Date();

  let filtered = catalog.filter((e) => {
    const personalStatus = getEventState(personal, e.id).status || 'Not Applied';
    if (!matchesDashboardView(e, personalStatus, dashboardView, now)) return false;
    if (search) {
      const hay = (e.name + ' ' + e.location + ' ' + (e.categories || []).join(' ')).toLowerCase();
      if (!hay.includes(search)) return false;
    }
    if (size && e.size !== size) return false;
    if (status && personalStatus !== status) return false;
    if (status && status !== 'Not Applied' && !hasFutureOccurrence(e, now)) return false;
    if (category && !(e.categories || []).includes(category)) return false;
    if (month) {
      const m = parseInt(month, 10);
      const inMonth = (e.occurrences || []).some((o) => {
        const d = parseDate(o.startDate) || parseDate(o.endDate);
        return d && d.getMonth() + 1 === m;
      });
      if (!inMonth) return false;
    }
    return true;
  });

  const sizeOrder = { Small: 1, Medium: 2, Large: 3, Massive: 4 };
  filtered.sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'size') return (sizeOrder[b.size] || 0) - (sizeOrder[a.size] || 0);
    const sa = (summarizeOccurrences(a.occurrences, now).next || {}).startDate || '9999-12-31';
    const sb = (summarizeOccurrences(b.occurrences, now).next || {}).startDate || '9999-12-31';
    return sa.localeCompare(sb);
  });

  return filtered;
}

// === Dashboard ===
function updateDashboard() {
  const now = new Date();
  document.getElementById('statTotal').textContent = catalog.length;
  document.getElementById('statUpcoming').textContent = catalog.filter((e) => hasFutureOccurrence(e, now)).length;
  document.getElementById('statPending').textContent = catalog.filter((e) => {
    const s = getEventState(personal, e.id).status || 'Not Applied';
    return hasFutureOccurrence(e, now) && (s === 'Applied' || s === 'Waitlisted');
  }).length;
  document.getElementById('statAccepted').textContent = catalog.filter((e) => {
    return hasFutureOccurrence(e, now) && (getEventState(personal, e.id).status || 'Not Applied') === 'Accepted';
  }).length;
}

function setDashboardView(view) {
  dashboardView = view;
  document.querySelectorAll('.stat-card[data-view]').forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  renderList();
}

// === Category filter ===
function populateCategoryFilter() {
  const cats = new Set();
  catalog.forEach((e) => (e.categories || []).forEach((t) => cats.add(t)));
  const select = document.getElementById('filterCategory');
  const current = select.value;
  select.textContent = '';
  select.appendChild(el('option', { value: '' }, ['All Categories']));
  [...cats].sort().forEach((c) => select.appendChild(el('option', { value: c }, [c])));
  select.value = current;
}

// === Badge helpers ===
function stateBadge(state) {
  const map = {
    program: ['Vendor program', 'badge-rolling'],
    upcoming: ['Upcoming', 'badge-upcoming'],
    ongoing: ['Happening now', 'badge-ongoing'],
    expired: ['Expired', 'badge-expired'],
    unknown: ['Unknown', 'badge-unknown'],
  };
  const [label, cls] = map[state] || map.unknown;
  return el('span', { class: `badge ${cls}` }, [label]);
}
function appWindowBadge(status) {
  const cls = { open: 'badge-open', rolling: 'badge-rolling', closed: 'badge-closed', unknown: 'badge-unknown' }[status] || 'badge-unknown';
  return el('span', { class: `badge ${cls}`, title: 'Application window' }, [applicationWindowLabel(status)]);
}
function verifiedBadge(v) {
  const cls = { verified: 'badge-verified', partial: 'badge-partial', unverified: 'badge-unverified', stale: 'badge-stale' }[v.kind];
  return el('span', { class: `badge ${cls}`, title: 'Source verification' }, [v.label]);
}
function statusBadge(status) {
  const cls = 'badge-' + status.toLowerCase().replace(/\s+/g, '-');
  return el('span', { class: `badge ${cls}` }, [status]);
}

// === Rendering: List ===
function buildCard(event) {
  const now = new Date();
  const ps = getEventState(personal, event.id);
  const isProgram = event.recordType === 'vendor_network';
  const occ = summarizeOccurrences(event.occurrences, now);
  const opp = event.opportunity || {};
  const appStatus = opp.applicationStatus || 'unknown';
  const vBadge = verificationBadge(event.source, now);
  const myStatus = ps.status || 'Not Applied';
  const deadlineStr = ps.deadline || opp.deadline || null;
  const deadlineInfo = getDeadlineInfo(deadlineStr, now);
  const fee = ps.fee || opp.fee || null;
  const officialUrl = safeUrl(event.source && event.source.officialUrl);
  const applyUrl = safeUrl(opp.applicationUrl);
  const recurrence = event.recurrence;

  const badges = el('div', { class: 'event-badges' }, [
    stateBadge(isProgram ? 'program' : occ.state),
    appWindowBadge(appStatus),
    verifiedBadge(vBadge),
    statusBadge(myStatus),
  ]);

  const meta = el('div', { class: 'event-meta' });
  if (isProgram) {
    meta.appendChild(el('span', {}, ['🧭 Multi-market vendor program']));
  } else if (occ.next) {
    const extra = occ.futureCount > 1 ? ` (+${occ.futureCount - 1} more)` : '';
    meta.appendChild(el('span', {}, [`📅 ${formatDate(occ.next.startDate)}${extra}`]));
  } else {
    meta.appendChild(el('span', {}, ['📅 No upcoming dates']));
  }
  meta.appendChild(el('span', {}, [`📍 ${event.location}`]));
  meta.appendChild(el('span', { class: 'size-badge' }, [event.size]));

  const main = el('div', { class: 'event-card-main' }, [
    el('div', { class: 'event-name' }, [event.name]),
    meta,
    badges,
  ]);

  if (event.categories && event.categories.length) {
    main.appendChild(
      el('div', { class: 'event-tags' }, event.categories.map((c) => el('span', { class: 'tag' }, [c])))
    );
  }

  const preview = ps.notes || event.description;
  if (preview) main.appendChild(el('div', { class: 'event-notes-preview' }, [preview]));

  if (recurrence && recurrence.summary) {
    main.appendChild(el('div', { class: 'event-recurrence' }, [`🔁 ${recurrence.summary}`]));
  }

  const right = el('div', { class: 'event-card-right' });
  if (fee) right.appendChild(el('span', { class: 'event-fee' }, [fee]));
  if (deadlineInfo) {
    right.appendChild(
      el('span', { class: 'event-deadline' + (deadlineInfo.urgent ? ' urgent' : '') }, [deadlineInfo.text])
    );
  }
  const links = el('div', { class: 'event-links' });
  if (officialUrl) {
    links.appendChild(
      el('a', { class: 'event-link', href: officialUrl, target: '_blank', rel: 'noopener noreferrer', onclick: (e) => e.stopPropagation() }, ['Official site'])
    );
  }
  if (applyUrl) {
    links.appendChild(
      el('a', { class: 'event-link event-link-apply', href: applyUrl, target: '_blank', rel: 'noopener noreferrer', onclick: (e) => e.stopPropagation() }, ['Apply'])
    );
  }
  if (links.childNodes.length) right.appendChild(links);

  const card = el(
    'div',
    {
      class: 'event-card',
      role: 'button',
      tabindex: '0',
      dataset: { id: event.id },
      'aria-label': `${event.name}. ${isProgram ? 'Rolling vendor program' : occ.next ? 'Next: ' + formatDate(occ.next.startDate) : 'No upcoming dates'}. Your status: ${myStatus}.`,
      onclick: () => openDialog(event),
      onkeydown: (ev) => {
        if (ev.target !== card) return;
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          openDialog(event);
        }
      },
    },
    [main, right]
  );
  return card;
}

function renderList() {
  const container = document.getElementById('listView');
  container.textContent = '';
  const filtered = getFiltered();
  if (!filtered.length) {
    container.appendChild(el('div', { class: 'no-events' }, ['No events match your filters']));
    return;
  }
  const frag = document.createDocumentFragment();
  for (const e of filtered) frag.appendChild(buildCard(e));
  container.appendChild(frag);
}

// === Rendering: Calendar ===
function pad(n) {
  return String(n).padStart(2, '0');
}

function renderCalendar() {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  document.getElementById('calTitle').textContent = `${monthNames[month]} ${year}`;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const today = new Date();
  const now = new Date();

  const eventsInRange = catalog.filter((e) =>
    (e.occurrences || []).some((o) => {
      const start = parseDate(o.startDate) || parseDate(o.endDate);
      const end = parseDate(o.endDate) || start;
      if (!start) return false;
      const monthStart = new Date(year, month, 1);
      const monthEnd = new Date(year, month + 1, 0);
      return start <= monthEnd && end >= monthStart;
    })
  );

  const calDays = document.getElementById('calDays');
  calDays.textContent = '';
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  const frag = document.createDocumentFragment();

  for (let i = 0; i < totalCells; i++) {
    let day, isOther = false, cellDate;
    if (i < firstDay) {
      day = daysInPrev - firstDay + i + 1;
      isOther = true;
      cellDate = new Date(year, month - 1, day);
    } else if (i - firstDay >= daysInMonth) {
      day = i - firstDay - daysInMonth + 1;
      isOther = true;
      cellDate = new Date(year, month + 1, day);
    } else {
      day = i - firstDay + 1;
      cellDate = new Date(year, month, day);
    }

    const classes = ['cal-day'];
    if (isOther) classes.push('other-month');
    if (!isOther && day === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
      classes.push('today');
    }

    const dayEl = el('div', { class: classes.join(' ') }, [el('div', { class: 'cal-day-number' }, [String(day)])]);

    if (!isOther) {
      const cd = startOfDay(cellDate);
      const matching = eventsInRange.filter((e) =>
        (e.occurrences || []).some((o) => {
          const start = parseDate(o.startDate) || parseDate(o.endDate);
          const end = parseDate(o.endDate) || start;
          return cd >= startOfDay(start) && cd <= startOfDay(end);
        })
      );
      matching.slice(0, 3).forEach((e) => {
        const myStatus = getEventState(personal, e.id).status || 'Not Applied';
        const sc = 'status-' + myStatus.toLowerCase().replace(/\s+/g, '-');
        const node = el(
          'div',
          {
            class: `cal-event ${sc}`,
            role: 'button',
            tabindex: '0',
            dataset: { id: e.id },
            title: e.name,
            onclick: () => openDialog(e),
            onkeydown: (ev) => {
              if (ev.target !== node) return;
              if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                openDialog(e);
              }
            },
          },
          [e.name]
        );
        dayEl.appendChild(node);
      });
      if (matching.length > 3) {
        dayEl.appendChild(el('div', { class: 'cal-event', style: 'color:var(--text-dim)' }, [`+${matching.length - 3} more`]));
      }
    }
    frag.appendChild(dayEl);
  }
  calDays.appendChild(frag);
}

// === Dialog (details + personal state) ===
function detailRow(label, valueNode) {
  return el('div', { class: 'detail-row' }, [
    el('span', { class: 'detail-label' }, [label]),
    el('span', { class: 'detail-value' }, [valueNode]),
  ]);
}

function openDialog(event) {
  lastFocused = document.activeElement;
  const now = new Date();
  const ps = getEventState(personal, event.id);
  const occ = summarizeOccurrences(event.occurrences, now);
  const opp = event.opportunity || {};
  const vBadge = verificationBadge(event.source, now);
  const officialUrl = safeUrl(event.source && event.source.officialUrl);
  const applyUrl = safeUrl(opp.applicationUrl);
  const appStatus = opp.applicationStatus || 'unknown';

  document.getElementById('modalTitle').textContent = event.name;
  document.getElementById('eventId').value = event.id;

  const details = document.getElementById('modalDetails');
  details.textContent = '';
  details.appendChild(detailRow('Type', event.recordType === 'vendor_network' ? 'Multi-market vendor program' : event.recordType === 'recurring_market' ? 'Recurring market' : 'Dated event'));
  details.appendChild(detailRow('Location', event.location));
  details.appendChild(detailRow('Size', event.size));
  if (event.recordType === 'vendor_network') {
    details.appendChild(detailRow('Schedule', 'Rolling program; choose markets after organizer review'));
  } else if (occ.next) {
    const range = `${formatDate(occ.next.startDate)}${occ.next.endDate && occ.next.endDate !== occ.next.startDate ? ' – ' + formatDate(occ.next.endDate) : ''}${occ.futureCount > 1 ? ` (+${occ.futureCount - 1} more)` : ''}`;
    details.appendChild(detailRow('Next occurrence', range));
  } else {
    details.appendChild(detailRow('Occurrences', 'No upcoming dates'));
  }
  if (event.recurrence && event.recurrence.summary) {
    details.appendChild(detailRow('Recurrence', event.recurrence.summary));
  }
  details.appendChild(detailRow('Verification', vBadge.label));
  details.appendChild(detailRow('Applications', applicationWindowLabel(appStatus)));
  if (opp.fee) details.appendChild(detailRow('Fee', opp.fee));
  if (event.description) details.appendChild(detailRow('Description', event.description));

  if (occ.sorted.length) {
    const list = el(
      'ul',
      { class: 'occ-list' },
      occ.sorted.slice(0, 8).map((o) => el('li', {}, [`${formatDate(o.startDate)} — ${occurrenceState(o, now)}`]))
    );
    details.appendChild(detailRow('Upcoming dates', list));
  }

  const links = el('div', { class: 'detail-links' });
  if (officialUrl) {
    links.appendChild(el('a', { class: 'event-link', href: officialUrl, target: '_blank', rel: 'noopener noreferrer' }, ['Official site']));
  }
  if (applyUrl) {
    links.appendChild(el('a', { class: 'event-link event-link-apply', href: applyUrl, target: '_blank', rel: 'noopener noreferrer' }, ['Apply / Info']));
  }
  if (links.childNodes.length) details.appendChild(detailRow('Links', links));

  // Editable personal fields (prefill with personal state, fall back to catalog defaults).
  document.getElementById('formStatus').value = ps.status || 'Not Applied';
  document.getElementById('formDeadline').value = ps.deadline || '';
  document.getElementById('formFee').value = ps.fee || opp.fee || '';
  document.getElementById('formNotes').value = ps.notes || '';

  const modal = document.getElementById('modal');
  modal.style.display = 'flex';
  document.getElementById('formStatus').focus();
}

function closeDialog() {
  document.getElementById('modal').style.display = 'none';
  if (lastFocused && lastFocused.focus) lastFocused.focus();
  lastFocused = null;
}

function savePersonal(e) {
  e.preventDefault();
  const id = document.getElementById('eventId').value;
  if (!id) return;
  const patch = {
    status: document.getElementById('formStatus').value,
    deadline: document.getElementById('formDeadline').value || null,
    fee: document.getElementById('formFee').value.trim(),
    notes: document.getElementById('formNotes').value.trim(),
  };
  setEventState(personal, id, patch);
  savePersonalState(personal);
  closeDialog();
  refresh();
  showBanner('Saved your details for this event.', 'ok');
}

// === Backup export / import (personal state only) ===
function exportBackup() {
  const payload = {
    version: PERSONAL_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    events: personal.events || {},
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bay-area-events-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importBackup(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const res = importPersonalBackup(String(reader.result), null);
    if (!res.ok) {
      showBanner('Import failed: ' + res.error, 'error');
      return;
    }
    personal.events = { ...personal.events, ...res.events };
    savePersonalState(personal);
    refresh();
    const n = Object.keys(res.events).length;
    showBanner(`Imported ${n} event${n === 1 ? '' : 's'} from backup.`, 'ok');
  };
  reader.onerror = () => showBanner('Could not read the backup file.', 'error');
  reader.readAsText(file);
}

// === Banner ===
function showBanner(msg, kind) {
  const b = document.getElementById('banner');
  if (!b) return;
  b.textContent = msg;
  b.className = 'banner banner-' + (kind || 'ok');
  b.hidden = false;
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(() => {
    b.hidden = true;
  }, 4000);
}

// === Helpers ===
function refresh() {
  updateDashboard();
  populateCategoryFilter();
  renderList();
  if (document.getElementById('calendarView').style.display !== 'none') renderCalendar();
}

// === Event bindings ===
function bindEvents() {
  document.querySelectorAll('.stat-card[data-view]').forEach((button) => {
    button.addEventListener('click', () => setDashboardView(button.dataset.view));
  });
  document.getElementById('searchInput').addEventListener('input', renderList);
  ['filterMonth', 'filterSize', 'filterStatus', 'filterCategory', 'sortBy'].forEach((id) => {
    document.getElementById(id).addEventListener('change', renderList);
  });

  document.getElementById('listViewBtn').addEventListener('click', () => {
    document.getElementById('listView').style.display = '';
    document.getElementById('calendarView').style.display = 'none';
    document.getElementById('listViewBtn').classList.add('active');
    document.getElementById('calendarViewBtn').classList.remove('active');
  });
  document.getElementById('calendarViewBtn').addEventListener('click', () => {
    document.getElementById('listView').style.display = 'none';
    document.getElementById('calendarView').style.display = '';
    document.getElementById('calendarViewBtn').classList.add('active');
    document.getElementById('listViewBtn').classList.remove('active');
    renderCalendar();
  });

  document.getElementById('calPrev').addEventListener('click', () => {
    calendarDate.setMonth(calendarDate.getMonth() - 1);
    renderCalendar();
  });
  document.getElementById('calNext').addEventListener('click', () => {
    calendarDate.setMonth(calendarDate.getMonth() + 1);
    renderCalendar();
  });

  // Backup / restore
  document.getElementById('backupBtn').addEventListener('click', exportBackup);
  document.getElementById('restoreBtn').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    importBackup(file);
    e.target.value = '';
  });

  // Modal
  document.getElementById('modalClose').addEventListener('click', closeDialog);
  document.getElementById('cancelBtn').addEventListener('click', closeDialog);
  document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal')) closeDialog();
  });
  document.getElementById('eventForm').addEventListener('submit', savePersonal);

  // Escape + basic focus trap
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('modal');
      if (modal.style.display === 'flex') closeDialog();
      return;
    }
    if (e.key === 'Tab') {
      const modal = document.getElementById('modal');
      if (modal.style.display !== 'flex') return;
      const focusables = modal.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
}

// === Boot ===
document.addEventListener('DOMContentLoaded', init);
