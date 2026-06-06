import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assembleTopology } from '../infraTopology.js';

test('groups containers by network and builds nodes', () => {
  const out = assembleTopology({
    containers: [
      {
        name: 'librechat',
        networks: ['librechat-net'],
        state: 'running',
        image: 'librechat:latest',
        labels: { 'dashboard.purpose': 'Чат с LLM', 'dashboard.tech': 'Node' },
        cpu: 14,
        mem: 672,
      },
      {
        name: 'librechat-pg',
        networks: ['librechat-net'],
        state: 'running',
        image: 'postgres:16',
        cpu: 2,
        mem: 410,
      },
    ],
    networks: ['librechat-net'],
    routes: [{ upstreamHost: 'librechat', url: 'https://chat.x' }],
    vms: [{ name: 'work-vm', protocol: 'vnc' }],
    telemetry: { cpu: [], ram: [], net: [] },
    host: { name: 'srv' },
  });
  const net = out.networks.find((n) => n.name === 'librechat-net');
  assert.equal(net.services.length, 2);
  const app = net.services.find((s) => s.name === 'librechat');
  assert.equal(app.url, 'https://chat.x');
  assert.equal(app.purpose, 'Чат с LLM');
  assert.ok(out.standalone.some((s) => s.role === 'vm' && s.name === 'work-vm'));
  assert.ok(out.edges.some((e) => e.type === 'vnc'));
});
