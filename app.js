// === State ===
const STORAGE_KEY = 'bayAreaEvents';
let events = [];
let calendarDate = new Date();

// === Init ===
function init() {
    events = loadEvents();
    populateCategoryFilter();
    updateDashboard();
    renderList();
    bindEvents();
}

// === Data Management ===
function loadEvents() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return JSON.parse(JSON.stringify(DEFAULT_EVENTS));
    const saved = JSON.parse(stored);
    // Merge: keep saved versions, add any new defaults not yet in saved
    const savedIds = new Set(saved.map(e => e.id));
    const merged = [...saved];
    for (const def of DEFAULT_EVENTS) {
        if (!savedIds.has(def.id)) merged.push(JSON.parse(JSON.stringify(def)));
    }
    return merged;
}

function saveEvents() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

function generateId() {
    return 'evt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
}

// === Filters & Search ===
function getFiltered() {
    const search = document.getElementById('searchInput').value.toLowerCase();
    const month = document.getElementById('filterMonth').value;
    const size = document.getElementById('filterSize').value;
    const status = document.getElementById('filterStatus').value;
    const category = document.getElementById('filterCategory').value;
    const sortBy = document.getElementById('sortBy').value;

    let filtered = events.filter(e => {
        if (search && !e.name.toLowerCase().includes(search) && !e.location.toLowerCase().includes(search)) return false;
        if (month) {
            const m = new Date(e.startDate + 'T00:00:00').getMonth() + 1;
            if (m !== parseInt(month)) return false;
        }
        if (size && e.size !== size) return false;
        if (status && e.vendorStatus !== status) return false;
        if (category && !(e.tags || []).includes(category)) return false;
        return true;
    });

    const sizeOrder = { Small: 1, Medium: 2, Large: 3, Massive: 4 };
    filtered.sort((a, b) => {
        if (sortBy === 'date') return a.startDate.localeCompare(b.startDate);
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        if (sortBy === 'size') return (sizeOrder[b.size] || 0) - (sizeOrder[a.size] || 0);
        return 0;
    });

    return filtered;
}

// === Dashboard ===
function updateDashboard() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    document.getElementById('statTotal').textContent = events.length;
    document.getElementById('statUpcoming').textContent = events.filter(e => {
        const d = new Date(e.startDate + 'T00:00:00');
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear && d >= now;
    }).length;
    document.getElementById('statPending').textContent = events.filter(e => e.vendorStatus === 'Applied' || e.vendorStatus === 'Waitlisted').length;
    document.getElementById('statAccepted').textContent = events.filter(e => e.vendorStatus === 'Accepted').length;
}

// === Category Filter ===
function populateCategoryFilter() {
    const cats = new Set();
    events.forEach(e => (e.tags || []).forEach(t => cats.add(t)));
    const select = document.getElementById('filterCategory');
    const current = select.value;
    select.innerHTML = '<option value="">All Categories</option>';
    [...cats].sort().forEach(c => {
        const opt = document.createElement('option');
        opt.value = c; opt.textContent = c;
        select.appendChild(opt);
    });
    select.value = current;
}

// === Rendering: List ===
function renderList() {
    const container = document.getElementById('listView');
    const filtered = getFiltered();

    if (filtered.length === 0) {
        container.innerHTML = '<div class="no-events">No events match your filters</div>';
        return;
    }

    container.innerHTML = filtered.map(e => {
        const statusClass = 'badge-' + e.vendorStatus.toLowerCase().replace(/\s+/g, '-');
        const startDate = formatDate(e.startDate);
        const endDate = e.endDate && e.endDate !== e.startDate ? ' – ' + formatDate(e.endDate) : '';
        const deadlineInfo = getDeadlineInfo(e.applicationDeadline);
        const tags = (e.tags || []).map(t => `<span class="tag">${t}</span>`).join('');

        return `
        <div class="event-card" data-id="${e.id}">
            <div class="event-card-main">
                <div class="event-name">${esc(e.name)}</div>
                <div class="event-meta">
                    <span>📅 ${startDate}${endDate}</span>
                    <span>📍 ${esc(e.location)}</span>
                    <span class="size-badge">${e.size}</span>
                </div>
                ${tags ? `<div class="event-tags">${tags}</div>` : ''}
                ${e.notes ? `<div class="event-notes-preview">${esc(e.notes)}</div>` : ''}
            </div>
            <div class="event-card-right">
                <span class="badge ${statusClass}">${e.vendorStatus}</span>
                ${e.vendorFee ? `<span class="event-fee">${esc(e.vendorFee)}</span>` : ''}
                ${deadlineInfo ? `<span class="event-deadline ${deadlineInfo.urgent ? 'urgent' : ''}">${deadlineInfo.text}</span>` : ''}
            </div>
        </div>`;
    }).join('');
}

// === Rendering: Calendar ===
function renderCalendar() {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    document.getElementById('calTitle').textContent = `${monthNames[month]} ${year}`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev = new Date(year, month, 0).getDate();
    const today = new Date();

    const eventsInRange = events.filter(e => {
        const start = new Date(e.startDate + 'T00:00:00');
        const end = e.endDate ? new Date(e.endDate + 'T00:00:00') : start;
        const monthStart = new Date(year, month, 1);
        const monthEnd = new Date(year, month + 1, 0);
        return start <= monthEnd && end >= monthStart;
    });

    let html = '';
    const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

    for (let i = 0; i < totalCells; i++) {
        let day, isOther = false, dateStr;
        if (i < firstDay) {
            day = daysInPrev - firstDay + i + 1;
            isOther = true;
            dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        } else if (i - firstDay >= daysInMonth) {
            day = i - firstDay - daysInMonth + 1;
            isOther = true;
            dateStr = `${year}-${String(month + 2).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        } else {
            day = i - firstDay + 1;
            dateStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        }

        const isToday = !isOther && day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
        const classes = ['cal-day'];
        if (isOther) classes.push('other-month');
        if (isToday) classes.push('today');

        // Find events on this day
        let dayEvents = '';
        if (!isOther) {
            const cellDate = new Date(year, month, day);
            const matching = eventsInRange.filter(e => {
                const start = new Date(e.startDate + 'T00:00:00');
                const end = e.endDate ? new Date(e.endDate + 'T00:00:00') : start;
                return cellDate >= start && cellDate <= end;
            });
            dayEvents = matching.slice(0, 3).map(e => {
                const sc = 'status-' + e.vendorStatus.toLowerCase().replace(/\s+/g, '-');
                return `<div class="cal-event ${sc}" data-id="${e.id}" title="${esc(e.name)}">${esc(e.name)}</div>`;
            }).join('');
            if (matching.length > 3) dayEvents += `<div class="cal-event" style="color:var(--text-dim)">+${matching.length - 3} more</div>`;
        }

        html += `<div class="${classes.join(' ')}"><div class="cal-day-number">${day}</div>${dayEvents}</div>`;
    }

    document.getElementById('calDays').innerHTML = html;
}

// === Modal ===
function openModal(eventData) {
    const modal = document.getElementById('modal');
    const title = document.getElementById('modalTitle');
    const deleteBtn = document.getElementById('deleteBtn');

    if (eventData) {
        title.textContent = 'Edit Event';
        deleteBtn.style.display = 'block';
        document.getElementById('eventId').value = eventData.id;
        document.getElementById('formName').value = eventData.name;
        document.getElementById('formStartDate').value = eventData.startDate;
        document.getElementById('formEndDate').value = eventData.endDate || '';
        document.getElementById('formLocation').value = eventData.location;
        document.getElementById('formSize').value = eventData.size;
        document.getElementById('formStatus').value = eventData.vendorStatus;
        document.getElementById('formDeadline').value = eventData.applicationDeadline || '';
        document.getElementById('formFee').value = eventData.vendorFee || '';
        document.getElementById('formUrl').value = eventData.website || '';
        document.getElementById('formTags').value = (eventData.tags || []).join(', ');
        document.getElementById('formNotes').value = eventData.notes || '';
    } else {
        title.textContent = 'Add Event';
        deleteBtn.style.display = 'none';
        document.getElementById('eventForm').reset();
        document.getElementById('eventId').value = '';
    }

    modal.style.display = 'flex';
    document.getElementById('formName').focus();
}

function closeModal() {
    document.getElementById('modal').style.display = 'none';
}

function saveEvent(e) {
    e.preventDefault();
    const id = document.getElementById('eventId').value;
    const data = {
        id: id || generateId(),
        name: document.getElementById('formName').value.trim(),
        startDate: document.getElementById('formStartDate').value,
        endDate: document.getElementById('formEndDate').value || document.getElementById('formStartDate').value,
        location: document.getElementById('formLocation').value.trim(),
        size: document.getElementById('formSize').value,
        vendorStatus: document.getElementById('formStatus').value,
        applicationDeadline: document.getElementById('formDeadline').value,
        vendorFee: document.getElementById('formFee').value.trim(),
        website: document.getElementById('formUrl').value.trim(),
        tags: document.getElementById('formTags').value.split(',').map(t => t.trim()).filter(Boolean),
        notes: document.getElementById('formNotes').value.trim()
    };

    if (id) {
        const idx = events.findIndex(ev => ev.id === id);
        if (idx !== -1) events[idx] = data;
    } else {
        events.push(data);
    }

    saveEvents();
    closeModal();
    refresh();
}

function deleteEvent() {
    const id = document.getElementById('eventId').value;
    if (!id) return;
    if (!confirm('Delete this event?')) return;
    events = events.filter(e => e.id !== id);
    saveEvents();
    closeModal();
    refresh();
}

// === Export CSV ===
function exportCSV() {
    const filtered = getFiltered();
    const headers = ['Name','Start Date','End Date','Location','Size','Vendor Status','Application Deadline','Vendor Fee','Website','Tags','Notes'];
    const rows = filtered.map(e => [
        e.name, e.startDate, e.endDate || '', e.location, e.size, e.vendorStatus,
        e.applicationDeadline || '', e.vendorFee || '', e.website || '',
        (e.tags || []).join('; '), e.notes || ''
    ]);

    const csv = [headers, ...rows].map(row =>
        row.map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(',')
    ).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bay-area-events.csv';
    a.click();
    URL.revokeObjectURL(url);
}

// === Helpers ===
function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getDeadlineInfo(deadline) {
    if (!deadline) return null;
    const d = new Date(deadline + 'T00:00:00');
    const now = new Date();
    const diff = Math.ceil((d - now) / (1000 * 60 * 60 * 24));
    if (diff < 0) return { text: 'Deadline passed', urgent: false };
    if (diff <= 14) return { text: `⚠️ ${diff}d left to apply`, urgent: true };
    if (diff <= 30) return { text: `${diff}d to deadline`, urgent: false };
    return { text: `Due ${formatDate(deadline)}`, urgent: false };
}

function esc(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

function refresh() {
    updateDashboard();
    populateCategoryFilter();
    renderList();
    if (document.getElementById('calendarView').style.display !== 'none') renderCalendar();
}

// === Event Bindings ===
function bindEvents() {
    // Search & filters
    document.getElementById('searchInput').addEventListener('input', renderList);
    ['filterMonth', 'filterSize', 'filterStatus', 'filterCategory', 'sortBy'].forEach(id => {
        document.getElementById(id).addEventListener('change', renderList);
    });

    // View toggle
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

    // Calendar nav
    document.getElementById('calPrev').addEventListener('click', () => {
        calendarDate.setMonth(calendarDate.getMonth() - 1);
        renderCalendar();
    });
    document.getElementById('calNext').addEventListener('click', () => {
        calendarDate.setMonth(calendarDate.getMonth() + 1);
        renderCalendar();
    });

    // Add event
    document.getElementById('addEventBtn').addEventListener('click', () => openModal(null));

    // Card clicks (list view)
    document.getElementById('listView').addEventListener('click', (e) => {
        const card = e.target.closest('.event-card');
        if (card) {
            const ev = events.find(ev => ev.id === card.dataset.id);
            if (ev) openModal(ev);
        }
    });

    // Calendar event clicks
    document.getElementById('calDays').addEventListener('click', (e) => {
        const el = e.target.closest('.cal-event');
        if (el && el.dataset.id) {
            const ev = events.find(ev => ev.id === el.dataset.id);
            if (ev) openModal(ev);
        }
    });

    // Modal
    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('cancelBtn').addEventListener('click', closeModal);
    document.getElementById('modal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('modal')) closeModal();
    });
    document.getElementById('eventForm').addEventListener('submit', saveEvent);
    document.getElementById('deleteBtn').addEventListener('click', deleteEvent);
    document.getElementById('exportBtn').addEventListener('click', exportCSV);

    // Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });
}

// === Boot ===
document.addEventListener('DOMContentLoaded', init);
