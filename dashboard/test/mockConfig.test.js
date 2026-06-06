import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const config = readFileSync(new URL('../vite.mock.config.js', import.meta.url), 'utf-8');

describe('mock preview config', () => {
  it('stubs analytics findings and analyze endpoint', () => {
    expect(config).toContain('findings:');
    expect(config).toContain('/api/analyze');
    expect(config).toContain('scriptedAnalyze');
  });

  it('stubs infrastructure topology endpoint', () => {
    expect(config).toContain('buildTopology');
    expect(config).toContain('/api/infra/topology');
  });
});
