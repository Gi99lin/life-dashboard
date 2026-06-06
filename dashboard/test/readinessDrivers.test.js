import { describe, it, expect } from 'vitest';
import { pearson, computeReadinessDrivers } from '../src/components/readinessDrivers.js';

describe('readinessDrivers', () => {
  it('pearson: known values and guards', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBe(1);
    expect(pearson([1, 2, 3], [3, 2, 1])).toBe(-1);
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull(); // zero variance
    expect(pearson([1, 2], [1, 2])).toBeNull(); // <3 pairs
  });

  it('ranks behavioural factors by |r| to the readiness score, dropping constants', () => {
    const data = { days: {} };
    for (let i = 0; i < 10; i += 1) {
      const date = `2026-06-${String(i + 1).padStart(2, '0')}`;
      data.days[date] = {
        date,
        readiness: { score: 50 + i * 4 }, // monotonic up
        garmin: { sleep_hours: 5 + i * 0.3, steps: 8000, resting_hr: 60 }, // only sleep varies
        manual: { mood: 3 },
        wakatime: { total_h: 2 },
      };
    }

    const drivers = computeReadinessDrivers(data, { window: 30, top: 4 });
    // Constant factors (steps/mood/code/rhr) have zero variance → excluded.
    expect(drivers.map((d) => d.key)).toEqual(['sleep']);
    expect(drivers[0].r).toBe(1);
    expect(drivers[0].n).toBe(10);
  });

  it('honours the window and top limit', () => {
    const data = { days: {} };
    for (let i = 0; i < 40; i += 1) {
      const date = `2026-05-${String(i + 1).padStart(2, '0')}`;
      data.days[date] = {
        date,
        readiness: { score: 40 + (i % 7) * 5 },
        garmin: { sleep_hours: 6 + (i % 5) * 0.4, steps: 5000 + (i % 6) * 900, resting_hr: 58 + (i % 4) },
        manual: { mood: 1 + (i % 5) },
        wakatime: { total_h: (i % 6) * 0.8 },
      };
    }
    const drivers = computeReadinessDrivers(data, { window: 30, top: 3 });
    expect(drivers.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < drivers.length; i += 1) {
      expect(Math.abs(drivers[i - 1].r)).toBeGreaterThanOrEqual(Math.abs(drivers[i].r));
    }
  });
});
