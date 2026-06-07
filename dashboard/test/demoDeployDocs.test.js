import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const orientation = readFileSync(new URL('../../docs/ORIENTATION.md', import.meta.url), 'utf-8');

describe('demo deploy docs', () => {
  it('documents the static demo build and deploy target', () => {
    expect(orientation).toContain('VITE_DEMO=1 npm run build');
    expect(orientation).toContain('demo.<domain>');
    expect(orientation).toContain('Доступно в полной версии');
  });
});
