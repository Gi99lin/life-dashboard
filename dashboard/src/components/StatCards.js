/**
 * StatCards.js — Stat cards with custom visualizations per metric.
 *
 * - Mood: value + sparkline
 * - Sleep: value + mini bar chart (7 days) with norm zone + wake time
 * - Body Battery: value or placeholder
 * - Steps: value or placeholder
 * - Commits: weekly total + repo names + mini contribution dots
 */

import { Chart, registerables } from 'chart.js';
import { getDays } from '../utils/dataLoader.js';

Chart.register(...registerables);

const CARDS = [
  { id: 'mood', label: 'Настроение', color: '#dbbc7f', unit: '/5', decimals: 0, get: d => d.manual?.mood },
  { id: 'sleep', label: 'Сон', color: '#83c092', unit: 'ч', decimals: 1, get: d => d.garmin?.sleep_hours ?? d.schedule?.hours_sleep },
  { id: 'bb', label: 'Body Battery', color: '#a7c080', unit: '%', decimals: 0, get: d => d.garmin?.body_battery_max },
  { id: 'steps', label: 'Шаги', color: '#7fbbb3', unit: '', decimals: 0, get: d => d.garmin?.steps },
  { id: 'commits', label: 'Коммиты', color: '#e69875', unit: '', decimals: 0, get: d => d.git?.commits },
];

let expandedCard = null;
let detailChart = null;

function animateValue(el, target, unit, decimals = 0, duration = 600) {
  const startTime = performance.now();
  function tick(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = target * eased;
    const display = decimals > 0 ? current.toFixed(decimals) : Math.round(current);
    el.innerHTML = `${display}<span class="stat-unit">${unit}</span>`;
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function animateSteps(el, target, unit) {
  const startTime = performance.now();
  function tick(now) {
    const progress = Math.min((now - startTime) / 700, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.innerHTML = `${Math.round(target * eased).toLocaleString()}<span class="stat-unit">${unit}</span>`;
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ---- Custom card renderers ----

function renderSleepCard(el, days30, days7, latest, avg) {
  // Wake time from latest day with schedule
  const latestWithWake = [...days7].reverse().find(d => d.schedule?.wake_time);
  const wakeTime = latestWithWake?.schedule?.wake_time || null;

  const last7 = days7.slice(-7).map(d => d.garmin?.sleep_hours ?? d.schedule?.hours_sleep ?? null);

  el.innerHTML = `
    <div class="stat-label">Сон</div>
    <div class="stat-value" id="value-sleep">${latest != null ? '0' : '—'}<span class="stat-unit">${latest != null ? 'ч' : ''}</span></div>
    <div class="stat-sub">ср. ${avg?.toFixed(1) ?? '—'}ч${wakeTime ? ` · ↑ ${wakeTime}` : ''}</div>
    <div class="sleep-bars" id="sleepBars"></div>
  `;

  // Render mini bar chart
  requestAnimationFrame(() => {
    const barsEl = document.getElementById('sleepBars');
    if (!barsEl) return;

    const maxH = 12;
    const normMin = 7, normMax = 9;
    const barWidth = 100 / 7;

    let html = `<div class="sleep-bars-container">`;
    // Norm zone
    const normBottom = (normMin / maxH) * 100;
    const normHeight = ((normMax - normMin) / maxH) * 100;
    html += `<div class="sleep-norm-zone" style="bottom:${normBottom}%;height:${normHeight}%"></div>`;

    last7.forEach((val, i) => {
      const h = val != null ? (val / maxH) * 100 : 0;
      const isToday = i === last7.length - 1;
      const color = val == null ? 'transparent' :
        val < normMin ? 'var(--orange)' :
        val > normMax ? 'var(--blue)' :
        'var(--aqua)';
      html += `<div class="sleep-bar" style="height:${h}%;width:${barWidth}%;background:${color};opacity:${isToday ? '1' : '0.65'}"></div>`;
    });
    html += `</div>`;
    barsEl.innerHTML = html;
  });
}

function renderCommitsCard(el, days30, days7, allDays) {
  // Weekly total
  const weekValues = days7.map(d => d.git?.commits ?? 0);
  const weekTotal = weekValues.reduce((a, b) => a + b, 0);

  // Today
  const today = days7[days7.length - 1];
  const todayCommits = today?.git?.commits ?? 0;

  // Repo names from last 7 days
  const repos = new Set();
  days7.forEach(d => {
    (d.git?.repos || []).forEach(r => repos.add(r));
  });
  const repoList = [...repos].slice(0, 3);

  // Last 28 days contribution dots (4 weeks × 7 days)
  const last28 = allDays.slice(-28);

  el.innerHTML = `
    <div class="stat-label">Коммиты</div>
    <div class="stat-value" id="value-commits">${weekTotal > 0 ? '0' : '—'}</div>
    <div class="stat-sub">сегодня ${todayCommits}${repoList.length ? ' · ' + repoList.join(', ') : ''}</div>
    <div class="commit-dots" id="commitDots"></div>
  `;

  // Render contribution dots
  requestAnimationFrame(() => {
    const dotsEl = document.getElementById('commitDots');
    if (!dotsEl) return;

    let html = '<div class="commit-dots-grid">';
    last28.forEach(d => {
      const c = d.git?.commits ?? 0;
      const level = c === 0 ? 0 : c <= 2 ? 1 : c <= 5 ? 2 : c <= 10 ? 3 : 4;
      html += `<div class="commit-dot commit-dot-${level}" title="${d.date}: ${c}"></div>`;
    });
    html += '</div>';
    dotsEl.innerHTML = html;
  });

  // Animate weekly total
  if (weekTotal > 0) {
    const delay = 150 + 4 * 60 + 300;
    setTimeout(() => {
      const valueEl = document.getElementById('value-commits');
      if (valueEl) animateValue(valueEl, weekTotal, '', 0);
    }, delay);
  }

  return weekTotal; // Return so we skip default animation
}

// ---- Main render ----

export function renderStatCards(container, data) {
  const days30 = getDays(data, 30);
  const days7 = getDays(data, 7);
  const allDays = getDays(data);
  container.innerHTML = '';

  const oldDetail = document.getElementById('statDetail');
  if (oldDetail) oldDetail.remove();

  CARDS.forEach((card, index) => {
    const values = days30.map(d => card.get(d)).filter(v => v != null);
    const latest = values.length ? values[values.length - 1] : null;
    const avg = values.length ? (values.reduce((a, b) => a + b, 0) / values.length) : null;

    const el = document.createElement('div');
    el.className = 'stat-card';
    el.dataset.metric = card.id;
    el.style.setProperty('--i', index);

    let skipDefaultAnimation = false;

    // Custom renderers
    if (card.id === 'sleep') {
      renderSleepCard(el, days30, days7, latest, avg);
    } else if (card.id === 'commits') {
      renderCommitsCard(el, days30, days7, allDays);
      skipDefaultAnimation = true;
    } else {
      // Default renderer
      let delta = null;
      if (values.length >= 2) {
        delta = values[values.length - 1] - values[values.length - 2];
      }
      const sub = latest != null ? `ср. ${avg?.toFixed(1)}${card.unit}` : 'Нет данных';
      const deltaHtml = delta != null
        ? ` <span class="${delta >= 0 ? 'stat-delta-up' : 'stat-delta-down'}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(1)}</span>`
        : '';

      el.innerHTML = `
        <div class="stat-label">${card.label}</div>
        <div class="stat-value" id="value-${card.id}">${latest != null ? '0' : '—'}<span class="stat-unit">${latest != null ? card.unit : ''}</span></div>
        <div class="stat-sub">${sub}${deltaHtml}</div>
        <div class="stat-sparkline"><canvas id="spark-${card.id}"></canvas></div>
      `;

      if (values.length >= 2) {
        requestAnimationFrame(() => drawSparkline(`spark-${card.id}`, values, card.color));
      }
    }

    el.addEventListener('click', () => toggleDetail(card, data, container));
    container.appendChild(el);

    // Animate value counter
    if (latest != null && !skipDefaultAnimation) {
      const delay = 150 + index * 60 + 300;
      setTimeout(() => {
        const valueEl = document.getElementById(`value-${card.id}`);
        if (valueEl) {
          if (card.id === 'steps') {
            animateSteps(valueEl, latest, card.unit);
          } else {
            animateValue(valueEl, latest, card.unit, card.decimals);
          }
        }
      }, delay);
    }
  });
}

function drawSparkline(canvasId, values, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: values.map((_, i) => i),
      datasets: [{
        data: values,
        borderColor: color,
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.4,
        fill: { target: 'origin', above: color + '10' },
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } },
      animation: { duration: 800, easing: 'easeOutCubic' },
    },
  });
}

function toggleDetail(card, data, statContainer) {
  // If clicking same card again, just close
  if (expandedCard === card.id) {
    closeStatModal();
    return;
  }

  expandedCard = card.id;
  statContainer.querySelectorAll('.stat-card').forEach(c => c.classList.remove('stat-card-active'));
  statContainer.querySelector(`[data-metric="${card.id}"]`)?.classList.add('stat-card-active');

  // Get or create modal
  let overlay = document.getElementById('statDetailOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'statDetailOverlay';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-content stat-detail-modal">
        <div class="modal-header">
          <h2 class="modal-title" id="statDetailTitle"></h2>
          <button class="modal-close" id="statDetailClose">&times;</button>
        </div>
        <div class="stat-detail-chart-wrap">
          <canvas id="detailCanvas"></canvas>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('statDetailClose').addEventListener('click', closeStatModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeStatModal();
    });
  }

  // Set title
  document.getElementById('statDetailTitle').textContent = card.label;
  overlay.classList.add('open');

  // Render chart
  if (detailChart) { detailChart.destroy(); detailChart = null; }

  const allDays = getDays(data);
  const labels = allDays.map(d => d.date);

  // Need to wait a frame for the canvas to be visible
  requestAnimationFrame(() => {
    const ctx = document.getElementById('detailCanvas')?.getContext('2d');
    if (!ctx) return;

    if (card.id === 'sleep') {
      renderSleepDetail(ctx, labels, allDays);
    } else {
      renderDefaultDetail(ctx, labels, allDays, card);
    }
  });
}

function closeStatModal() {
  const overlay = document.getElementById('statDetailOverlay');
  if (overlay) overlay.classList.remove('open');
  if (detailChart) { detailChart.destroy(); detailChart = null; }
  document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('stat-card-active'));
  expandedCard = null;
}

function renderSleepDetail(ctx, labels, allDays) {
  const deepData = allDays.map(d => d.garmin?.sleep_phases?.deep_h || 0);
  const lightData = allDays.map(d => d.garmin?.sleep_phases?.light_h || 0);
  const remData = allDays.map(d => d.garmin?.sleep_phases?.rem_h || 0);
  const awakeData = allDays.map(d => d.garmin?.sleep_phases?.awake_h || 0);
  const scoreData = allDays.map(d => d.garmin?.sleep_score || null);

  detailChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Оценка (Score)', data: scoreData, type: 'line', borderColor: '#dbbc7f', tension: 0.3, yAxisID: 'yScore', borderWidth: 2, pointRadius: 3, pointBackgroundColor: '#dbbc7f' },
        { label: 'Глубокий', data: deepData, backgroundColor: '#475258', borderRadius: 0 },
        { label: 'Легкий', data: lightData, backgroundColor: '#83c092', borderRadius: 0 },
        { label: 'REM', data: remData, backgroundColor: '#7fbbb3', borderRadius: 0 },
        { label: 'Бодрств.', data: awakeData, backgroundColor: '#e67e80', borderRadius: 0 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, position: 'top', align: 'end', labels: { color: '#9da9a0', boxWidth: 8, font: { size: 10 } } },
        tooltip: {
          backgroundColor: 'rgba(35, 42, 46, 0.95)',
          titleColor: '#d3c6aa',
          bodyColor: '#9da9a0',
          borderColor: 'rgba(125, 135, 125, 0.15)',
          borderWidth: 1, padding: 10, cornerRadius: 10
        }
      },
      scales: {
        x: {
          stacked: true,
          ticks: { color: '#6b7b72', font: { size: 10 }, maxTicksLimit: 12 },
          grid: { display: false },
          border: { display: false }
        },
        y: {
          stacked: true,
          position: 'left',
          ticks: { color: '#6b7b72', font: { size: 10 } },
          grid: { color: 'rgba(125,135,125,0.06)' },
          border: { display: false }
        },
        yScore: {
          position: 'right',
          min: 0, max: 100,
          ticks: { color: '#dbbc7f', font: { size: 9 }, stepSize: 20 },
          grid: { display: false },
          border: { display: false }
        }
      },
      animation: { duration: 600, easing: 'easeOutCubic' },
    }
  });
}

function renderDefaultDetail(ctx, labels, allDays, card) {
  const values = allDays.map(d => card.get(d));
  
  detailChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: card.label,
        data: values,
        borderColor: card.color,
        backgroundColor: card.color + '18',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: card.color,
        tension: 0.35,
        fill: true,
        spanGaps: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(35, 42, 46, 0.95)',
          titleColor: '#d3c6aa',
          bodyColor: '#9da9a0',
          borderColor: 'rgba(125, 135, 125, 0.15)',
          borderWidth: 1, cornerRadius: 10, padding: 10, displayColors: false,
        },
      },
      scales: {
        x: {
          ticks: { color: '#6b7b72', font: { size: 10 }, maxRotation: 0, maxTicksLimit: 12 },
          grid: { color: 'rgba(125,135,125,0.06)' },
          border: { display: false },
        },
        y: {
          ticks: { color: '#6b7b72', font: { size: 10 } },
          grid: { color: 'rgba(125,135,125,0.06)' },
          border: { display: false },
        },
      },
      animation: { duration: 600, easing: 'easeOutCubic' },
    },
  });
}
