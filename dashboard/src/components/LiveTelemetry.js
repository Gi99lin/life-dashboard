import { Chart, registerables } from 'chart.js';
import { gradientFill, lineOptions, lineSeries } from '../utils/charts.js';
import { PAL } from '../utils/palette.js';

Chart.register(...registerables);

let liveChart = null;
let currentAbort = null;

const WINDOWS = [
  [10, '10м'],
  [60, '1ч'],
  [360, '6ч'],
  [1440, '24ч'],
];

function values(series = []) {
  return series.map((point) => point?.value ?? point ?? null);
}

function labelsFrom(topology = {}) {
  const source = topology.telemetry?.cpu?.length
    ? topology.telemetry.cpu
    : topology.telemetry?.ram?.length
      ? topology.telemetry.ram
      : topology.telemetry?.net || [];
  return source.map((point, index) => {
    if (!point?.t) return String(index + 1);
    const date = new Date(point.t * 1000);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  });
}

function normalizeNet(raw) {
  const nums = raw.map((value) => Number(value) || 0);
  const max = Math.max(...nums, 1);
  return nums.map((value) => Math.round((value / max) * 100));
}

export function buildTelemetryModel(topology = {}) {
  const cpu = values(topology.telemetry?.cpu || []);
  const ram = values(topology.telemetry?.ram || []);
  const netRaw = values(topology.telemetry?.net || []);
  return {
    labels: labelsFrom(topology),
    cpu,
    ram,
    net: normalizeNet(netRaw),
  };
}

function draw(container, model) {
  const canvas = container.querySelector?.('canvas[data-live-chart]');
  const ctx = canvas?.getContext?.('2d');
  if (!ctx) return;
  if (liveChart) liveChart.destroy();

  liveChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: model.labels,
      datasets: [
        lineSeries('CPU', model.cpu, PAL.green, { fill: true, bg: gradientFill(ctx, PAL.green, 172, 0.16), width: 1.8 }),
        lineSeries('RAM', model.ram, PAL.yellow, { width: 1.6 }),
        lineSeries('Сеть', model.net, PAL.blue, { width: 1.4 }),
      ],
    },
    options: lineOptions({
      scales: {
        x: { ticks: { maxTicksLimit: 10 }, grid: { display: false } },
        y: { min: 0, max: 100, ticks: { callback: (value) => `${value}%` } },
      },
      animation: { duration: 400 },
    }),
  });
}

export function renderLiveTelemetry(container, topology = {}, minutes = 60) {
  if (!container) return;
  const model = buildTelemetryModel(topology);
  container.classList?.add('livewrap');
  container.innerHTML = `
    <div class="lh">
      <span class="lbl">Телеметрия хоста · ${WINDOWS.find(([value]) => value === minutes)?.[1] || `${minutes}м`}</span>
      <span class="periods infra-periods">
        ${WINDOWS.map(([value, label]) => `<button class="pbtn ${value === minutes ? 'active' : ''}" data-min="${value}" type="button">${label}</button>`).join('')}
      </span>
      <span class="leg"><i style="background:var(--green)"></i>CPU</span>
      <span class="leg"><i style="background:var(--yellow)"></i>RAM</span>
      <span class="leg"><i style="background:var(--blue)"></i>Сеть</span>
    </div>
    <div class="livechart"><canvas data-live-chart></canvas></div>`;

  container.querySelectorAll?.('.infra-periods .pbtn').forEach((button) => {
    button.addEventListener('click', async () => {
      const next = Number(button.dataset.min) || 60;
      if (currentAbort) currentAbort.abort();
      currentAbort = new AbortController();
      try {
        const res = await fetch(`/api/infra/topology?minutes=${next}`, { signal: currentAbort.signal });
        renderLiveTelemetry(container, await res.json(), next);
      } catch (err) {
        if (err.name !== 'AbortError') renderLiveTelemetry(container, topology, next);
      }
    });
  });

  draw(container, model);
}
