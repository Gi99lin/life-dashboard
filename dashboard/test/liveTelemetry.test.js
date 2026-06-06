import { describe, expect, it } from 'vitest';
import { buildTelemetryModel } from '../src/components/LiveTelemetry.js';

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
