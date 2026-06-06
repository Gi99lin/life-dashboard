import { describe, it, expect } from 'vitest';
import { renderStackTopology } from '../src/components/StackTopology.js';

const topo = {
  networks: [{ name: 'librechat-net', services: [
    { name: 'LibreChat', tech: 'Node', status: 'running', cpu: 14, mem: 672, url: 'https://chat.x', role: 'app' },
    { name: 'Postgres', tech: 'pg16', status: 'running', cpu: 2, mem: 410, role: 'db' },
  ] }],
  standalone: [
    { name: 'nginx', role: 'gateway', status: 'running' },
    { name: 'work-vm', role: 'vm', status: 'running', open: 'https://rdp.x' },
  ],
  edges: [{ from: 'nginx', to: 'librechat-net', type: 'http' }],
};

describe('renderStackTopology', () => {
  it('renders a network box with its services and an SVG edge layer', () => {
    const container = { innerHTML: '', querySelectorAll: () => [] };
    renderStackTopology(container, topo);
    expect(container.innerHTML).toContain('librechat-net');
    expect(container.innerHTML).toContain('LibreChat');
    expect(container.innerHTML).toContain('class="net"');
    expect(container.innerHTML).toContain('<svg');
    expect(container.innerHTML).toContain('work-vm');
  });
});
