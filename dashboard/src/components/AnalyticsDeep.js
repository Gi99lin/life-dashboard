import { Chart, registerables } from 'chart.js';
import { getDays } from '../utils/dataLoader.js';
import { PAL, TOOLTIP, rgba } from '../utils/palette.js';
import { heatmapMatrix } from './microcharts.js';
import { renderHealthCharts } from './HealthCharts.js';

Chart.register(...registerables);

const TABS = [
  { key: 'body', label: 'Тело' },
  { key: 'mind', label: 'Разум' },
  { key: 'work', label: 'Работа' },
  { key: 'corr', label: 'Корреляции' },
];

const METRICS = {
  'Сон': (day) => day.garmin?.sleep_hours ?? day.schedule?.hours_sleep,
  'Наст': (day) => day.manual?.mood,
  'Стр': (day) => day.garmin?.stress_avg,
  'Код': (day) => day.wakatime?.total_h ?? day.schedule?.hours_work,
  'Шаг': (day) => day.garmin?.steps,
  'BB': (day) => day.garmin?.body_battery_max,
};

const stateByContainer = new WeakMap();
const charts = new Map();

export function buildAnalyticsDeepModel(data, count = 30, pair = { i: 0, j: 1 }) {
  const days = getDays(data, count);
  const labels = days.map(formatLabel);
  const correlations = data.meta?.correlations || { labels: [], matrix: [], strongest: [] };
  const languageSet = [];

  for (const day of days) {
    for (const lang of Object.keys(day.wakatime?.by_language || {})) {
      if (!languageSet.includes(lang)) languageSet.push(lang);
    }
  }

  return {
    days,
    labels,
    body: {
      sleepHours: days.map((day) => day.garmin?.sleep_hours ?? null),
      stages: days.map((day) => ({
        deep: day.garmin?.sleep_phases?.deep_h ?? null,
        light: day.garmin?.sleep_phases?.light_h ?? null,
        rem: day.garmin?.sleep_phases?.rem_h ?? null,
        awake: day.garmin?.sleep_phases?.awake_h ?? null,
      })),
    },
    mind: {
      mood: days.map((day) => day.manual?.mood ?? null),
      stress: days.map((day) => day.garmin?.stress_avg ?? null),
      focus: days.map((day) => day.wakatime?.focus_h ?? null),
    },
    work: {
      languages: languageSet,
      languageSeries: Object.fromEntries(languageSet.map((lang) => [
        lang,
        days.map((day) => day.wakatime?.by_language?.[lang] ?? 0),
      ])),
      codeHours: days.map((day) => day.wakatime?.total_h ?? null),
      commits: days.map((day) => day.git?.commits ?? null),
      prs: days.map((day) => day.github?.prs_merged ?? null),
      reviews: days.map((day) => day.github?.reviews ?? null),
    },
    correlations,
    scatter: buildScatter(days, correlations, pair),
  };
}

export function renderAnalyticsDeep(container, data) {
  if (!container) return;

  const model = buildAnalyticsDeepModel(data);
  container.className = 'analytics-deep';
  container.innerHTML = `
    <div class="analytics-head">
      <div>
        <div class="lbl">Drill-down · 30 дней</div>
        <h2>Аналитика</h2>
      </div>
      <div class="sub-tabs analytics-subtabs">
        ${TABS.map((tab, index) => `<button class="sub-tab ${index === 0 ? 'active' : ''}" type="button" data-analytics-tab="${tab.key}">${tab.label}</button>`).join('')}
      </div>
    </div>
    <section class="analytics-panel active" data-analytics-panel="body">
      <div class="analytics-grid two">
        <div class="analytics-card wide">
          <h3>Сон · стадии</h3>
          <div class="analytics-chart tall"><canvas id="analyticsBodyStages"></canvas></div>
        </div>
        <div class="analytics-card">
          <h3>Стресс · Body Battery</h3>
          <div class="analytics-chart"><canvas id="stressChart"></canvas></div>
        </div>
        <div class="analytics-card">
          <h3>Пульс</h3>
          <div class="analytics-chart"><canvas id="hrChart"></canvas></div>
        </div>
        <div class="analytics-card">
          <h3>SpO₂</h3>
          <div class="analytics-chart"><canvas id="spo2Chart"></canvas></div>
        </div>
        <div class="analytics-card">
          <h3>Калории</h3>
          <div class="analytics-chart"><canvas id="caloriesChart"></canvas></div>
        </div>
      </div>
    </section>
    <section class="analytics-panel" data-analytics-panel="mind">
      <div class="analytics-grid">
        <div class="analytics-card wide">
          <h3>Настроение · стресс · фокус</h3>
          <div class="analytics-chart tall"><canvas id="analyticsMindChart"></canvas></div>
        </div>
        ${summaryCard('Разум', [
          ['Настроение ср', avg(model.mind.mood)],
          ['Стресс ср', avg(model.mind.stress)],
          ['Фокус ср', `${avg(model.mind.focus)}ч`],
        ])}
      </div>
    </section>
    <section class="analytics-panel" data-analytics-panel="work">
      <div class="analytics-grid">
        <div class="analytics-card wide">
          <h3>Код · языки</h3>
          <div class="analytics-chart tall"><canvas id="analyticsWorkChart"></canvas></div>
        </div>
        <div class="analytics-card">
          <h3>GitHub</h3>
          <div class="analytics-chart"><canvas id="analyticsGithubChart"></canvas></div>
        </div>
      </div>
    </section>
    <section class="analytics-panel" data-analytics-panel="corr">
      <div class="analytics-grid corr">
        <div class="analytics-card">
          <h3>Матрица корреляций</h3>
          <div class="analytics-heatmap">${heatmapMatrix(model.correlations)}</div>
        </div>
        <div class="analytics-card wide">
          <h3 id="analyticsScatterTitle">Скаттер · ${model.scatter.xLabel} ↔ ${model.scatter.yLabel}</h3>
          <div class="analytics-chart tall"><canvas id="analyticsScatter"></canvas></div>
        </div>
      </div>
    </section>`;

  stateByContainer.set(container, { data, model, rendered: new Set() });
  container.addEventListener?.('click', (event) => {
    const button = event.target.closest?.('[data-analytics-tab]');
    if (button) activateAnalyticsDeep(container, button.dataset.analyticsTab);
  });
  activateAnalyticsDeep(container, 'body');
}

export function activateAnalyticsDeep(container, tab = 'body', params = {}) {
  const state = stateByContainer.get(container);
  if (!state) return;

  container.querySelectorAll?.('[data-analytics-tab]').forEach((button) => {
    button.classList.toggle('active', button.dataset.analyticsTab === tab);
  });
  container.querySelectorAll?.('[data-analytics-panel]').forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.analyticsPanel === tab);
  });

  if (tab === 'corr' && params.i != null && params.j != null) {
    state.model = buildAnalyticsDeepModel(state.data, 30, { i: params.i, j: params.j });
    const title = container.querySelector?.('#analyticsScatterTitle');
    if (title) title.textContent = `Скаттер · ${state.model.scatter.xLabel} ↔ ${state.model.scatter.yLabel}`;
    state.rendered.delete('corr');
  }

  renderTabCharts(container, state, tab);
}

function renderTabCharts(container, state, tab) {
  if (state.rendered.has(tab)) return;
  if (tab === 'body') {
    renderStageChart(container, state.model);
    if (typeof document !== 'undefined') renderHealthCharts(state.data);
  }
  if (tab === 'mind') renderMindChart(container, state.model);
  if (tab === 'work') {
    renderWorkChart(container, state.model);
    renderGithubChart(container, state.model);
  }
  if (tab === 'corr') renderScatterChart(container, state.model);
  state.rendered.add(tab);
}

function renderStageChart(container, model) {
  const canvas = container.querySelector?.('#analyticsBodyStages');
  if (!canvas?.getContext) return;
  replaceChart('analyticsBodyStages', canvas, {
    type: 'bar',
    data: {
      labels: model.labels,
      datasets: [
        stackedBar('Глубокий', model.body.stages.map((s) => s.deep), PAL.aqua),
        stackedBar('Лёгкий', model.body.stages.map((s) => s.light), PAL.green),
        stackedBar('REM', model.body.stages.map((s) => s.rem), PAL.blue),
        stackedBar('Бодр.', model.body.stages.map((s) => s.awake), PAL.red),
      ],
    },
    options: stackedOptions('часы'),
  });
}

function renderMindChart(container, model) {
  const canvas = container.querySelector?.('#analyticsMindChart');
  if (!canvas?.getContext) return;
  replaceChart('analyticsMindChart', canvas, {
    type: 'line',
    data: {
      labels: model.labels,
      datasets: [
        lineDataset('Настроение', model.mind.mood, PAL.yellow, 'yMood', 2.2),
        lineDataset('Стресс', model.mind.stress, PAL.red, 'yMetric', 1.6, [4, 4]),
        lineDataset('Фокус', model.mind.focus, PAL.green, 'yFocus', 1.6),
      ],
    },
    options: lineOptions({
      yMood: { min: 1, max: 5, position: 'left' },
      yMetric: { min: 0, max: 100, position: 'right' },
      yFocus: { display: false, min: 0, max: 10 },
    }),
  });
}

function renderWorkChart(container, model) {
  const canvas = container.querySelector?.('#analyticsWorkChart');
  if (!canvas?.getContext) return;
  const colors = [PAL.blue, PAL.yellow, PAL.aqua, PAL.orange, PAL.purple];
  replaceChart('analyticsWorkChart', canvas, {
    type: 'bar',
    data: {
      labels: model.labels,
      datasets: model.work.languages.map((lang, index) => stackedBar(
        lang,
        model.work.languageSeries[lang],
        colors[index % colors.length],
      )),
    },
    options: stackedOptions('часы кода'),
  });
}

function renderGithubChart(container, model) {
  const canvas = container.querySelector?.('#analyticsGithubChart');
  if (!canvas?.getContext) return;
  replaceChart('analyticsGithubChart', canvas, {
    type: 'line',
    data: {
      labels: model.labels,
      datasets: [
        lineDataset('Коммиты', model.work.commits, PAL.green, 'y', 1.8),
        lineDataset('PR', model.work.prs, PAL.blue, 'y', 1.6),
        lineDataset('Review', model.work.reviews, PAL.purple, 'y', 1.6),
      ],
    },
    options: lineOptions({ y: { min: 0, position: 'left' } }),
  });
}

function renderScatterChart(container, model) {
  const canvas = container.querySelector?.('#analyticsScatter');
  if (!canvas?.getContext) return;
  replaceChart('analyticsScatter', canvas, {
    type: 'scatter',
    data: {
      datasets: [{
        label: `${model.scatter.xLabel} ↔ ${model.scatter.yLabel}`,
        data: model.scatter.points,
        borderColor: PAL.green,
        backgroundColor: rgba(PAL.green, 0.55),
        pointRadius: 4,
        pointHoverRadius: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: legendLabels() }, tooltip: TOOLTIP },
      scales: chartScales({ x: { position: 'bottom' }, y: { position: 'left' } }),
    },
  });
}

function buildScatter(days, correlations, pair) {
  const labels = correlations.labels || [];
  const xLabel = labels[pair.i] || labels[0] || 'X';
  const yLabel = labels[pair.j] || labels[1] || 'Y';
  const xOf = METRICS[xLabel] || (() => null);
  const yOf = METRICS[yLabel] || (() => null);
  return {
    xLabel,
    yLabel,
    points: days.map((day) => ({ x: xOf(day), y: yOf(day), date: day.date }))
      .filter((point) => point.x != null && point.y != null),
  };
}

function replaceChart(key, canvas, config) {
  if (charts.has(key)) charts.get(key).destroy();
  charts.set(key, new Chart(canvas, config));
}

function formatLabel(day) {
  const dt = new Date(day.date);
  return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

function avg(values) {
  const nums = values.filter((value) => value != null);
  if (!nums.length) return '—';
  return +(nums.reduce((sum, value) => sum + value, 0) / nums.length).toFixed(1);
}

function summaryCard(title, rows) {
  return `<div class="analytics-card summary"><h3>${title} · сводка</h3>` +
    rows.map(([label, value]) => `<div class="analytics-kv"><span>${label}</span><b>${value}</b></div>`).join('') +
    `</div>`;
}

function stackedBar(label, data, color) {
  return { label, data, backgroundColor: rgba(color, 0.85), borderRadius: 3, stack: 'stack' };
}

function lineDataset(label, data, color, yAxisID, width, dash = []) {
  return {
    label,
    data,
    yAxisID,
    borderColor: color,
    backgroundColor: rgba(color, 0.16),
    borderWidth: width,
    borderDash: dash,
    pointRadius: 1,
    pointHoverRadius: 4,
    spanGaps: true,
    tension: 0.32,
  };
}

function stackedOptions(title) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: legendLabels() }, tooltip: TOOLTIP },
    scales: chartScales({ x: { stacked: true }, y: { stacked: true, title: { display: true, text: title, color: PAL.fgMuted } } }),
  };
}

function lineOptions(axes) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { labels: legendLabels() }, tooltip: TOOLTIP },
    scales: chartScales(axes),
  };
}

function chartScales(extra = {}) {
  const scales = {};
  for (const [axis, options] of Object.entries(extra)) {
    scales[axis] = {
      ticks: { color: PAL.fgMuted, maxTicksLimit: axis === 'x' ? 8 : undefined },
      grid: { color: axis === 'x' ? PAL.grid : 'rgba(255,255,255,0.05)' },
      border: { display: false },
      ...options,
    };
  }
  return scales;
}

function legendLabels() {
  return {
    color: PAL.fgMuted,
    boxHeight: 3,
    boxWidth: 12,
    font: { family: "'JetBrains Mono', ui-monospace, monospace", size: 10 },
  };
}
