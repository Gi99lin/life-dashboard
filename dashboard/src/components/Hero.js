import { getDays } from '../utils/dataLoader.js';
import { multiRing, sparkline } from './microcharts.js';

const FACTORS = [
  { key: 'sleep', label: 'Сон', color: '#5dc0a7' },
  { key: 'energy', label: 'Энергия', color: '#59be6c' },
  { key: 'calm', label: 'Спокойствие', color: '#e2c162' },
  { key: 'hrv', label: 'HRV', color: '#69aed5' },
];

export function renderHero(container, data) {
  if (!container) return;

  const days = getDays(data);
  const last = days[days.length - 1] || {};
  const prev = days[days.length - 2] || {};
  const readiness = last.readiness || {};
  const scores = days.map((day) => day.readiness?.score).filter((score) => score != null);
  const avgWindow = scores.slice(-30);
  const avg30 = avgWindow.length
    ? Math.round(avgWindow.reduce((sum, score) => sum + score, 0) / avgWindow.length)
    : null;
  const delta = readiness.score != null && avg30 != null ? readiness.score - avg30 : null;
  const brief = data.meta?.ai_brief;

  const rings = multiRing({
    score: readiness.score,
    factors: FACTORS.map((factor) => ({
      value: readiness[factor.key],
      color: factor.color,
    })),
  });

  const factorRows = FACTORS.map((factor) => {
    const series = days.slice(-14).map((day) => day.readiness?.[factor.key]).filter((value) => value != null);
    const value = readiness[factor.key];
    const previous = prev.readiness?.[factor.key];
    const factorDelta = value != null && previous != null ? value - previous : null;
    const deltaColor = factorDelta == null || factorDelta >= 0 ? 'var(--green)' : 'var(--red)';
    const deltaText = factorDelta == null ? '—' : `${factorDelta >= 0 ? '▲' : '▼'}${Math.abs(factorDelta)}`;

    return `<div class="frow"><i style="background:${factor.color}"></i><span>${factor.label}</span>` +
      `${sparkline(series, factor.color)}<span class="fv">${value ?? '—'}</span>` +
      `<span class="fd" style="color:${deltaColor}">${deltaText}</span></div>`;
  }).join('');

  const strip = days.slice(-14).map((day, index, list) => {
    const score = day.readiness?.score ?? 0;
    return `<i class="${index === list.length - 1 ? 'today' : ''}" style="height:${Math.max(8, score)}%"></i>`;
  }).join('');

  const deltaStr = delta == null ? '' :
    `<span style="color:${delta >= 0 ? 'var(--green)' : 'var(--red)'}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)} vs среднее 30д (${avg30})</span>`;
  const sources = (brief?.sources || []).map((source) => `<span class="src">${source}</span>`).join('');

  container.className = 'hero2';
  container.innerHTML = `
    ${rings}
    <div class="sctx">
      <div>
        <div class="lbl">Состояние дня · composite</div>
        <div class="st">${statusLabel(readiness.score)}</div>
        <div class="sd">${deltaStr}</div>
        <div class="desc">${description(readiness.score)}</div>
      </div>
      <div class="flegend">${factorRows}</div>
    </div>
    <div class="hcol">
      <div>
        <div class="lbl strip-label">Готовность · 14 дней</div>
        <div class="strip">${strip}</div>
      </div>
      <div class="reco">◈ ${recommendation(readiness.score)}</div>
      <div class="brief hero-brief">
        <div class="bh"><span class="lbl">◇ AI-разбор дня</span><span class="more" data-drill="ai">развернуть →</span></div>
        <p> ${brief?.text || 'Анализ появится после сбора данных.'}</p>
        <div class="chips">${sources}</div>
      </div>
    </div>`;
}

function statusLabel(score) {
  if (score == null) return 'Нет данных';
  if (score >= 75) return 'Готов к нагрузке';
  if (score >= 55) return 'В норме';
  return 'Нужен отдых';
}

function description(score) {
  if (score == null) return 'Коллектор ещё не собрал достаточно данных для балла.';
  if (score >= 75) return 'Тело восстановилось, нервная система спокойна — можно держать высокий темп.';
  if (score >= 55) return 'День рабочий, но лучше держать нагрузку ровной и смотреть на стресс.';
  return 'Сигналы восстановления слабые — стоит снизить темп и закрыть базовые потребности.';
}

function recommendation(score) {
  if (score == null) return 'Сначала дождись свежего сбора метрик.';
  if (score >= 75) return 'Хорошее окно для глубокой работы — держи нагрузку до вечера';
  if (score >= 55) return 'Ставь сложные задачи короткими блоками и делай паузы';
  return 'Лучше выбрать восстановление и лёгкие задачи без гонки';
}
