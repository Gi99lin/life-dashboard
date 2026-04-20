/**
 * MoodHeatmap.js — GitHub-style mood heatmap with tooltips + month separators.
 */

import { getDays } from '../utils/dataLoader.js';

export function renderMoodHeatmap(container, data) {
  const allDays = getDays(data);

  // Build mood + note map
  const moodMap = {};
  for (const day of allDays) {
    if (day.manual?.mood) {
      moodMap[day.date] = {
        mood: day.manual.mood,
        note: day.manual?.note || null,
      };
    }
  }

  const today = new Date();
  const weeks = 16;
  const dayLabels = ['Пн', '', 'Ср', '', 'Пт', '', 'Вс'];

  // Find start of grid
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - startDate.getDay() + 1 - (weeks - 1) * 7);
  if (startDate.getDay() === 0) startDate.setDate(startDate.getDate() - 6);

  // Track month boundaries for separators
  const monthBoundaries = [];
  let prevMonth = -1;
  const monthLabels = [];

  for (let w = 0; w < weeks; w++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + w * 7);
    const month = d.getMonth();
    const names = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

    if (month !== prevMonth) {
      monthBoundaries.push(w);
      monthLabels.push({ week: w, name: names[month] });
      prevMonth = month;
    }
  }

  // Current week index
  const todayMs = today.getTime();
  const startMs = startDate.getTime();
  const currentWeek = Math.floor((todayMs - startMs) / (7 * 24 * 60 * 60 * 1000));

  // Month labels
  let html = `<div class="heatmap-months" style="position: relative; height: 14px;">`;
  for (const label of monthLabels) {
    let extraPx = 0;
    for (let w = 1; w <= label.week; w++) {
      if (monthBoundaries.includes(w)) extraPx += 2;
    }
    const leftPx = label.week * 17 + extraPx;
    html += `<span class="heatmap-month-label" style="position:absolute; left:${leftPx}px">${label.name}</span>`;
  }
  html += `</div>`;

  // Grid
  for (let row = 0; row < 7; row++) {
    html += `<div class="heatmap-row">`;
    html += `<span class="heatmap-label">${dayLabels[row]}</span>`;

    for (let w = 0; w < weeks; w++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + w * 7 + row);
      const dateStr = d.toISOString().slice(0, 10);
      const entry = moodMap[dateStr];
      const mood = entry?.mood;
      const isFuture = d > today;
      const isMonthStart = monthBoundaries.includes(w) && w > 0;
      const isCurrentWeek = w === currentWeek;

      const classes = ['heatmap-cell'];
      if (isMonthStart) classes.push('heatmap-month-start');
      if (isCurrentWeek) classes.push('heatmap-current-week');

      if (isFuture) {
        html += `<div class="${classes.join(' ')}" style="opacity:0.12"></div>`;
      } else {
        // Format tooltip
        const dateDisplay = formatDateRu(d);
        let tooltipText = dateDisplay;
        if (mood) tooltipText += ` — ${mood}/5`;
        if (entry?.note && entry.note.length < 60) tooltipText += `\n${entry.note}`;

        html += `<div class="${classes.join(' ')}" data-mood="${mood || ''}" data-tooltip="${escapeAttr(tooltipText)}" data-date="${dateStr}" style="cursor:pointer"></div>`;
      }
    }

    html += `</div>`;
  }

  // Legend
  html += `
    <div class="heatmap-legend">
      <span>Меньше</span>
      <div class="heatmap-legend-cell" style="background:#343f44"></div>
      <div class="heatmap-legend-cell" style="background:#543a3a"></div>
      <div class="heatmap-legend-cell" style="background:#6e5340"></div>
      <div class="heatmap-legend-cell" style="background:#5c6a4a"></div>
      <div class="heatmap-legend-cell" style="background:#6a8a50"></div>
      <div class="heatmap-legend-cell" style="background:#8bb56a"></div>
      <span>Больше</span>
    </div>
  `;

  container.innerHTML = html;

  // Attach tooltip behavior
  initTooltips(container);

  // Click on cell → open QuickEntry for that date
  container.addEventListener('click', (e) => {
    const cell = e.target.closest('.heatmap-cell');
    if (!cell || !cell.dataset.date) return;
    if (typeof window.__openQuickEntry === 'function') {
      window.__openQuickEntry(cell.dataset.date);
    }
  });
}

function formatDateRu(d) {
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

function escapeAttr(str) {
  return str.replace(/"/g, '&quot;').replace(/\n/g, '&#10;');
}

function initTooltips(container) {
  let tooltip = document.getElementById('heatmapTooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'heatmapTooltip';
    tooltip.className = 'heatmap-tooltip';
    document.body.appendChild(tooltip);
  }

  container.addEventListener('mouseover', (e) => {
    const cell = e.target.closest('.heatmap-cell');
    if (!cell || !cell.dataset.tooltip) return;

    const text = cell.dataset.tooltip.replace(/&#10;/g, '\n');
    tooltip.textContent = text;
    tooltip.classList.add('visible');

    const rect = cell.getBoundingClientRect();
    tooltip.style.left = `${rect.left + rect.width / 2}px`;
    tooltip.style.top = `${rect.top - 8}px`;
  });

  container.addEventListener('mouseout', (e) => {
    const cell = e.target.closest('.heatmap-cell');
    if (cell) tooltip.classList.remove('visible');
  });
}
