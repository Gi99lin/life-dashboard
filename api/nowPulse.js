const WAKATIME_SUMMARIES_URL = 'https://wakatime.com/api/v1/users/current/summaries';
const DEFAULT_NOW_PULSE_INTERVAL_MS = 60000;

export function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function seconds(item) {
  return Math.max(0, item?.total_seconds || 0);
}

function topNamed(items = []) {
  return [...items]
    .filter((item) => item?.name && seconds(item) > 0)
    .sort((a, b) => seconds(b) - seconds(a))[0] || null;
}

export function buildNowPulse(summaryJson) {
  const day = (summaryJson?.data || [])[0] || {};
  const totalSeconds = seconds(day.grand_total);
  const topProject = topNamed(day.projects);
  const topLanguage = topNamed(day.languages);
  const project = topProject?.name || topLanguage?.name || null;

  return {
    activity: totalSeconds > 0 ? 'Код' : 'Нет активности',
    project,
    focus_min: Math.round(totalSeconds / 60),
    source: 'WakaTime',
  };
}

export function buildCachedNowPulse(metrics, date = localDateString()) {
  const cached = metrics?.meta?.now;
  if (cached) return cached;

  const today = metrics?.days?.[date] || {};
  const wakatime = today.wakatime || {};
  const projects = wakatime.by_project || {};
  const languages = wakatime.by_language || {};
  const project = Object.keys(projects)[0] || Object.keys(languages)[0] || null;
  const focusH = wakatime.focus_h ?? wakatime.total_h;

  if (focusH == null && !project) return null;

  return {
    activity: (focusH || 0) > 0 ? 'Код' : 'Нет активности',
    project,
    focus_min: Math.round((focusH || 0) * 60),
    source: 'WakaTime',
  };
}

export async function fetchWakatimeNow(apiKey, fetchImpl = fetch, date = localDateString()) {
  if (!apiKey) return null;

  const auth = Buffer.from(`${apiKey}:`).toString('base64');
  const url = new URL(WAKATIME_SUMMARIES_URL);
  url.searchParams.set('start', date);
  url.searchParams.set('end', date);

  const response = await fetchImpl(url, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!response.ok) return null;

  return buildNowPulse(await response.json());
}

export function nowPulseIntervalMs(value = process.env.NOW_PULSE_INTERVAL_MS) {
  const parsed = Number.parseInt(value, 10);
  return parsed > 0 ? parsed : DEFAULT_NOW_PULSE_INTERVAL_MS;
}
