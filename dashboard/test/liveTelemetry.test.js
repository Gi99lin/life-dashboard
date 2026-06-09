import { describe, expect, it } from 'vitest';
import { buildTelemetryModel, renderLiveTelemetry } from '../src/components/LiveTelemetry.js';

describe('buildTelemetryModel', () => {
  it('normalizes topology telemetry into chart labels and series', () => {
    const model = buildTelemetryModel({
      telemetry: {
        cpu: [{ t: 1000, value: 20 }, { t: 1060, value: 35 }],
        ram: [{ t: 1000, value: 60 }, { t: 1060, value: 64 }],
        net: [{ t: 1000, value: 100 }, { t: 1060, value: 300 }],
      },
    });

    expect(model.labels.length).toBe(2);
    expect(model.cpu).toEqual([20, 35]);
    expect(model.ram).toEqual([60, 64]);
    expect(model.net.at(-1)).toBe(100);
  });
});

describe('renderLiveTelemetry', () => {
  it('uses header period controls instead of rendering a duplicate selector', () => {
    const container = {
      classList: { add() {} },
      closest: () => ({ querySelectorAll: () => [] }),
      innerHTML: '',
      querySelector: () => null,
      querySelectorAll: () => [],
    };

    renderLiveTelemetry(container, { telemetry: {} });

    expect(container.innerHTML).toContain('Телеметрия хоста');
    expect(container.innerHTML).not.toContain('infra-periods');
  });

  it('notifies callers when a new timeframe topology is loaded', async () => {
    const listeners = {};
    const buttons = [
      {
        dataset: { min: '60' },
        classList: { toggle() {} },
        addEventListener: (event, fn) => { listeners[event] = fn; },
      },
    ];
    const root = { querySelectorAll: () => buttons };
    const container = {
      classList: { add() {} },
      closest: () => root,
      innerHTML: '',
      querySelector: () => null,
      querySelectorAll: () => [],
    };
    const loaded = { host: { cpu: 12 }, telemetry: { cpu: [{ t: 1, value: 12 }], ram: [], net: [] } };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      json: async () => loaded,
    });

    try {
      let update = null;
      renderLiveTelemetry(container, { telemetry: {} }, 10, {
        onTopology: (topology, minutes) => { update = { topology, minutes }; },
      });
      await listeners.click();

      expect(update).toEqual({ topology: loaded, minutes: 60 });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
