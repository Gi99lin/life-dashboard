import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../../.github/workflows/docker-publish.yml', import.meta.url), 'utf-8');

describe('docker publish workflow', () => {
  it('retries GHCR image pushes instead of failing on transient unknown blob errors', () => {
    expect(workflow).toContain('push_image()');
    expect(workflow).toMatch(/for attempt in 1 2 3/);
    expect(workflow).toMatch(/docker push "\$image"/);
    expect(workflow).toContain('Push failed for');
  });
});
