/**
 * readinessDrivers.js — pure, unit-testable computation of which behavioural
 * inputs most move the daily Readiness score.
 *
 * We correlate *behavioural* signals (sleep hours, steps, code, mood, resting HR)
 * — deliberately NOT the readiness formula's own components (sleep_score,
 * body_battery, calm, hrv), which would be tautologically correlated — against
 * the daily readiness score over a trailing window. Result feeds the
 * "Драйверы готовности" mini-bars in the correlation panel.
 */
import { getDays } from '../utils/dataLoader.js';

const DRIVER_FACTORS = [
  { key: 'sleep', label: 'Сон', get: (d) => d.garmin?.sleep_hours },
  { key: 'steps', label: 'Шаги', get: (d) => d.garmin?.steps },
  { key: 'code', label: 'Код', get: (d) => d.wakatime?.total_h ?? d.schedule?.hours_work },
  { key: 'mood', label: 'Настроение', get: (d) => d.manual?.mood },
  { key: 'rhr', label: 'Пульс покоя', get: (d) => d.garmin?.resting_hr },
];

/** Pearson r over paired non-null values; null if <3 pairs or zero variance. */
export function pearson(xs, ys) {
  const pairs = [];
  for (let i = 0; i < xs.length; i += 1) {
    if (xs[i] != null && ys[i] != null) pairs.push([xs[i], ys[i]]);
  }
  if (pairs.length < 3) return null;

  const n = pairs.length;
  const mx = pairs.reduce((s, p) => s + p[0], 0) / n;
  const my = pairs.reduce((s, p) => s + p[1], 0) / n;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (const [x, y] of pairs) {
    const dx = x - mx;
    const dy = y - my;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  if (vx === 0 || vy === 0) return null;
  return +(cov / Math.sqrt(vx * vy)).toFixed(2);
}

/** @returns {{key,label,r,n}[]} sorted by |r| desc, top N (default 4). */
export function computeReadinessDrivers(data, { window = 30, top = 4 } = {}) {
  if (!data || !data.days) return [];
  const days = getDays(data, window);
  const scores = days.map((d) => d.readiness?.score ?? null);

  const drivers = [];
  for (const factor of DRIVER_FACTORS) {
    const column = days.map(factor.get);
    const r = pearson(column, scores);
    if (r == null) continue;
    const n = days.filter((d, i) => factor.get(d) != null && scores[i] != null).length;
    drivers.push({ key: factor.key, label: factor.label, r, n });
  }

  drivers.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  return drivers.slice(0, top);
}

export { DRIVER_FACTORS };
