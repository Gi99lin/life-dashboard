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
    { name: 'Netdata', role: 'monitor', status: 'running' },
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
    expect(container.innerHTML).toContain('class="topo-canvas"');
    expect(container.innerHTML).toContain('class="net"');
    expect(container.innerHTML).toContain('<svg');
    expect(container.innerHTML).toContain('work-vm');
    expect(container.innerHTML).not.toContain('🖧');
  });

  it('renders zoom and fullscreen controls for the topology map', () => {
    const container = { innerHTML: '', querySelectorAll: () => [] };
    renderStackTopology(container, topo);

    expect(container.innerHTML).toContain('data-topo-zoom="out"');
    expect(container.innerHTML).toContain('data-topo-zoom="in"');
    expect(container.innerHTML).toContain('data-topo-fullscreen');
  });

  it('falls back to fixed fullscreen when the browser denies native fullscreen', async () => {
    const listeners = {};
    const classes = new Set();
    const frame = {
      requestFullscreen: () => Promise.reject(new Error('denied')),
      classList: {
        toggle: (name) => {
          if (classes.has(name)) classes.delete(name);
          else classes.add(name);
        },
        contains: (name) => classes.has(name),
      },
    };
    const fullscreenButton = {
      addEventListener: (event, handler) => {
        listeners[event] = handler;
      },
    };
    const container = {
      innerHTML: '',
      querySelectorAll: () => [],
      querySelector: (selector) => {
        if (selector === '.topo-frame') return frame;
        if (selector === '[data-topo-fullscreen]') return fullscreenButton;
        return null;
      },
    };

    renderStackTopology(container, topo);
    await listeners.click();

    expect(frame.classList.contains('is-fullscreen')).toBe(true);
  });

  it('sizes the topology canvas for large stacks so the panel can scroll', () => {
    const largeTopo = {
      networks: Array.from({ length: 8 }, (_, index) => ({
        name: `stack-${index}`,
        services: [{ name: `app-${index}`, status: 'running', role: 'app', cpu: 1, mem: 10 }],
      })),
      standalone: [],
    };
    const container = { innerHTML: '', querySelectorAll: () => [] };

    renderStackTopology(container, largeTopo);

    expect(container.innerHTML).toContain('style="width:1240px;height:1120px"');
  });

  it('places the Internet and external services in connected lanes', () => {
    const container = { innerHTML: '', querySelectorAll: () => [] };
    renderStackTopology(container, topo);

    expect(container.innerHTML).toMatch(/style="left:42px;top:220px"[\s\S]*🌐 Интернет/);
    expect(container.innerHTML).toMatch(/style="left:930px;top:92px"[\s\S]*внешние LLM/);
    expect(container.innerHTML).toContain('class="edge llm"');
    expect(container.innerHTML).toContain('class="edge mon"');
  });

  it('does not draw decorative dangling infrastructure lines', () => {
    const container = { innerHTML: '', querySelectorAll: () => [] };
    renderStackTopology(container, topo);

    expect(container.innerHTML).not.toContain('M888,92 C950,92 985,110 1008,128');
    expect(container.innerHTML).not.toContain('M1118,300 C980,250 820,170 598,140');
  });
});
