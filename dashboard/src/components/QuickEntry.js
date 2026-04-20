/**
 * QuickEntry.js — Refined entry form with mini-card sections.
 * Pre-loads existing data when opening for a specific date.
 */

let selectedMood = null;
let currentEntryDate = null;

export function renderQuickEntry(container) {
  container.innerHTML = `
    <div class="qe-card">
      <div class="qe-card-header">Настроение</div>
      <div class="mood-buttons" id="moodButtons">
        ${[1, 2, 3, 4, 5].map(v =>
          `<button class="mood-btn" data-mood="${v}">
            <span class="mood-btn-value">${v}</span>
            <span class="mood-btn-label">${['плохо', 'так', 'норм', 'хорошо', 'супер'][v-1]}</span>
          </button>`
        ).join('')}
      </div>
    </div>

    <div class="qe-card">
      <div class="qe-card-header">Питание до 20:00</div>
      <div class="toggle-row">
        <label class="toggle">
          <input type="checkbox" id="foodToggle">
          <span class="toggle-slider"></span>
        </label>
        <span class="toggle-text" id="foodLabel">Нет</span>
      </div>
    </div>

    <div class="qe-card">
      <div class="qe-card-header">Заметка</div>
      <textarea class="qe-textarea" id="entryNote" placeholder="Как прошёл день..." rows="2"></textarea>
    </div>

    <div class="qe-actions">
      <span class="qe-status" id="saveStatus"></span>
      <button class="qe-save" id="saveBtn">Сохранить</button>
    </div>
  `;

  // Mood selection
  container.querySelector('#moodButtons').addEventListener('click', (e) => {
    const btn = e.target.closest('.mood-btn');
    if (!btn) return;
    selectedMood = parseInt(btn.dataset.mood);
    container.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  });

  // Food toggle
  const foodToggle = container.querySelector('#foodToggle');
  const foodLabel = container.querySelector('#foodLabel');
  foodToggle.addEventListener('change', () => {
    foodLabel.textContent = foodToggle.checked ? 'Да' : 'Нет';
  });

  // Save
  container.querySelector('#saveBtn').addEventListener('click', async () => {
    const note = container.querySelector('#entryNote').value.trim();
    const dateStr = currentEntryDate || new Date().toISOString().slice(0, 10);
    const entry = {
      date: dateStr,
      mood: selectedMood,
      food_before_20: foodToggle.checked,
      note: note || undefined,
    };

    const btn = container.querySelector('#saveBtn');

    try {
      const res = await fetch('/api/entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

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
      console.warn('API save failed, storing locally:', err);
      const local = JSON.parse(localStorage.getItem('pendingEntries') || '[]');
      local.push(entry);
      localStorage.setItem('pendingEntries', JSON.stringify(local));

      if (btn) {
        btn.textContent = '⚠ Локально';
        btn.style.background = 'var(--yellow)';
        btn.style.color = 'var(--bg0)';
        setTimeout(() => {
          btn.textContent = 'Сохранить';
          btn.style.background = '';
          btn.style.color = '';
        }, 2000);
      }
    }
  });
}

/**
 * Load existing entry data for a date and pre-fill the form.
 */
export async function loadEntryForDate(date) {
  currentEntryDate = date || new Date().toISOString().slice(0, 10);

  // Reset form first
  selectedMood = null;
  document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
  const noteEl = document.getElementById('entryNote');
  const foodToggle = document.getElementById('foodToggle');
  const foodLabel = document.getElementById('foodLabel');
  if (noteEl) noteEl.value = '';
  if (foodToggle) { foodToggle.checked = false; }
  if (foodLabel) foodLabel.textContent = 'Нет';

  // Fetch existing data
  try {
    const res = await fetch(`/api/entry?date=${currentEntryDate}`);
    if (!res.ok) return;
    const data = await res.json();

    // Pre-fill mood
    if (data.mood != null) {
      selectedMood = data.mood;
      document.querySelectorAll('.mood-btn').forEach(b => {
        b.classList.toggle('selected', parseInt(b.dataset.mood) === data.mood);
      });
    }

    // Pre-fill food toggle
    if (data.food_before_20) {
      if (foodToggle) foodToggle.checked = true;
      if (foodLabel) foodLabel.textContent = 'Да';
    }

    // Pre-fill note
    if (data.note && noteEl) {
      noteEl.value = data.note;
    }
  } catch (err) {
    console.warn('[QuickEntry] Failed to load existing data:', err);
  }
}
