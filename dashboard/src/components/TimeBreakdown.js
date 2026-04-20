/**
 * TimeBreakdown.js — Weekly stacked bar chart.
 */

import { Chart, registerables } from 'chart.js';
import { getDays } from '../utils/dataLoader.js';

Chart.register(...registerables);

let chart = null;

export function renderTimeBreakdown(canvas, data) {
  const days = getDays(data, 7);

  const labels = days.map(d => d.weekday || d.date.slice(5));
  const cats = ['hours_work', 'hours_projects', 'hours_games', 'hours_rest', 'hours_food'];
  const names = ['Работа', 'Проекты', 'Игры', 'Отдых', 'Еда'];
  const colors = ['#7fbbb3', '#a7c080', '#e69875', '#d699b6', '#dbbc7f'];

  if (chart) chart.destroy();

  chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: cats.map((cat, i) => ({
        label: names[i],
        data: days.map(d => d.schedule?.[cat] ?? 0),
        backgroundColor: colors[i] + 'cc',
        borderColor: colors[i],
        borderWidth: 1,
        borderRadius: 3,
        borderSkipped: false,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            color: '#6b7b72',
            font: { size: 10, weight: '500' },
            boxWidth: 10,
            boxHeight: 10,
            padding: 12,
            useBorderRadius: true,
            borderRadius: 2,
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
        },
      },
      scales: {
        x: {
          stacked: true,
          ticks: { color: '#6b7b72', font: { size: 10 } },
          grid: { display: false },
          border: { display: false },
        },
        y: {
          stacked: true,
          ticks: { color: '#6b7b72', font: { size: 10 } },
          grid: { color: 'rgba(125,135,125,0.06)' },
          border: { display: false },
        },
      },
      animation: { duration: 700, easing: 'easeOutCubic' },
    },
  });

  renderSummary(data);
}

function renderSummary(data) {
  const summaryEl = document.getElementById('timeSummary');
  if (!summaryEl) return;

  // Use the same dataLoader to get last 35 days (7 current + 28 historical)
  const days = getDays(data, 35);
  if (days.length < 7) {
    summaryEl.innerHTML = '';
    return;
  }

  // Split into current week (last 7 days) and strict historical (previous 28 days)
  const currentWeek = days.slice(-7);
  const history = days.slice(0, -7);

  // Helper to sum a field across an array of day objects
  const sumField = (arr, field) => arr.reduce((acc, d) => acc + (d.schedule?.[field] ?? 0), 0);

  // We consider Work + Projects as productive
  const calcProductive = (arr) => sumField(arr, 'hours_work') + sumField(arr, 'hours_projects');
  
  const curProd = calcProductive(currentWeek);
  
  let histAvgProd = 0;
  if (history.length > 0) {
     const totalHistProd = calcProductive(history);
     histAvgProd = totalHistProd / (history.length / 7); // convert total historical to weekly average
  }

  const delta = curProd - histAvgProd;
  const deltaStr = delta >= 0 ? `+${delta.toFixed(1)}ч` : `${delta.toFixed(1)}ч`;
  const deltaClass = delta >= 0 ? 'positive' : 'negative';

  summaryEl.innerHTML = `
    <div class="ts-item">
      <div class="ts-label">Сумма (7дней)</div>
      <div class="ts-value">
        ${curProd.toFixed(1)}ч
        ${history.length >= 7 ? `<span class="ts-delta ${deltaClass}">${deltaStr}</span>` : ''}
      </div>
    </div>
  `;
}
