import { Chart, registerables } from 'chart.js';
import { getDays } from '../utils/dataLoader.js';
import { PAL, TOOLTIP, rgba } from '../utils/palette.js';

Chart.register(...registerables);

let chart = null;

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

export function renderOverviewTrends(container, data) {
  if (!container) return;

  container.innerHTML = `
    <h3>Тренды · 30д <span class="more">наведи — день · клик — развернуть</span></h3>
    <div class="overview-trends-shell"><canvas id="overviewTrends"></canvas></div>`;

  const canvas = container.querySelector('#overviewTrends');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const series = buildOverviewTrendSeries(data, 30);
  const gradient = (color) => {
    const g = ctx.createLinearGradient(0, 0, 0, 160);
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
        yEnergy: {
          display: false,
          min: 0,
          max: 100,
        },
        x: {
          ticks: { color: PAL.fgMuted, maxRotation: 0, maxTicksLimit: 8 },
          grid: { color: PAL.grid },
          border: { display: false },
        },
      },
      animation: { duration: 700, easing: 'easeOutCubic' },
    },
    plugins: [todayLinePlugin],
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
