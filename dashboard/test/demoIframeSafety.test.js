import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf-8');
const css = readFileSync(new URL('../src/styles/main.css', import.meta.url), 'utf-8');

describe('demo iframe safety', () => {
  it('guards iframe loading and external opens in demo mode', () => {
    expect(main).toContain('renderDemoPlaceholder');
    expect(main).toContain('if (DEMO)');
    expect(main).toContain('demo-open');
    expect(main).toContain('window.open');
  });

  it('styles the demo badge and app placeholders', () => {
    expect(css).toContain('.demo-badge');
    expect(css).toContain('.demo-placeholder');
  });

  it('keeps the apps dropdown above embedded app frames', () => {
    expect(css).toMatch(/body\.app-mode \.top-header-row\s*{[\s\S]*position:\s*relative[\s\S]*z-index:\s*50/);
    expect(css).toMatch(/body\.app-mode \.apps-menu\s*{[\s\S]*z-index:\s*80/);
  });
});
