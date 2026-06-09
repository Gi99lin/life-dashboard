import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assembleTopology, collectTopology } from '../infraTopology.js';

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

test('collectTopology orders Netdata telemetry and uses newest CPU for host', async () => {
  const calls = [];
  const getNetdataChart = async (chart, after, points) => {
    calls.push({ chart, after, points });
    if (chart === 'system.cpu') {
      return {
        labels: ['time', 'idle'],
        data: [
          [2000, 82],
          [1000, 0],
        ],
      };
    }
    if (chart === 'system.ram') {
      return {
        labels: ['time', 'used', 'free'],
        data: [
          [2000, 7, 3],
          [1000, 5, 5],
        ],
      };
    }
    if (chart === 'system.net') {
      return {
        labels: ['time', 'received', 'sent'],
        data: [
          [2000, 3, -2],
          [1000, 10, -4],
        ],
      };
    }
    return {
      labels: ['time', 'used', 'avail'],
      data: [[2000, 4, 6]],
    };
  };

  const out = await collectTopology({ getNetdataChart, minutes: 10 });

  assert.deepEqual(calls.find((call) => call.chart === 'system.cpu'), {
    chart: 'system.cpu',
    after: -600,
    points: 10,
  });
  assert.deepEqual(out.telemetry.cpu.map((point) => point.t), [1000, 2000]);
  assert.deepEqual(out.telemetry.cpu.map((point) => point.value), [100, 18]);
  assert.equal(out.host.cpu, 18);
});

test('collectTopology calculates CPU from active Netdata dimensions when idle is absent', async () => {
  const getNetdataChart = async (chart) => {
    if (chart === 'system.cpu') {
      return {
        labels: ['time', 'user', 'system', 'iowait'],
        data: [[1000, 7, 3, 2]],
      };
    }
    if (chart === 'system.ram') return { labels: ['time', 'used', 'free'], data: [[1000, 5, 5]] };
    if (chart === 'system.net') return { labels: ['time', 'received', 'sent'], data: [[1000, 1, -1]] };
    return { labels: ['time', 'used', 'avail'], data: [[1000, 1, 9]] };
  };

  const out = await collectTopology({ getNetdataChart, minutes: 10 });

  assert.equal(out.host.cpu, 12);
  assert.deepEqual(out.telemetry.cpu.map((point) => point.value), [12]);
});

test('collectTopology hides Docker container ids as host names unless display name is set', async () => {
  const oldHost = process.env.HOSTNAME;
  const oldDisplay = process.env.HOST_DISPLAY_NAME;
  process.env.HOSTNAME = '6fe0009785c8';
  delete process.env.HOST_DISPLAY_NAME;

  try {
    const out = await collectTopology({ getNetdataChart: null });
    assert.equal(out.host.name, 'homelab');

    process.env.HOST_DISPLAY_NAME = 'marzneshin';
    const named = await collectTopology({ getNetdataChart: null });
    assert.equal(named.host.name, 'marzneshin');
  } finally {
    if (oldHost == null) delete process.env.HOSTNAME;
    else process.env.HOSTNAME = oldHost;
    if (oldDisplay == null) delete process.env.HOST_DISPLAY_NAME;
    else process.env.HOST_DISPLAY_NAME = oldDisplay;
  }
});
