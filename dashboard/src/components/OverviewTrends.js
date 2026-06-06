import { Chart, registerables } from 'chart.js';
import { getDays } from '../utils/dataLoader.js';
import { PAL, TOOLTIP, rgba } from '../utils/palette.js';

Chart.register(...registerables);

let chart = null;
const CHART_H = 196;
const WINDOWS = [7, 30, 90];

// Per-series presentation config (shared by chips + datasets).
const SERIES = [
  { key: 'mood', label: 'Настроение', color: PAL.yellow, unit: '', decimals: 1 },
  { key: 'sleep', label: 'Сон', color: PAL.aqua, unit: 'ч', decimals: 1 },
  { key: 'energy', label: 'Энергия', color: PAL.green, unit: '', decimals: 0 },
];

const todayLinePlugin = {
  id: 'overviewTodayLine',
  afterDatasetsDraw(chartInstance) {
    const xScale = chartInstance.scales.x;
    const area = chartInstance.chartArea;
    if (!xScale || !area || !chartInstance.data.labels.length) return;

    const ctx = chartInstance.ctx;
    const x = xScale.getPixelForValue(chartInstance.data.labels.length - 1);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.16)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, area.top);
    ctx.lineTo(x, area.bottom);
    ctx.stroke();
    ctx.restore();
  },
};

export function buildOverviewTrendSeries(data, count = 30) {
  const days = getDays(data, count);
  return {
    labels: days.map((day) => {
      const dt = new Date(day.date);
      return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}`;
    }),
    mood: days.map((day) => day.manual?.mood ?? null),
    sleep: days.map((day) => day.garmin?.sleep_hours ?? day.schedule?.hours_sleep ?? null),
    energy: days.map((day) => day.readiness?.energy ?? day.garmin?.body_battery_max ?? null),
  };
}

export function hasTrendData(series) {
  return ['mood', 'sleep', 'energy'].some((key) => (
    (series[key] || []).some((value) => value != null)
  ));
}

/** Per-series {avg, delta, dir, n} over the window (first-half vs last-half drift). */
export function summarizeTrendSeries(series) {
  const stat = (arr) => {
    const v = (arr || []).filter((x) => x != null);
    if (!v.length) return null;
    const avg = v.reduce((a, b) => a + b, 0) / v.length;
    const half = Math.max(1, Math.floor(v.length / 2));
    const firstAvg = v.slice(0, half).reduce((a, b) => a + b, 0) / half;
    const lastAvg = v.slice(-half).reduce((a, b) => a + b, 0) / half;
    const delta = lastAvg - firstAvg;
    const threshold = Math.max(0.01, Math.abs(avg) * 0.02);
    const dir = Math.abs(delta) < threshold ? 'flat' : (delta > 0 ? 'up' : 'down');
    return { avg, delta, dir, n: v.length };
  };
  return { mood: stat(series.mood), sleep: stat(series.sleep), energy: stat(series.energy) };
}

const ARROW = { up: '▲', down: '▼', flat: '→' };

function statsRow(series) {
  const summary = summarizeTrendSeries(series);
  const chips = SERIES.map((s) => {
    const st = summary[s.key];
    if (!st) {
      return `<span class="tchip"><i style="background:${s.color}"></i>${s.label} <b>—</b></span>`;
    }
    const avg = st.avg.toFixed(s.decimals);
    return `<span class="tchip"><i style="background:${s.color}"></i>${s.label} `
      + `<b>${avg}${s.unit}</b><em class="d-${st.dir}">${ARROW[st.dir]}</em></span>`;
  }).join('');
  return `<div class="trend-stats">${chips}</div>`;
}

function rangeToggle(win) {
  return `<span class="trend-range">${WINDOWS.map((w) => (
    `<button type="button" data-win="${w}" class="${w === win ? 'active' : ''}">${w}д</button>`
  )).join('')}</span>`;
}

function drawChart(canvas, series) {
  const ctx = canvas.getContext('2d');
  const gh = canvas.clientHeight || CHART_H; // fill the actual (flex-grown) chart height
  const gradient = (color) => {
    const g = ctx.createLinearGradient(0, 0, 0, gh);
    g.addColorStop(0, rgba(color, 0.22));
    g.addColorStop(1, rgba(color, 0));
    return g;
  };

  if (chart) chart.destroy();
  chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: series.labels,
      datasets: [
        trendDataset('Настроение', series.mood, 'yMood', PAL.yellow, gradient(PAL.yellow), 2.2),
        trendDataset('Сон', series.sleep, 'ySleep', PAL.aqua, gradient(PAL.aqua), 1.6, [4, 3]),
        trendDataset('Энергия', series.energy, 'yEnergy', PAL.green, gradient(PAL.green), 1.6),
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            boxHeight: 2,
            boxWidth: 12,
            color: PAL.fgMuted,
            font: { family: "'JetBrains Mono', ui-monospace, monospace", size: 10, weight: '500' },
            padding: 14,
          },
        },
        tooltip: TOOLTIP,
      },
      scales: {
        yMood: {
          min: 1,
          max: 5,
          position: 'left',
          ticks: { color: PAL.fgMuted, stepSize: 1 },
          grid: { color: PAL.grid },
          border: { display: false },
        },
        ySleep: {
          min: 4,
          max: 12,
          position: 'right',
          ticks: { color: PAL.fgMuted },
          grid: { display: false },
          border: { display: false },
        },
        yEnergy: { display: false, min: 0, max: 100 },
        x: {
          ticks: { color: PAL.fgMuted, maxRotation: 0, maxTicksLimit: 8 },
          grid: { color: PAL.grid },
          border: { display: false },
        },
      },
      animation: { duration: 600, easing: 'easeOutCubic' },
    },
    plugins: [todayLinePlugin],
  });
}

export function renderOverviewTrends(container, data, win = 30) {
  if (!container) return;

  const series = buildOverviewTrendSeries(data, win);
  if (!hasTrendData(series)) {
    container.innerHTML = `
      <h3>Тренды ${rangeToggle(win)}<span class="more">наведи — день · клик — развернуть</span></h3>
      <div class="empty-state">
        <b>Нет данных за день</b>
        <span>Сбор начнётся ночью</span>
      </div>`;
    bindRange(container, data);
    return;
  }

  container.innerHTML = `
    <h3>Тренды ${rangeToggle(win)}<span class="more">наведи — день · клик — развернуть</span></h3>
    <div class="overview-trends-shell"><canvas id="overviewTrends"></canvas></div>
    ${statsRow(series)}`;

  const canvas = container.querySelector('#overviewTrends');
  if (canvas) drawChart(canvas, series);
  bindRange(container, data);
}

function bindRange(container, data) {
  const toggle = container.querySelector('.trend-range');
  if (!toggle || toggle.dataset.bound === 'true') return;
  toggle.dataset.bound = 'true';
  toggle.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-win]');
    if (!btn) return;
    renderOverviewTrends(container, data, +btn.dataset.win);
  });
}

function trendDataset(label, data, yAxisID, borderColor, backgroundColor, borderWidth, borderDash = []) {
  return {
    label,
    data,
    yAxisID,
    borderColor,
    backgroundColor,
    borderWidth,
    borderDash,
    fill: true,
    pointHoverBackgroundColor: borderColor,
    pointHoverRadius: 4,
    pointRadius: 0,
    spanGaps: true,
    tension: 0.35,
  };
}
