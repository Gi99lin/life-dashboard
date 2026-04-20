/**
 * TrendChart.js — Mood + Sleep + Body Battery overlay chart.
 * Sleep prioritizes Garmin data, falls back to schedule.
 */

import { Chart, registerables } from 'chart.js';
import { getDays } from '../utils/dataLoader.js';

Chart.register(...registerables);

let chart = null;

export function renderTrendChart(canvas, data, days = 30) {
  const d = getDays(data, days);
  const labels = d.map(x => {
    const dt = new Date(x.date);
    return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}`;
  });

  const mood = d.map(x => x.manual?.mood ?? null);
  // Garmin sleep first, schedule fallback
  const sleep = d.map(x => x.garmin?.sleep_hours ?? x.schedule?.hours_sleep ?? null);
  // Body Battery (Garmin only, 0-100 scale)
  const bb = d.map(x => x.garmin?.body_battery_max ?? null);

  if (chart) chart.destroy();

  chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Настроение',
          data: mood,
          yAxisID: 'yMood',
          borderColor: '#dbbc7f',
          backgroundColor: 'rgba(219,188,127,0.06)',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: '#dbbc7f',
          tension: 0.35,
          fill: true,
          spanGaps: true,
        },
        {
          label: 'Сон',
          data: sleep,
          yAxisID: 'ySleep',
          borderColor: '#83c092',
          backgroundColor: 'rgba(131,192,146,0.04)',
          borderWidth: 1.5,
          borderDash: [4, 3],
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: '#83c092',
          tension: 0.35,
          fill: true,
          spanGaps: true,
        },
        {
          label: 'Body Battery',
          data: bb,
          yAxisID: 'yBB',
          borderColor: '#a7c080',
          backgroundColor: 'rgba(167,192,128,0.04)',
          borderWidth: 1.5,
          borderDash: [2, 2],
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: '#a7c080',
          tension: 0.35,
          fill: false,
          spanGaps: true,
        },
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
            color: '#6b7b72',
            font: { size: 10, weight: '500' },
            boxWidth: 12,
            boxHeight: 2,
            padding: 16,
            usePointStyle: false,
          },
        },
        tooltip: {
          backgroundColor: 'rgba(35, 42, 46, 0.95)',
          titleColor: '#d3c6aa',
          bodyColor: '#9da9a0',
          borderColor: 'rgba(125, 135, 125, 0.15)',
          borderWidth: 1,
          cornerRadius: 10,
          padding: 10,
          titleFont: { size: 11, weight: '500' },
          bodyFont: { size: 11 },
          displayColors: true,
          boxWidth: 8,
          boxHeight: 8,
          boxPadding: 4,
        },
      },
      scales: {
        yMood: {
          position: 'left',
          min: 1, max: 5,
          ticks: { color: '#6b7b72', font: { size: 10 }, stepSize: 1 },
          grid: { color: 'rgba(125,135,125,0.06)' },
          border: { display: false },
        },
        ySleep: {
          position: 'right',
          min: 4, max: 12,
          ticks: { color: '#6b7b72', font: { size: 10 } },
          grid: { display: false },
          border: { display: false },
        },
        yBB: {
          display: false,
          min: 0, max: 100,
        },
        x: {
          ticks: { color: '#6b7b72', font: { size: 10 }, maxRotation: 0, maxTicksLimit: 10 },
          grid: { color: 'rgba(125,135,125,0.06)' },
          border: { display: false },
        },
      },
      animation: { duration: 700, easing: 'easeOutCubic' },
    },
  });
}
