import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf-8');

describe('analytics tab markup', () => {
  it('uses the AI lab shell instead of AnalyticsDeep', () => {
    expect(html).toContain('id="anFindings"');
    expect(html).toContain('id="anChat"');
    expect(html).toContain('id="anBoard"');
    expect(html).not.toContain('analyticsDeep');
  });
});
