import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf-8');

describe('infrastructure tab markup', () => {
  it('uses the homelab cockpit shell instead of ServerMetrics', () => {
    expect(html).toContain('id="infraVitals"');
    expect(html).toContain('id="infraLive"');
    expect(html).toContain('id="stackTopo"');
    expect(html).not.toContain('serverMetrics');
  });
});
