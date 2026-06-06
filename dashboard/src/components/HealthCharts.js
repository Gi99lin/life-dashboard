import { Chart } from 'chart.js';
import { getDays } from '../utils/dataLoader.js';
import { PAL } from '../utils/palette.js';
import { lineSeries, barSeries, lineOptions, barOptions } from '../utils/charts.js';

let stressChartInst = null;
let hrChartInst = null;
let spo2ChartInst = null;
let caloriesChartInst = null;

export function renderHealthCharts(data) {
  const allDays = getDays(data, 30);
  const labels = allDays.map((d) => {
    const dt = new Date(d.date);
    return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}`;
  });

  renderStressChart(labels, allDays);
  renderHRChart(labels, allDays);
  renderSpO2Chart(labels, allDays);
  renderCaloriesChart(labels, allDays);
}

function renderStressChart(labels, allDays) {
  const ctx = document.getElementById('stressChart')?.getContext('2d');
  if (!ctx) return;
  if (stressChartInst) stressChartInst.destroy();

  stressChartInst = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        lineSeries('Body Battery макс.', allDays.map((d) => d.garmin?.body_battery_max ?? null), PAL.green, { fill: '+1' }),
        lineSeries('Body Battery мин.', allDays.map((d) => d.garmin?.body_battery_min ?? null), PAL.aqua),
        lineSeries('Стресс', allDays.map((d) => d.garmin?.stress_avg ?? null), PAL.red, { dash: [5, 4], yAxisID: 'y1' }),
      ],
    },
    options: lineOptions({
      scales: {
        x: { ticks: { maxTicksLimit: 10 }, grid: { display: false } },
        y: { min: 0, max: 100, title: { display: true, text: 'Body Battery', color: PAL.fgMuted } },
        y1: { position: 'right', min: 0, max: 100, grid: { display: false }, title: { display: true, text: 'Стресс', color: PAL.red } },
      },
    }),
  });
}

function renderHRChart(labels, allDays) {
  const ctx = document.getElementById('hrChart')?.getContext('2d');
  if (!ctx) return;
  if (hrChartInst) hrChartInst.destroy();

  hrChartInst = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        lineSeries('Max HR', allDays.map((d) => d.garmin?.max_hr ?? null), PAL.red, { fill: 2, width: 1.2 }),
        lineSeries('Resting HR', allDays.map((d) => d.garmin?.resting_hr ?? null), PAL.fg, { width: 2 }),
        lineSeries('Min HR', allDays.map((d) => d.garmin?.min_hr ?? null), PAL.blue, { width: 1.2 }),
      ],
    },
    options: lineOptions({
      scales: {
        x: { ticks: { maxTicksLimit: 10 }, grid: { display: false } },
        y: { min: 30 },
      },
    }),
  });
}

function renderSpO2Chart(labels, allDays) {
  const ctx = document.getElementById('spo2Chart')?.getContext('2d');
  if (!ctx) return;
  if (spo2ChartInst) spo2ChartInst.destroy();

  spo2ChartInst = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        lineSeries('SpO₂ ср.', allDays.map((d) => d.garmin?.spo2_avg ?? null), PAL.blue, { fill: true }),
        lineSeries('SpO₂ мин.', allDays.map((d) => d.garmin?.spo2_low ?? null), PAL.orange),
      ],
    },
    options: lineOptions({
      scales: {
        x: { ticks: { maxTicksLimit: 10 }, grid: { display: false } },
        y: { min: 80, max: 100 },
      },
    }),
  });
}

function renderCaloriesChart(labels, allDays) {
  const ctx = document.getElementById('caloriesChart')?.getContext('2d');
  if (!ctx) return;
  if (caloriesChartInst) caloriesChartInst.destroy();

  caloriesChartInst = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        barSeries('Активные ккал', allDays.map((d) => d.garmin?.calories_active ?? null), PAL.orange, { stack: 'kcal' }),
        barSeries('Базовые (BMR)', allDays.map((d) => {
          if (!d.garmin?.calories_total || !d.garmin?.calories_active) return null;
          return d.garmin.calories_total - d.garmin.calories_active;
        }), PAL.fgMuted, { stack: 'kcal', radius: 0 }),
      ],
    },
    options: barOptions({
      scales: {
        x: { stacked: true, ticks: { maxTicksLimit: 10 }, grid: { display: false } },
        y: { stacked: true },
      },
    }),
  });
}
