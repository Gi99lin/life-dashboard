/**
 * dataLoader.js — loads metrics.json and provides helpers.
 */

let metricsData = null;

export async function loadMetrics() {
  if (metricsData) return metricsData;

  // 1. Try API sync (reads Obsidian → updates metrics.json → returns fresh data)
  try {
    const response = await fetch('/api/sync');
    const ct = response.headers.get('content-type') || '';
    if (response.ok && ct.includes('application/json')) {
      metricsData = await response.json();
      return metricsData;
    }
  } catch (e) {
    console.warn('API sync unavailable, falling back to static file...', e);
  }

  // 2. Fallback: load static metrics.json
  try {
    const response = await fetch('/data/metrics.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    metricsData = await response.json();
  } catch (e) {
    console.warn('Failed to load metrics.json from /data/', e);
    try {
      const response = await fetch('/metrics.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      metricsData = await response.json();
    } catch (e2) {
      console.error('Could not load metrics.json', e2);
      metricsData = { days: {}, meta: {} };
    }
  }

  return metricsData;
}

/**
 * Get sorted array of day objects, optionally filtered to last N days.
 */
export function getDays(data, lastN = null) {
  const days = Object.values(data.days)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (lastN) return days.slice(-lastN);
  return days;
}

/**
 * Get the most recent day entry.
 */
export function getToday(data) {
  const days = getDays(data);
  return days[days.length - 1] || null;
}

/**
 * Get days grouped by ISO week.
 */
export function getWeeks(data) {
  const weeks = {};
  for (const day of getDays(data)) {
    const w = day.week_iso;
    if (!weeks[w]) weeks[w] = [];
    weeks[w].push(day);
  }
  return weeks;
}
