import { describe, expect, it } from 'vitest';
import { demoFetch, isDemoMode } from '../src/utils/demo.js';

describe('demo mode provider', () => {
  it('detects explicit demo flag and demo hostnames', () => {
    expect(isDemoMode({ VITE_DEMO: '1' }, { hostname: 'localhost' })).toBe(true);
    expect(isDemoMode({ VITE_DEMO: '0' }, { hostname: 'demo.gigglin.tech' })).toBe(true);
    expect(isDemoMode({ VITE_DEMO: '0' }, { hostname: 'localhost' })).toBe(false);
  });

  it('serves in-browser API responses with query stripping', async () => {
    const metrics = await (await demoFetch('/api/sync')).json();
    const topology = await (await demoFetch('/api/infra/topology?minutes=10')).json();
    const analysis = await (await demoFetch('/api/analyze', {
      method: 'POST',
      body: JSON.stringify({ question: 'сон настроение' }),
    })).json();
    const entry = await (await demoFetch('/api/entry?date=2026-06-07')).json();

    expect(Object.keys(metrics.days).length).toBeGreaterThan(0);
    expect(topology.networks.length).toBeGreaterThanOrEqual(4);
    expect(analysis.board).toMatchObject({ view: 'correlation', x: 'Сон', y: 'Наст' });
    expect(entry).toMatchObject({ mood: 4, food_before_20: true });
  });

  it('respects infrastructure topology timeframe queries', async () => {
    const tenMinutes = await (await demoFetch('/api/infra/topology?minutes=10')).json();
    const sixHours = await (await demoFetch('/api/infra/topology?minutes=360')).json();

    expect(tenMinutes.telemetry.cpu).toHaveLength(10);
    expect(sixHours.telemetry.cpu.length).toBeGreaterThan(tenMinutes.telemetry.cpu.length);
    expect(sixHours.telemetry.cpu.length).toBeLessThanOrEqual(180);
  });
});
