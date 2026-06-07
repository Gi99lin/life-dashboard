import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const files = {
  dataLoader: readFileSync(new URL('../src/utils/dataLoader.js', import.meta.url), 'utf-8'),
  main: readFileSync(new URL('../src/main.js', import.meta.url), 'utf-8'),
  weather: readFileSync(new URL('../src/components/WeatherForecast.js', import.meta.url), 'utf-8'),
  chat: readFileSync(new URL('../src/components/AnalystChat.js', import.meta.url), 'utf-8'),
  liveTelemetry: readFileSync(new URL('../src/components/LiveTelemetry.js', import.meta.url), 'utf-8'),
  scheduleEditor: readFileSync(new URL('../src/components/ScheduleEditor.js', import.meta.url), 'utf-8'),
  quickEntry: readFileSync(new URL('../src/components/QuickEntry.js', import.meta.url), 'utf-8'),
};

describe('demo API wiring', () => {
  it('routes frontend API reads and writes through apiFetch', () => {
    for (const [name, source] of Object.entries(files)) {
      expect(source, name).not.toMatch(/\bfetch\(['"`]\/api\//);
    }
  });

  it('skips auth and sockets in demo mode', () => {
    expect(files.main).toContain('DEMO');
    expect(files.main).toContain('if (!DEMO)');
    expect(files.main).toContain('apiFetch');
  });
});
