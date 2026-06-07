import { describe, expect, it } from 'vitest';
import { buildForecast, buildMetrics, buildSchedule, buildTopology, scriptedAnalyze } from '../src/demo/demoData.js';

describe('demo data generators', () => {
  it('exports fresh metrics, scripted analysis, and infrastructure topology', () => {
    const metrics = buildMetrics();
    const days = Object.keys(metrics.days || {}).sort();
    const today = new Date().toISOString().slice(0, 10);

    expect(days.at(-1)).toBe(today);
    expect(metrics.meta?.findings?.length).toBeGreaterThanOrEqual(6);
    expect(scriptedAnalyze({ question: 'сон настроение' }).board).toMatchObject({ view: 'correlation', x: 'Сон', y: 'Наст' });
    expect(buildForecast().hourly.length).toBeGreaterThan(0);
    expect(buildSchedule().blocks.length).toBeGreaterThan(0);
    expect(buildTopology().networks.length).toBeGreaterThanOrEqual(4);
  });
});
