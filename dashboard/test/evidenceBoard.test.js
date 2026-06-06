import { describe, it, expect } from 'vitest';
import { METRICS, buildBoardModel } from '../src/components/EvidenceBoard.js';

const data = { days: {
  '2026-06-01': { date: '2026-06-01', weekday: 'Пн', garmin: { sleep_hours: 6, stress_avg: 40 }, manual: { mood: 3 } },
  '2026-06-02': { date: '2026-06-02', weekday: 'Вт', garmin: { sleep_hours: 8, stress_avg: 30 }, manual: { mood: 5 } },
  '2026-06-03': { date: '2026-06-03', weekday: 'Ср', garmin: { sleep_hours: 7, stress_avg: 35 }, manual: { mood: 4 } },
} };

describe('EvidenceBoard model', () => {
  it('exposes metric extractors by label', () => {
    expect(typeof METRICS['Сон']).toBe('function');
    expect(METRICS['Сон']({ garmin: { sleep_hours: 7 } })).toBe(7);
  });

  it('correlation view returns points + r', () => {
    const m = buildBoardModel(data, { view: 'correlation', x: 'Сон', y: 'Наст' }, 30);
    expect(m.view).toBe('correlation');
    expect(m.points.length).toBe(3);
    expect(typeof m.r).toBe('number');
  });

  it('weekday view buckets by day-of-week', () => {
    const m = buildBoardModel(data, { view: 'weekday', x: 'Сон', y: null }, 30);
    expect(m.view).toBe('weekday');
    expect(m.buckets.length).toBe(7);
  });

  it('timeline + distribution return arrays', () => {
    expect(buildBoardModel(data, { view: 'timeline', x: 'Стр', y: null }, 30).series.length).toBe(3);
    expect(buildBoardModel(data, { view: 'distribution', x: 'Сон', y: null }, 30).bins.length).toBeGreaterThan(0);
  });
});
