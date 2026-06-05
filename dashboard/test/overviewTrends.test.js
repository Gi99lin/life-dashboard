import { describe, expect, it } from 'vitest';
import { buildOverviewTrendSeries, hasTrendData } from '../src/components/OverviewTrends.js';

describe('buildOverviewTrendSeries', () => {
  it('builds labels and three trend series from latest days', () => {
    const data = {
      days: {
        '2026-06-04': {
          date: '2026-06-04',
          manual: { mood: 3 },
          garmin: { sleep_hours: 7.1, body_battery_max: 65 },
        },
        '2026-06-05': {
          date: '2026-06-05',
          manual: { mood: 4 },
          garmin: { sleep_hours: 7.4, body_battery_max: 71 },
        },
      },
    };

    const out = buildOverviewTrendSeries(data, 30);

    expect(out.labels).toEqual(['04.06', '05.06']);
    expect(out.mood).toEqual([3, 4]);
    expect(out.sleep).toEqual([7.1, 7.4]);
    expect(out.energy).toEqual([65, 71]);
  });

  it('detects when trend series have no usable data', () => {
    expect(hasTrendData({ labels: [], mood: [], sleep: [], energy: [] })).toBe(false);
    expect(hasTrendData({ labels: ['05.06'], mood: [null], sleep: [null], energy: [null] })).toBe(false);
    expect(hasTrendData({ labels: ['05.06'], mood: [4], sleep: [null], energy: [null] })).toBe(true);
  });
});
