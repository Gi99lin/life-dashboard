import { heatmapMatrix } from './microcharts.js';

const HINTS = {
  'Сон|Наст': 'крепче спишь — лучше день',
  'Стр|BB': 'стресс садит body battery',
  'Код|Стр': 'длинные сессии повышают стресс',
  'Сон|Стр': 'недосып → выше стресс днём',
};

export function renderCorrelationPanel(container, data) {
  if (!container) return;

  const correlations = data.meta?.correlations;
  if (!correlations?.matrix?.length) {
    container.innerHTML = `
      <h3>Корреляции <span class="more" data-drill="corr">открыть в Аналитике →</span></h3>
      <div class="empty-state">
        <b>Нет данных за день</b>
        <span>Сбор начнётся ночью</span>
      </div>`;
    return;
  }

  const items = (correlations.strongest || []).map((item) => {
    const sign = item.r >= 0 ? 'pos' : 'neg';
    const hint = HINTS[`${item.a}|${item.b}`] || HINTS[`${item.b}|${item.a}`] || '';
    return `<div class="corr-item"><span class="ci-r ${sign}">${item.r > 0 ? '+' : ''}${item.r}</span>` +
      `<div><b>${item.a} → ${item.b}</b><div class="cx">${hint}</div></div></div>`;
  }).join('');

  container.innerHTML = `
    <h3>Корреляции <span class="more" data-drill="corr">открыть в Аналитике →</span></h3>
    <div class="hmwrap">
      ${heatmapMatrix(correlations)}
      <div class="corr-list"><div class="lbl">Сильнейшие связи</div>${items}</div>
    </div>`;

  if (typeof container.querySelectorAll === 'function') {
    container.querySelectorAll('.hc[data-i]').forEach((cell) => {
      cell.addEventListener('click', () => {
        window.__openAnalytics?.('corr', { i: +cell.dataset.i, j: +cell.dataset.j });
      });
    });
  }
}
