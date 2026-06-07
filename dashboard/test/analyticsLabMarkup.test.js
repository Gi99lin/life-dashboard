import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf-8');
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf-8');
const css = readFileSync(new URL('../src/styles/main.css', import.meta.url), 'utf-8');

describe('analytics tab markup', () => {
  it('uses the AI lab shell instead of AnalyticsDeep', () => {
    expect(html).toContain('id="anFindings"');
    expect(html).toContain('id="anChat"');
    expect(html).toContain('id="anBoard"');
    expect(html).not.toContain('analyticsDeep');
  });

  it('exposes clickable period controls for the AI lab', () => {
    expect(html).toContain('class="periods analytics-periods"');
    for (const period of ['7', '30', '90', '365']) {
      expect(html).toContain(`data-period="${period}"`);
    }
    expect(html).toContain('data-analytics-stamp');
    expect(main).toContain('setAnalyticsPeriod');
    expect(main).toContain('analytics-periods');
  });

  it('keeps the analyst chat panel fixed while messages scroll', () => {
    expect(css).toMatch(/\.chat\s*{[\s\S]*height:\s*430px[\s\S]*display:\s*flex[\s\S]*flex-direction:\s*column/);
    expect(css).toMatch(/\.msgs\s*{[\s\S]*min-height:\s*0/);
  });
});
