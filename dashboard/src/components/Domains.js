import { getDays } from '../utils/dataLoader.js';
import { donut, rangeBar, sparkline, stageBar } from './microcharts.js';

const LANG_COLORS = ['#69aed5', '#e2c162', '#5dc0a7', '#e99355'];

const minmax = (days, extractor) => {
  const values = days.map(extractor).filter((value) => value != null);
  return values.length ? { min: Math.min(...values), max: Math.max(...values) } : { min: 0, max: 1 };
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
          ${subRow('Пульс покоя', garmin.resting_hr, ranges.hr, '#59be6c')}
          ${subRow('SpO₂', garmin.spo2_avg != null ? `${garmin.spo2_avg}%` : null, ranges.spo2, '#69aed5', garmin.spo2_avg)}
          ${subRow('Body Battery', garmin.body_battery_max, ranges.bb, '#59be6c')}
        </div>
      </div>
    </div>`;
}

function renderMind(days, day, garmin, wakatime, correlations) {
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
          ${subRow('Стресс ср', garmin.stress_avg, minmax(days, (item) => item.garmin?.stress_avg), '#e2c162')}
          ${subRow('Фокус', wakatime?.focus_h != null ? `${wakatime.focus_h}ч` : null, { min: 0, max: 8 }, '#59be6c', wakatime?.focus_h)}
          <div class="sub"><span class="sl">Связь <span class="info">i</span></span><div class="track text-track"><span>сон ↔ настроение r=${corr ? corr.r : '—'}</span></div><span class="sv" style="color:var(--green)">↗</span></div>
        </div>
      </div>
    </div>`;
}

function renderWork(day, wakatime, github) {
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
          ${subRow('Коммиты', commitsValue, { min: 0, max: 20 }, '#59be6c', day.git?.commits)}
          ${subRow('PR / review', prReviewValue, { min: 0, max: 8 }, '#69aed5', github?.prs_merged)}
          ${subRow('Deep-work', day.schedule?.hours_work != null ? `${day.schedule.hours_work}ч` : null, { min: 0, max: 8 }, '#59be6c', day.schedule?.hours_work)}
        </div>
      </div>
    </div>`;
}

function subRow(label, displayValue, range, color, rawValue) {
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

  return `<div class="sub"><span class="sl">${label} <span class="info">i</span></span>${bar}<span class="sv">${displayValue ?? '—'}</span></div>`;
}
