import { Chart } from 'chart.js';
import { getDays } from '../utils/dataLoader.js';

let stressChartInst = null;
let hrChartInst = null;
let spo2ChartInst = null;
let caloriesChartInst = null;

export function renderHealthCharts(data) {
  const allDays = getDays(data, 30); // Use 30 days window max
  const labels = allDays.map(d => {
    const dt = new Date(d.date);
    return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}`;
  });

  renderStressChart(labels, allDays);
  renderHRChart(labels, allDays);
  renderSpO2Chart(labels, allDays);
  renderCaloriesChart(labels, allDays);
}

function renderStressChart(labels, allDays) {
  const stressAvg = allDays.map(d => d.garmin?.stress_avg ?? null);
  const bbMax = allDays.map(d => d.garmin?.body_battery_max ?? null);
  const bbMin = allDays.map(d => d.garmin?.body_battery_min ?? null);

  const ctx = document.getElementById('stressChart')?.getContext('2d');
  if (!ctx) return;
  if (stressChartInst) stressChartInst.destroy();

  stressChartInst = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Body Battery Макс.', data: bbMax, borderColor: '#59be6c', backgroundColor: '#59be6c20', fill: '+1', tension: 0.3, pointRadius: 1 },
        { label: 'Body Battery Мин.', data: bbMin, borderColor: '#e99355', backgroundColor: 'transparent', fill: false, tension: 0.3, pointRadius: 1 },
        { label: 'Стресс', data: stressAvg, borderColor: '#e3645e', borderDash: [5, 5], tension: 0.3, pointRadius: 2, yAxisID: 'y1' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#a3acb3', boxWidth: 10 } },
        tooltip: {
          backgroundColor: 'rgba(11,18,25,0.96)', titleColor: '#eaeff3', bodyColor: '#a3acb3', padding: 10, cornerRadius: 8
        }
      },
      scales: {
        x: { ticks: { color: '#727c84', maxTicksLimit: 10 }, grid: { display: false } },
        y: { title: { display: true, text: 'Body Battery', color: '#727c84' }, ticks: { color: '#727c84' }, grid: { color: 'rgba(255,255,255,0.05)' }, min: 0, max: 100 },
        y1: { position: 'right', title: { display: true, text: 'Уровень стресса', color: '#e3645e' }, ticks: { color: '#e3645e' }, grid: { display: false }, min: 0, max: 100 }
      }
    }
  });
}

function renderHRChart(labels, allDays) {
  const restingHR = allDays.map(d => d.garmin?.resting_hr ?? null);
  const maxHR = allDays.map(d => d.garmin?.max_hr ?? null);
  const minHR = allDays.map(d => d.garmin?.min_hr ?? null);

  const ctx = document.getElementById('hrChart')?.getContext('2d');
  if (!ctx) return;
  if (hrChartInst) hrChartInst.destroy();

  hrChartInst = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Max HR', data: maxHR, borderColor: '#e3645e', backgroundColor: '#e3645e15', fill: 2, tension: 0.3, pointRadius: 0, borderWidth: 1 },
        { label: 'Resting HR', data: restingHR, borderColor: '#eaeff3', backgroundColor: '#eaeff3', tension: 0.3, pointRadius: 2, borderWidth: 2 },
        { label: 'Min HR', data: minHR, borderColor: '#69aed5', backgroundColor: 'transparent', fill: false, tension: 0.3, pointRadius: 0, borderWidth: 1 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#a3acb3', boxWidth: 10 } },
        tooltip: {
          backgroundColor: 'rgba(11,18,25,0.96)', titleColor: '#eaeff3', bodyColor: '#a3acb3', padding: 10, cornerRadius: 8
        }
      },
      scales: {
        x: { ticks: { color: '#727c84', maxTicksLimit: 10 }, grid: { display: false } },
        y: { ticks: { color: '#727c84' }, grid: { color: 'rgba(255,255,255,0.05)' }, min: 30 }
      }
    }
  });
}

function renderSpO2Chart(labels, allDays) {
  const spo2Avg = allDays.map(d => d.garmin?.spo2_avg ?? null);
  const spo2Low = allDays.map(d => d.garmin?.spo2_low ?? null);

  const ctx = document.getElementById('spo2Chart')?.getContext('2d');
  if (!ctx) return;
  if (spo2ChartInst) spo2ChartInst.destroy();

  spo2ChartInst = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'SpO2 Ср.', data: spo2Avg, borderColor: '#69aed5', backgroundColor: '#69aed520', fill: true, tension: 0.4, pointRadius: 2 },
        { label: 'SpO2 Мин.', data: spo2Low, borderColor: '#e99355', backgroundColor: 'transparent', fill: false, tension: 0.4, pointRadius: 2 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#a3acb3', boxWidth: 10 } }
      },
      scales: {
        x: { ticks: { color: '#727c84', maxTicksLimit: 10 }, grid: { display: false } },
        y: { ticks: { color: '#727c84' }, grid: { color: 'rgba(255,255,255,0.05)' }, min: 80, max: 100 }
      }
    }
  });
}

function renderCaloriesChart(labels, allDays) {
  const caloriesActive = allDays.map(d => d.garmin?.calories_active ?? null);
  const caloriesBase = allDays.map(d => {
    if (!d.garmin?.calories_total || !d.garmin?.calories_active) return null;
    return d.garmin.calories_total - d.garmin.calories_active;
  });

  const ctx = document.getElementById('caloriesChart')?.getContext('2d');
  if (!ctx) return;
  if (caloriesChartInst) caloriesChartInst.destroy();

  caloriesChartInst = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Активные ккал', data: caloriesActive, backgroundColor: '#e99355', borderRadius: 4 },
        { label: 'Базовые (BMR)', data: caloriesBase, backgroundColor: '#475258', borderRadius: 0 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#a3acb3', boxWidth: 10 } }
      },
      scales: {
        x: { stacked: true, ticks: { color: '#727c84', maxTicksLimit: 10 }, grid: { display: false } },
        y: { stacked: true, ticks: { color: '#727c84' }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });
}
