import { getDays } from '../utils/dataLoader.js';
import { donut, rangeBar, sparkline, stageBar } from './microcharts.js';

const LANG_COLORS = ['#69aed5', '#e2c162', '#5dc0a7', '#e99355'];

const minmax = (days, extractor) => {
  const values = days.map(extractor).filter((value) => value != null);
  return values.length
    ? {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: round1(values.reduce((sum, value) => sum + value, 0) / values.length),
    }
    : { min: 0, max: 1, avg: '—' };
};

export function renderDomains(container, data) {
  if (!container) return;

  const days = getDays(data);
  const day = days[days.length - 1] || {};
  const garmin = day.garmin || {};
  const wakatime = day.wakatime;
  const github = day.github;

  container.className = 'domains';
  container.innerHTML = [
    renderBody(days, garmin),
    renderMind(days, day, garmin, wakatime, data.meta?.correlations),
    renderWork(day, wakatime, github),
  ].join('');
}

function renderBody(days, garmin) {
  if (!hasAnyMetric(garmin, ['sleep_hours', 'resting_hr', 'spo2_avg', 'body_battery_max', 'stress_avg'])) {
    return emptyDomain('Тело', 'Garmin', 'body');
  }

  const ranges = {
    hr: minmax(days, (day) => day.garmin?.resting_hr),
    spo2: minmax(days, (day) => day.garmin?.spo2_avg),
    bb: minmax(days, (day) => day.garmin?.body_battery_max),
  };

  return `
    <div class="dom" data-drill="body">
      <div class="dh"><span class="nm">Тело</span><span class="src">Garmin</span><span class="more">развернуть →</span></div>
      <div class="db">
        <div class="prim"><span class="pv" style="color:var(--aqua)">${garmin.sleep_hours ?? '—'}</span><span class="pu">ч сна</span></div>
        ${stageBar(garmin.sleep_phases || {})}
        <div class="legend">
          <span style="--c:#3b5566">Глубокий</span>
          <span style="--c:var(--aqua)">Лёгкий</span>
          <span style="--c:var(--blue)">REM</span>
          <span style="--c:var(--red)">Бодр.</span>
        </div>
        <div class="subs">
          ${subRow('Пульс покоя', garmin.resting_hr, ranges.hr, '#59be6c', undefined, 'Garmin')}
          ${subRow('SpO₂', garmin.spo2_avg != null ? `${garmin.spo2_avg}%` : null, ranges.spo2, '#69aed5', garmin.spo2_avg, 'Garmin')}
          ${subRow('Body Battery', garmin.body_battery_max, ranges.bb, '#59be6c', undefined, 'Garmin')}
        </div>
      </div>
    </div>`;
}

function renderMind(days, day, garmin, wakatime, correlations) {
  const hasMindData = day.manual?.mood != null || garmin.stress_avg != null ||
    wakatime?.focus_h != null || Boolean(correlations?.strongest?.length);
  if (!hasMindData) {
    return emptyDomain('Разум', 'Obsidian · Garmin', 'mind');
  }

  const moodSeries = days.slice(-14).map((item) => item.manual?.mood);
  const corr = (correlations?.strongest || []).find((item) => (
    (item.a === 'Сон' && item.b === 'Наст') || (item.a === 'Наст' && item.b === 'Сон')
  ));

  return `
    <div class="dom" data-drill="mind">
      <div class="dh"><span class="nm">Разум</span><span class="src">Obsidian · Garmin</span><span class="more">развернуть →</span></div>
      <div class="db">
        <div class="prim"><span class="pv" style="color:var(--yellow)">${day.manual?.mood ?? '—'}</span><span class="pu">/ 5 настроение</span></div>
        <div class="spark-wrap">${sparkline(moodSeries.filter((value) => value != null), '#c88ec3', 300, 34).replace('fspark', 'spark-svg')}</div>
        <div class="subs">
          ${subRow('Стресс ср', garmin.stress_avg, minmax(days, (item) => item.garmin?.stress_avg), '#e2c162', undefined, 'Garmin')}
          ${subRow('Фокус', wakatime?.focus_h != null ? `${wakatime.focus_h}ч` : null, { min: 0, max: 8, avg: '—' }, '#59be6c', wakatime?.focus_h, 'WakaTime')}
          <div class="sub" data-label="Связь" data-value="r=${corr ? corr.r : '—'}" data-avg="—" data-range="-1..1" data-source="Collector Pearson"><span class="sl">Связь <span class="info">i</span></span><div class="track text-track"><span>сон ↔ настроение r=${corr ? corr.r : '—'}</span></div><span class="sv" style="color:var(--green)">↗</span></div>
        </div>
      </div>
    </div>`;
}

function renderWork(day, wakatime, github) {
  const hasWorkData = Boolean(wakatime) || Boolean(github) ||
    day.git?.commits != null || day.schedule?.hours_work != null;
  if (!hasWorkData) {
    return emptyDomain('Работа', 'WakaTime · GitHub', 'work');
  }

  const languages = wakatime?.by_language || {};
  const total = Object.values(languages).reduce((sum, value) => sum + value, 0) || 1;
  const segments = Object.entries(languages).slice(0, 4).map(([, hours], index) => ({
    pct: (hours / total) * 100,
    color: LANG_COLORS[index],
  }));

  const languageLegend = Object.entries(languages).slice(0, 4).map(([name, hours], index) => (
    `<span class="lang" style="--c:${LANG_COLORS[index]}">${name} · ${hours}ч</span>`
  )).join('');
  const primaryValue = wakatime?.total_h ?? day.git?.commits ?? '—';
  const primaryUnit = wakatime ? 'ч кода' : 'коммитов';
  const commitsValue = day.git?.commits != null && github?.streak != null
    ? `${day.git.commits} · ${github.streak}д`
    : day.git?.commits;
  const prReviewValue = github
    ? `${github.prs_merged ?? 0}/${github.reviews ?? 0}`
    : null;

  return `
    <div class="dom" data-drill="work">
      <div class="dh"><span class="nm">Работа</span><span class="src">${wakatime ? 'WakaTime · ' : ''}GitHub</span><span class="more">развернуть →</span></div>
      <div class="db">
        <div class="prim"><span class="pv" style="color:var(--green)">${primaryValue}</span><span class="pu">${primaryUnit}</span></div>
        ${segments.length ? `<div class="donutrow">${donut(segments, `${wakatime.total_h || ''}ч`)}<div class="langs">${languageLegend}</div></div>` : ''}
        <div class="subs">
          ${subRow('Коммиты', commitsValue, { min: 0, max: 20, avg: '—' }, '#59be6c', day.git?.commits, 'GitHub')}
          ${subRow('PR / review', prReviewValue, { min: 0, max: 8, avg: '—' }, '#69aed5', github?.prs_merged, 'GitHub')}
          ${subRow('Deep-work', day.schedule?.hours_work != null ? `${day.schedule.hours_work}ч` : null, { min: 0, max: 8, avg: '—' }, '#59be6c', day.schedule?.hours_work, 'Obsidian')}
        </div>
      </div>
    </div>`;
}

function emptyDomain(name, source, drill) {
  return `
    <div class="dom" data-drill="${drill}">
      <div class="dh"><span class="nm">${name}</span><span class="src">${source}</span><span class="more">развернуть →</span></div>
      <div class="db">
        <div class="empty-state">
          <b>Нет данных за день</b>
          <span>Сбор начнётся ночью</span>
        </div>
      </div>
    </div>`;
}

function subRow(label, displayValue, range, color, rawValue, source = '—') {
  const value = rawValue != null ? rawValue : (typeof displayValue === 'number' ? displayValue : null);
  const bar = value == null
    ? '<div class="track"></div>'
    : rangeBar({
      value,
      min: range.min,
      max: range.max,
      bandMin: range.min + (range.max - range.min) * 0.25,
      bandMax: range.min + (range.max - range.min) * 0.8,
      color,
    });
  const rangeText = `${round1(range.min)}–${round1(range.max)}`;
  const tooltipAttrs = `data-label="${attr(label)}" data-value="${attr(displayValue ?? '—')}" ` +
    `data-avg="${attr(range.avg ?? '—')}" data-range="${attr(rangeText)}" data-source="${attr(source)}"`;

  return `<div class="sub" ${tooltipAttrs}><span class="sl">${label} <span class="info">i</span></span>${bar}<span class="sv">${displayValue ?? '—'}</span></div>`;
}

function hasAnyMetric(source, keys) {
  return keys.some((key) => source?.[key] != null);
}

function round1(value) {
  return typeof value === 'number' ? +value.toFixed(1) : value;
}

function attr(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}
