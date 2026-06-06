import { Chart, registerables } from 'chart.js';
import { getDays } from '../utils/dataLoader.js';
import { barOptions, barSeries, lineOptions, lineSeries } from '../utils/charts.js';
import { PAL, rgba } from '../utils/palette.js';
import { pearson } from './readinessDrivers.js';

Chart.register(...registerables);

export const METRICS = {
  'Сон': (day) => day.garmin?.sleep_hours ?? day.schedule?.hours_sleep ?? null,
  'Наст': (day) => day.manual?.mood ?? null,
  'Стр': (day) => day.garmin?.stress_avg ?? null,
  'Шаг': (day) => day.garmin?.steps ?? null,
  'Код': (day) => day.wakatime?.total_h ?? day.schedule?.hours_work ?? null,
  'BB': (day) => day.garmin?.body_battery_max ?? null,
  'Готов': (day) => day.readiness?.score ?? null,
};

const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const VIEWS = {
  correlation: 'корреляция',
  timeline: 'таймлайн',
  weekday: 'дни недели',
  distribution: 'распределение',
};
const DEFAULT_STATE = { view: 'correlation', x: 'Сон', y: 'Наст', annotations: [] };

let activeContainer = null;
let activeData = null;
let activeWindow = 30;
let currentState = { ...DEFAULT_STATE };
let setBy = 'AI';
let boardChart = null;

function avg(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function buildBoardModel(data, state, window = 30) {
  const days = getDays(data || { days: {} }, window);
  const current = { view: 'timeline', x: 'Сон', y: null, annotations: [], ...(state || {}) };
  const x = METRICS[current.x] || (() => null);
  const y = METRICS[current.y] || (() => null);

  if (current.view === 'correlation') {
    const points = days
      .map((day) => ({ x: x(day), y: y(day), date: day.date }))
      .filter((point) => point.x != null && point.y != null);
    return {
      view: 'correlation',
      xLabel: current.x,
      yLabel: current.y,
      points,
      r: pearson(points.map((point) => point.x), points.map((point) => point.y)) ?? 0,
      annotations: current.annotations || [],
    };
  }

  if (current.view === 'weekday') {
    const buckets = WD.map((wd) => {
      const values = days
        .filter((day) => day.weekday === wd)
        .map(x)
        .filter((value) => value != null);
      return { wd, avg: avg(values) };
    });
    return { view: 'weekday', xLabel: current.x, buckets, annotations: current.annotations || [] };
  }

  if (current.view === 'distribution') {
    const values = days.map(x).filter((value) => value != null);
    if (!values.length) return { view: 'distribution', xLabel: current.x, bins: [] };

    const min = Math.min(...values);
    const max = Math.max(...values);
    const count = 8;
    const width = (max - min) / count || 1;
    const bins = Array.from({ length: count }, (_, index) => ({ lo: min + index * width, count: 0 }));
    values.forEach((value) => {
      bins[Math.min(count - 1, Math.floor((value - min) / width))].count += 1;
    });
    return { view: 'distribution', xLabel: current.x, bins, annotations: current.annotations || [] };
  }

  return {
    view: 'timeline',
    xLabel: current.x,
    labels: days.map((day) => day.date?.slice(5) || ''),
    series: days.map(x),
    annotations: current.annotations || [],
  };
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function metricOptions(selected, includeEmpty = false) {
  const options = Object.keys(METRICS)
    .map((label) => `<option value="${esc(label)}" ${label === selected ? 'selected' : ''}>${esc(label)}</option>`);
  return includeEmpty ? [`<option value="" ${!selected ? 'selected' : ''}>—</option>`, ...options].join('') : options.join('');
}

function statChips(model) {
  if (model.view === 'correlation') {
    const slope = regression(model.points).slope;
    return [
      ['коэффициент r', `${model.r >= 0 ? '+' : ''}${model.r.toFixed(2)}`, 'g'],
      ['наклон', Number.isFinite(slope) ? `${slope >= 0 ? '+' : ''}${slope.toFixed(2)} /x` : '—', 'b'],
      ['точек (n)', model.points.length, ''],
    ];
  }
  if (model.view === 'weekday') {
    const values = model.buckets.map((bucket) => bucket.avg).filter((value) => value != null);
    return [
      ['среднее', fmt(avg(values)), 'g'],
      ['дней', values.length, ''],
      ['максимум', fmt(Math.max(...values)), 'b'],
    ];
  }
  if (model.view === 'distribution') {
    return [
      ['корзин', model.bins.length, ''],
      ['пик', model.bins.length ? Math.max(...model.bins.map((bin) => bin.count)) : 0, 'b'],
      ['метрика', model.xLabel, 'g'],
    ];
  }
  const values = model.series.filter((value) => value != null);
  return [
    ['среднее', fmt(avg(values)), 'g'],
    ['минимум', fmt(values.length ? Math.min(...values) : null), 'r'],
    ['максимум', fmt(values.length ? Math.max(...values) : null), 'b'],
  ];
}

function fmt(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return Math.abs(value) >= 100 ? Math.round(value) : Number(value).toFixed(1);
}

function regression(points) {
  if (!points?.length) return { slope: 0, intercept: 0 };
  const n = points.length;
  const mx = points.reduce((sum, point) => sum + point.x, 0) / n;
  const my = points.reduce((sum, point) => sum + point.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const point of points) {
    num += (point.x - mx) * (point.y - my);
    den += (point.x - mx) ** 2;
  }
  const slope = den ? num / den : 0;
  return { slope, intercept: my - slope * mx };
}

function trendPoints(points) {
  if (points.length < 2) return [];
  const xs = points.map((point) => point.x);
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  const { slope, intercept } = regression(points);
  return [
    { x: min, y: slope * min + intercept },
    { x: max, y: slope * max + intercept },
  ];
}

function drawChart(container, model) {
  const canvas = container.querySelector?.('canvas[data-board-chart]');
  const ctx = canvas?.getContext?.('2d');
  if (!ctx) return;
  if (boardChart) boardChart.destroy();

  if (model.view === 'correlation') {
    boardChart = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: `${model.xLabel} ↔ ${model.yLabel}`,
            data: model.points,
            borderColor: PAL.aqua,
            backgroundColor: rgba(PAL.aqua, 0.82),
            pointRadius: 4,
            pointHoverRadius: 6,
          },
          {
            type: 'line',
            label: 'тренд',
            data: trendPoints(model.points),
            borderColor: PAL.green,
            backgroundColor: 'transparent',
            borderDash: [5, 4],
            pointRadius: 0,
            tension: 0,
          },
        ],
      },
      options: lineOptions({
        scales: {
          x: { type: 'linear', title: { display: true, text: model.xLabel, color: PAL.fgMuted } },
          y: { type: 'linear', title: { display: true, text: model.yLabel, color: PAL.fgMuted } },
        },
      }),
    });
    return;
  }

  if (model.view === 'weekday') {
    boardChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: model.buckets.map((bucket) => bucket.wd),
        datasets: [barSeries(model.xLabel, model.buckets.map((bucket) => bucket.avg), PAL.blue)],
      },
      options: barOptions({ legend: { display: false } }),
    });
    return;
  }

  if (model.view === 'distribution') {
    boardChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: model.bins.map((bin) => fmt(bin.lo)),
        datasets: [barSeries(model.xLabel, model.bins.map((bin) => bin.count), PAL.purple)],
      },
      options: barOptions({ legend: { display: false } }),
    });
    return;
  }

  boardChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: model.labels,
      datasets: [lineSeries(model.xLabel, model.series, PAL.green, { fill: true, bg: rgba(PAL.green, 0.12) })],
    },
    options: lineOptions({ legend: { display: false } }),
  });
}

function annotationMarkup(annotations = []) {
  if (!annotations.length) return '';
  return annotations.slice(0, 2).map((annotation, index) => `
    <div class="callout" style="left:${36 + index * 18}%;top:${14 + index * 18}%">${esc(annotation.label || annotation.date || 'точка')}</div>
  `).join('');
}

export function renderEvidenceBoard(container, data, state = DEFAULT_STATE, window = 30) {
  if (!container) return;
  activeContainer = container;
  activeData = data || { days: {} };
  activeWindow = window;
  currentState = { ...DEFAULT_STATE, ...state };
  const model = buildBoardModel(activeData, currentState, activeWindow);
  const chips = statChips(model);

  container.innerHTML = `
    <div class="ph">Доска доказательств<span class="right">ведёт AI · можешь и ты</span></div>
    <div class="bctl">
      <span class="seg">
        ${Object.entries(VIEWS).map(([key, label]) => `
          <button type="button" data-view="${key}" class="${currentState.view === key ? 'active' : ''}">${label}</button>
        `).join('')}
      </span>
      <label class="pick">X <select data-axis="x">${metricOptions(currentState.x)}</select></label>
      <span class="x">↔</span>
      <label class="pick">Y <select data-axis="y">${metricOptions(currentState.y, true)}</select></label>
      <span class="setby">◇ задал ${esc(setBy)}</span>
    </div>
    <div class="viz">
      ${model.view === 'correlation' ? `<div class="rbadge">r = ${model.r >= 0 ? '+' : ''}${model.r.toFixed(2)}</div>` : ''}
      <canvas data-board-chart></canvas>
      ${annotationMarkup(model.annotations)}
    </div>
    <div class="bchips">
      ${chips.map(([label, value, color]) => `
        <div class="bchip"><span>${esc(label)}</span><b class="${color}">${esc(value)}</b></div>
      `).join('')}
    </div>`;

  container.querySelectorAll?.('[data-view]').forEach((button) => {
    button.addEventListener('click', () => {
      setBy = 'ты';
      renderEvidenceBoard(container, data, { ...currentState, view: button.dataset.view }, window);
    });
  });
  container.querySelectorAll?.('select[data-axis]').forEach((select) => {
    select.addEventListener('change', () => {
      setBy = 'ты';
      const axis = select.dataset.axis;
      renderEvidenceBoard(container, data, { ...currentState, [axis]: select.value || null }, window);
    });
  });

  drawChart(container, model);
}

export function setBoardState(state = {}) {
  currentState = { ...currentState, ...state };
  setBy = 'AI';
  if (activeContainer && activeData) {
    renderEvidenceBoard(activeContainer, activeData, currentState, activeWindow);
  }
}
