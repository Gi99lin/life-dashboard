import { describe, expect, it } from 'vitest';
import { renderDomains } from '../src/components/Domains.js';

describe('renderDomains', () => {
  it('renders Body, Mind, and Work cards from existing metrics', () => {
    const container = { className: '', innerHTML: '' };
    const data = {
      days: {
        '2026-06-04': {
          date: '2026-06-04',
          manual: { mood: 3 },
          garmin: {
            sleep_hours: 7.1,
            sleep_phases: { deep_h: 1, light_h: 4, rem_h: 1.5, awake_h: 0.2 },
            resting_hr: 55,
            spo2_avg: 97,
            body_battery_max: 65,
            stress_avg: 35,
          },
          git: { commits: 8 },
          schedule: { hours_work: 5 },
        },
        '2026-06-05': {
          date: '2026-06-05',
          manual: { mood: 4 },
          garmin: {
            sleep_hours: 7.4,
            sleep_phases: { deep_h: 1.1, light_h: 4.1, rem_h: 1.6, awake_h: 0.3 },
            resting_hr: 54,
            spo2_avg: 96,
            body_battery_max: 71,
            stress_avg: 34,
          },
          git: { commits: 16 },
          schedule: { hours_work: 6.2 },
        },
      },
      meta: { correlations: { strongest: [{ a: 'Сон', b: 'Наст', r: 0.62 }] } },
    };

    renderDomains(container, data);

    expect(container.className).toBe('domains');
    expect((container.innerHTML.match(/class="dom"/g) || []).length).toBe(3);
    expect(container.innerHTML).toContain('Тело');
    expect(container.innerHTML).toContain('Разум');
    expect(container.innerHTML).toContain('Работа');
    expect(container.innerHTML).toContain('16</span><span class="pu">коммитов');
  });

  it('renders WakaTime language donut and GitHub PR/streak fields', () => {
    const container = { className: '', innerHTML: '' };
    const data = {
      days: {
        '2026-06-05': {
          date: '2026-06-05',
          manual: { mood: 4 },
          garmin: {
            sleep_hours: 7.4,
            sleep_phases: { deep_h: 1.1, light_h: 4.1, rem_h: 1.6, awake_h: 0.3 },
            resting_hr: 54,
            spo2_avg: 96,
            body_battery_max: 71,
            stress_avg: 34,
          },
          git: { commits: 16 },
          wakatime: {
            total_h: 4.8,
            by_language: { TypeScript: 1.9, Python: 1.3 },
            focus_h: 4.1,
          },
          github: { prs_merged: 2, reviews: 5, streak: 23 },
          schedule: { hours_work: 6.2 },
        },
      },
      meta: { correlations: { strongest: [] } },
    };

    renderDomains(container, data);

    expect(container.innerHTML).toContain('4.8</span><span class="pu">ч кода');
    expect(container.innerHTML).toContain('TypeScript · 1.9ч');
    expect(container.innerHTML).toContain('Коммиты');
    expect(container.innerHTML).toContain('16 · 23д');
    expect(container.innerHTML).toContain('PR / review');
    expect(container.innerHTML).toContain('2/5');
    expect(container.innerHTML).toContain('data-source="GitHub"');
    expect(container.innerHTML).toContain('data-range="0–20"');
    expect(container.innerHTML).toContain('data-avg=');
  });
});
