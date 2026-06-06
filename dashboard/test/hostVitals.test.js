import { describe, expect, it } from 'vitest';
import { renderHostVitals } from '../src/components/HostVitals.js';

describe('renderHostVitals', () => {
  it('renders host identity and compact vitals', () => {
    const container = { innerHTML: '' };
    renderHostVitals(container, {
      host: {
        name: 'gigglin-server',
        uptime: 'up 21 день',
        cpu: 24,
        ram: 64,
        disk: 68,
        net: '0.8M',
        vcpu: 8,
        ram_total: 16,
        os: 'Ubuntu 24.04 · Docker 27',
        containers: { total: 11, running: 10 },
      },
    });
    expect(container.innerHTML).toContain('gigglin-server');
    expect(container.innerHTML).toContain('CPU');
    expect(container.innerHTML).toContain('RAM');
    expect(container.innerHTML).toContain('10 активны');
  });
});
