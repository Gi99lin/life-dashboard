import { describe, it, expect } from 'vitest';
import { renderStackTopology } from '../src/components/StackTopology.js';

const topo = {
  networks: [{ name: 'librechat-net', services: [
    { name: 'LibreChat', tech: 'Node', status: 'running', cpu: 14, mem: 672, url: 'https://chat.x', role: 'app' },
    { name: 'Postgres', tech: 'pg16', status: 'running', cpu: 2, mem: 410, role: 'db' },
  ] }],
  standalone: [
    { name: 'nginx', role: 'gateway', status: 'running' },
    { name: 'внешние LLM', role: 'external', status: 'running' },
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

  it('places the Internet and external services in separate lanes', () => {
    const container = { innerHTML: '', querySelectorAll: () => [] };
    renderStackTopology(container, topo);

    expect(container.innerHTML).toMatch(/style="left:42px;top:220px"[\s\S]*🌐 Интернет/);
    expect(container.innerHTML).toMatch(/style="left:1012px;top:128px"[\s\S]*внешние LLM/);
  });

  it('does not draw a decorative dangling line to external LLM providers', () => {
    const container = { innerHTML: '', querySelectorAll: () => [] };
    renderStackTopology(container, topo);

    expect(container.innerHTML).not.toContain('M888,92 C950,92 985,110 1008,128');
  });
});
