import { describe, expect, it } from 'vitest';
import { buildAnalyticsDeepModel, renderAnalyticsDeep } from '../src/components/AnalyticsDeep.js';

const sampleData = {
  days: {
    '2026-06-04': {
      date: '2026-06-04',
      manual: { mood: 3 },
      garmin: {
        sleep_hours: 7.1,
        sleep_phases: { deep_h: 1.1, light_h: 4.1, rem_h: 1.5, awake_h: 0.4 },
        stress_avg: 36,
        resting_hr: 55,
        spo2_avg: 97,
        body_battery_max: 65,
        steps: 7000,
      },
      wakatime: { total_h: 3.5, by_language: { TypeScript: 2.1, Python: 1.4 } },
      github: { prs_merged: 1, reviews: 2 },
      git: { commits: 8 },
    },
    '2026-06-05': {
      date: '2026-06-05',
      manual: { mood: 4 },
      garmin: {
        sleep_hours: 7.4,
        sleep_phases: { deep_h: 1.2, light_h: 4.0, rem_h: 1.8, awake_h: 0.4 },
        stress_avg: 34,
        resting_hr: 54,
        spo2_avg: 96,
        body_battery_max: 71,
        steps: 8200,
      },
      wakatime: { total_h: 4.8, by_language: { TypeScript: 1.9, Python: 1.3, JavaScript: 1.6 } },
      github: { prs_merged: 2, reviews: 5 },
      git: { commits: 16 },
    },
  },
  meta: {
    correlations: {
      labels: ['Сон', 'Наст', 'Стр', 'Код', 'Шаг', 'BB'],
      matrix: [[1, 0.62], [0.62, 1]],
      strongest: [{ a: 'Сон', b: 'Наст', r: 0.62 }],
    },
  },
};

describe('AnalyticsDeep', () => {
  it('builds body, mind, work and correlation data series', () => {
    const model = buildAnalyticsDeepModel(sampleData);

    expect(model.labels).toEqual(['04.06', '05.06']);
    expect(model.body.sleepHours).toEqual([7.1, 7.4]);
    expect(model.mind.mood).toEqual([3, 4]);
    expect(model.work.codeHours).toEqual([3.5, 4.8]);
    expect(model.work.languages).toEqual(['TypeScript', 'Python', 'JavaScript']);
    expect(model.scatter.points).toEqual([
      { x: 7.1, y: 3, date: '2026-06-04' },
      { x: 7.4, y: 4, date: '2026-06-05' },
    ]);
  });

  it('renders the analytics sub-tabs and canvases', () => {
    const container = {
      className: '',
      innerHTML: '',
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
    };

    renderAnalyticsDeep(container, sampleData);

    expect(container.className).toBe('analytics-deep');
    expect(container.innerHTML).toContain('data-analytics-tab="body"');
    expect(container.innerHTML).toContain('data-analytics-tab="mind"');
    expect(container.innerHTML).toContain('data-analytics-tab="work"');
    expect(container.innerHTML).toContain('data-analytics-tab="corr"');
    expect(container.innerHTML).toContain('id="analyticsBodyStages"');
    expect(container.innerHTML).toContain('id="analyticsMindChart"');
    expect(container.innerHTML).toContain('id="analyticsWorkChart"');
    expect(container.innerHTML).toContain('id="analyticsScatter"');
  });
});
