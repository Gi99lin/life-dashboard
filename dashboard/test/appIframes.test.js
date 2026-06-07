import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf-8');

describe('embedded app iframes', () => {
  it('does not eagerly load external apps on the Overview screen', () => {
    expect(html).toContain('data-src="https://chat.gigglin.tech/"');
    expect(html).toContain('data-src="https://rdp.gigglin.tech/"');
    expect(html).toContain('data-src="https://omniroute.gigglin.tech/"');
    expect(html).not.toContain('<iframe src="https://chat.gigglin.tech/"');
    expect(html).not.toContain('<iframe src="https://rdp.gigglin.tech/"');
    expect(html).not.toContain('<iframe src="https://omniroute.gigglin.tech/"');
  });

  it('includes static demo placeholders for embedded apps', () => {
    expect(html).toContain('id="demoBadge"');
    expect(html).toContain('class="demo-placeholder"');
    expect(html).toContain('Доступно в полной версии');
  });
});
