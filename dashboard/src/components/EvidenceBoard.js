import { getDays } from '../utils/dataLoader.js';
import { pearson } from './readinessDrivers.js';

export const METRICS = {
  'Сон': (day) => day.garmin?.sleep_hours ?? day.schedule?.hours_sleep ?? null,
  'Наст': (day) => day.manual?.mood ?? null,
  'Стр': (day) => day.garmin?.stress_avg ?? null,
  'Шаг': (day) => day.garmin?.steps ?? null,
  'Код': (day) => day.wakatime?.total_h ?? day.schedule?.hours_work ?? null,
  'BB': (day) => day.garmin?.body_battery_max ?? null,
  'Готов': (day) => day.readiness?.score ?? null,
};

const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function avg(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function buildBoardModel(data, state, window = 30) {
  const days = getDays(data || { days: {} }, window);
  const current = { view: 'timeline', x: 'Сон', y: null, annotations: [], ...(state || {}) };
  const x = METRICS[current.x] || (() => null);
  const y = METRICS[current.y] || (() => null);

  if (current.view === 'correlation') {
    const points = days
      .map((day) => ({ x: x(day), y: y(day), date: day.date }))
      .filter((point) => point.x != null && point.y != null);
    return {
      view: 'correlation',
      xLabel: current.x,
      yLabel: current.y,
      points,
      r: pearson(points.map((point) => point.x), points.map((point) => point.y)) ?? 0,
      annotations: current.annotations || [],
    };
  }

  if (current.view === 'weekday') {
    const buckets = WD.map((wd) => {
      const values = days
        .filter((day) => day.weekday === wd)
        .map(x)
        .filter((value) => value != null);
      return { wd, avg: avg(values) };
    });
    return { view: 'weekday', xLabel: current.x, buckets, annotations: current.annotations || [] };
  }

  if (current.view === 'distribution') {
    const values = days.map(x).filter((value) => value != null);
    if (!values.length) return { view: 'distribution', xLabel: current.x, bins: [] };

    const min = Math.min(...values);
    const max = Math.max(...values);
    const count = 8;
    const width = (max - min) / count || 1;
    const bins = Array.from({ length: count }, (_, index) => ({ lo: min + index * width, count: 0 }));
    values.forEach((value) => {
      bins[Math.min(count - 1, Math.floor((value - min) / width))].count += 1;
    });
    return { view: 'distribution', xLabel: current.x, bins, annotations: current.annotations || [] };
  }

  return {
    view: 'timeline',
    xLabel: current.x,
    labels: days.map((day) => day.date?.slice(5) || ''),
    series: days.map(x),
    annotations: current.annotations || [],
  };
}
