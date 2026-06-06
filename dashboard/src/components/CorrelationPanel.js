import { heatmapMatrix } from './microcharts.js';
import { computeReadinessDrivers } from './readinessDrivers.js';

const HINTS = {
  'Сон|Наст': 'крепче спишь — лучше день',
  'Стр|BB': 'стресс садит body battery',
  'Код|Стр': 'длинные сессии повышают стресс',
  'Сон|Стр': 'недосып → выше стресс днём',
};

function fmtR(r) {
  const sign = r > 0 ? '+' : r < 0 ? '−' : '';
  return `${sign}${Math.abs(r).toFixed(2).replace(/^0/, '')}`;
}

function driversBlock(data) {
  const drivers = computeReadinessDrivers(data, { window: 30, top: 4 });
  if (!drivers.length) return '';

  const rows = drivers.map((d) => {
    const sign = d.r >= 0 ? 'pos' : 'neg';
    const mag = Math.min(50, Math.round(Math.abs(d.r) * 50)); // half-track width %
    const fill = d.r >= 0
      ? `left:50%;width:${mag}%`
      : `right:50%;width:${mag}%`;
    const tip = `связь с готовностью · r=${fmtR(d.r)} · n=${d.n} · Pearson`;
    return `<div class="drv" data-driver="${d.key}" data-tip="${tip}">`
      + `<span class="dl">${d.label}</span>`
      + `<div class="dbar"><i class="${sign}" style="${fill}"></i></div>`
      + `<span class="dv ${sign}">${fmtR(d.r)}</span></div>`;
  }).join('');

  return `<div class="corr-drivers">`
    + `<div class="lbl">Драйверы готовности <span class="info">i</span></div>`
    + rows + `</div>`;
}

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
    return `<div class="corr-item"><span class="ci-r ${sign}">${item.r > 0 ? '+' : ''}${item.r}</span>`
      + `<div><b>${item.a} → ${item.b}</b><div class="cx">${hint}</div></div></div>`;
  }).join('');

  container.innerHTML = `
    <h3>Корреляции <span class="more" data-drill="corr">открыть в Аналитике →</span></h3>
    <div class="hmwrap">
      ${heatmapMatrix(correlations)}
      <div class="corr-list">
        <div class="lbl">Сильнейшие связи</div>${items}
        ${driversBlock(data)}
      </div>
    </div>`;

  if (typeof container.querySelectorAll !== 'function') return;

  container.querySelectorAll('.hc[data-i]').forEach((cell) => {
    cell.addEventListener('click', () => {
      window.__openAnalytics?.('corr', { i: +cell.dataset.i, j: +cell.dataset.j });
    });
  });

  container.querySelectorAll('.drv[data-driver]').forEach((bar) => {
    bar.addEventListener('click', () => {
      window.__openAnalytics?.('corr', { driver: bar.dataset.driver });
    });
  });
}
