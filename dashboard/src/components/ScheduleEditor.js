/**
 * ScheduleEditor.js — Interactive schedule editor modal.
 * Supports date navigation, inline editing, add/delete rows,
 * and Quick Confirm (option A: shift subsequent activities up).
 */

let currentDate = null;
let blocks = [];
let initialized = false;

const MONTHS_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WEEKDAYS_RU = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

function formatDateRu(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return `${d.getDate()} ${MONTHS_RU[d.getMonth()]}, ${WEEKDAYS_RU[d.getDay()]}`;
}

function nowHHMM() {
  const n = new Date();
  return String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0');
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(dateStr, delta) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

function initListeners() {
  if (initialized) return;
  initialized = true;

  const overlay = document.getElementById('scheduleEditorOverlay');

  document.getElementById('schedPrev')?.addEventListener('click', () => {
    currentDate = shiftDate(currentDate, -1);
    loadAndRender();
  });
  document.getElementById('schedNext')?.addEventListener('click', () => {
    currentDate = shiftDate(currentDate, 1);
    loadAndRender();
  });
  document.getElementById('schedModalClose')?.addEventListener('click', closeScheduleEditor);
  document.getElementById('schedSaveBtn')?.addEventListener('click', () => saveSchedule());

  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeScheduleEditor();
    });
  }
}

export function openScheduleEditor(date) {
  currentDate = date || todayStr();
  initListeners();

  const overlay = document.getElementById('scheduleEditorOverlay');
  if (!overlay) return;
  overlay.classList.add('open');

  loadAndRender();
}

function closeScheduleEditor() {
  document.getElementById('scheduleEditorOverlay')?.classList.remove('open');
}

async function loadAndRender() {
  const titleEl = document.getElementById('schedDateTitle');
  if (titleEl) titleEl.textContent = formatDateRu(currentDate);

  try {
    const res = await fetch(`/api/schedule?date=${currentDate}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    blocks = (data.blocks || []).map(b => ({ ...b }));
    console.log(`[ScheduleEditor] Loaded ${blocks.length} blocks for ${currentDate}`);
  } catch (err) {
    console.error('[ScheduleEditor] Load error:', err);
    blocks = [];
  }

  renderRows();
}

function renderRows() {
  const body = document.getElementById('scheduleEditorBody');
  if (!body) return;

  const curHm = nowHHMM();
  const isToday = currentDate === todayStr();

  if (blocks.length === 0) {
    body.innerHTML = `
      <div style="text-align: center; color: var(--fg-muted); padding: 24px 0; font-size: 0.85rem;">
        Нет активностей на этот день
      </div>
      <div class="sched-add-row">
        <button class="sched-add-btn" id="schedAddRow">+ Добавить активность</button>
      </div>
    `;
    document.getElementById('schedAddRow')?.addEventListener('click', addRow);
    return;
  }

  let html = '';
  blocks.forEach((b, i) => {
    const isCurrent = isToday && curHm >= b.start && curHm < b.end;
    const isFirst = i === 0;
    const isLast = i === blocks.length - 1;

    html += `
      <div class="sched-row${isCurrent ? ' sched-current' : ''}" data-idx="${i}">
        <div class="sched-reorder">
          <button class="sched-reorder-btn" data-dir="up" data-idx="${i}" title="Вверх"${isFirst ? ' disabled' : ''}>▲</button>
          <button class="sched-reorder-btn" data-dir="down" data-idx="${i}" title="Вниз"${isLast ? ' disabled' : ''}>▼</button>
        </div>
        <input class="sched-time-input" type="text" value="${b.start}" data-field="start" data-idx="${i}" maxlength="5" />
        <span class="sched-time-sep">&ndash;</span>
        <input class="sched-time-input" type="text" value="${b.end}" data-field="end" data-idx="${i}" maxlength="5" />
        <input class="sched-activity-input" type="text" value="${b.activity}" data-field="activity" data-idx="${i}" />
        ${isCurrent ? `<button class="sched-confirm-btn" data-idx="${i}" title="Завершить сейчас">&#10003;</button>` : ''}
        <button class="sched-delete-btn" data-idx="${i}" title="Удалить">&times;</button>
      </div>
    `;
  });

  html += `
    <div class="sched-add-row">
      <button class="sched-add-btn" id="schedAddRow">+ Добавить активность</button>
    </div>
  `;

  body.innerHTML = html;

  // Attach input change listeners
  body.querySelectorAll('.sched-time-input, .sched-activity-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.idx);
      const field = e.target.dataset.field;
      blocks[idx][field] = e.target.value.trim();
    });
  });

  // Delete buttons
  body.querySelectorAll('.sched-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.closest('[data-idx]').dataset.idx);
      blocks.splice(idx, 1);
      renderRows();
    });
  });

  // Reorder buttons (up/down)
  body.querySelectorAll('.sched-reorder-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.idx);
      const dir = e.target.dataset.dir;
      const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= blocks.length) return;

      // Swap the activity names only, then recalculate times
      // preserving each activity's original duration
      const durA = timeToMin(blocks[idx].end) - timeToMin(blocks[idx].start);
      const durB = timeToMin(blocks[targetIdx].end) - timeToMin(blocks[targetIdx].start);

      // Swap activities
      const tmpActivity = blocks[idx].activity;
      blocks[idx].activity = blocks[targetIdx].activity;
      blocks[targetIdx].activity = tmpActivity;

      // Recalculate times: the one moving up gets its neighbor's start + own duration
      if (dir === 'up') {
        // idx moves up (to targetIdx), targetIdx moves down (to idx)
        // targetIdx now has activity that was at idx (longer/shorter)
        const startA = timeToMin(blocks[targetIdx].start);
        blocks[targetIdx].end = minToTime(startA + durA);
        blocks[idx].start = blocks[targetIdx].end;
        blocks[idx].end = minToTime(timeToMin(blocks[idx].start) + durB);
      } else {
        // idx moves down (to targetIdx), targetIdx moves up (to idx)
        const startB = timeToMin(blocks[idx].start);
        blocks[idx].end = minToTime(startB + durB);
        blocks[targetIdx].start = blocks[idx].end;
        blocks[targetIdx].end = minToTime(timeToMin(blocks[targetIdx].start) + durA);
      }

      renderRows();
    });
  });

  // Quick Confirm buttons
  body.querySelectorAll('.sched-confirm-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const idx = parseInt(e.target.closest('[data-idx]').dataset.idx);
      const now = nowHHMM();

      // End current activity at now
      const originalEnd = blocks[idx].end;
      blocks[idx].end = now;

      // Calculate saved time delta in minutes
      const savedMinutes = timeToMin(originalEnd) - timeToMin(now);

      if (savedMinutes > 0 && idx + 1 < blocks.length) {
        // Shift all subsequent activities up, preserving their durations
        for (let j = idx + 1; j < blocks.length; j++) {
          const origDuration = timeToMin(blocks[j].end) - timeToMin(blocks[j].start);
          const newStart = j === idx + 1 ? now : blocks[j - 1].end;
          blocks[j].start = newStart;
          blocks[j].end = minToTime(timeToMin(newStart) + origDuration);
        }
      }

      // Auto-save immediately
      await saveSchedule();
      renderRows();
    });
  });

  // Add row
  document.getElementById('schedAddRow')?.addEventListener('click', addRow);
}

function addRow() {
  const lastEnd = blocks.length > 0 ? blocks[blocks.length - 1].end : '09:00';
  const newEnd = minToTime(timeToMin(lastEnd) + 60);
  blocks.push({ start: lastEnd, end: newEnd, activity: '' });
  renderRows();
}

function timeToMin(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

function minToTime(min) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

async function saveSchedule() {
  const btn = document.getElementById('schedSaveBtn');
  try {
    const res = await fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: currentDate, blocks }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.log(`[ScheduleEditor] Saved ${blocks.length} blocks for ${currentDate}`);

    // Visual confirmation
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = '✓ Сохранено';
      btn.style.background = 'var(--green)';
      btn.style.color = 'var(--bg0)';
      setTimeout(() => {
        btn.textContent = orig;
        btn.style.background = '';
        btn.style.color = '';
      }, 1500);
    }
  } catch (err) {
    console.error('[ScheduleEditor] Save error:', err);
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = '✗ Ошибка';
      btn.style.background = 'var(--red)';
      btn.style.color = '#fff';
      setTimeout(() => {
        btn.textContent = orig;
        btn.style.background = '';
        btn.style.color = '';
      }, 2000);
    }
  }
}
