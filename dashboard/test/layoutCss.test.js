import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/styles/main.css', import.meta.url), 'utf-8');

describe('layout css regressions', () => {
  it('keeps weather details in compact non-clipping columns', () => {
    expect(css).toMatch(/\.top-header-row\s*{[\s\S]*flex-wrap:\s*wrap/);
    expect(css).toMatch(/\.weather-widget-pane\s*{[\s\S]*flex:\s*1 1 520px/);
    expect(css).toMatch(/\.weather-current-row\s*{[\s\S]*grid-template-columns:\s*auto minmax\(86px,\s*auto\) minmax\(170px,\s*max-content\)/);
    expect(css).toMatch(/\.weather-metrics\s*{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(72px,\s*max-content\)\)/);
    expect(css).toMatch(/\.weather-hourly\s*{[\s\S]*display:\s*grid[\s\S]*grid-auto-columns:\s*minmax\(54px,\s*1fr\)/);
  });

  it('does not stretch the tab bar across app-mode iframes', () => {
    expect(css).toMatch(/body\.app-mode \.tabs\s*{[\s\S]*flex:\s*0 0 auto[\s\S]*width:\s*auto[\s\S]*max-width:\s*fit-content/);
  });

  it('keeps app dropdown readable and analytics cards unclipped on hover', () => {
    expect(css).toMatch(/\.tabs\s*{[\s\S]*position:\s*relative[\s\S]*z-index:\s*90/);
    expect(css).toMatch(/\.apps-menu\s*{[\s\S]*background:\s*var\(--bg0\)/);
    expect(css).toMatch(/\.apps-menu\s*{[\s\S]*z-index:\s*120/);
    expect(css).toMatch(/\.lane\s*{[\s\S]*padding-top:\s*4px/);
  });
});
