import { getGuacConnections } from './guacamole.js';
import { readNginxRoutes } from './nginxRoutes.js';

export function emptyTopology() {
  return {
    host: {},
    telemetry: { cpu: [], ram: [], net: [] },
    networks: [],
    standalone: [],
    edges: [],
  };
}

function serviceRole(container) {
  const explicit = container.labels?.['dashboard.role'];
  if (explicit) return explicit;
  const name = `${container.name || ''} ${container.image || ''}`.toLowerCase();
  if (name.includes('postgres') || name.includes('pg')) return 'db';
  if (name.includes('redis')) return 'cache';
  if (name.includes('mongo') || name.includes('meili')) return 'data';
  if (name.includes('collector') || name.includes('cron')) return 'worker';
  if (name.includes('nginx')) return 'gateway';
  return 'app';
}

function techFor(container) {
  const label = container.labels?.['dashboard.tech'];
  if (label) return label;
  const image = container.image || '';
  const lower = image.toLowerCase();
  if (lower.includes('postgres')) return 'pg';
  if (lower.includes('redis')) return 'Redis';
  if (lower.includes('nginx')) return 'nginx';
  if (lower.includes('guacamole')) return 'Java';
  if (lower.includes('node')) return 'Node';
  return image.split(':')[0].split('/').pop() || 'svc';
}

function routeFor(routes, serviceName) {
  const clean = String(serviceName || '').toLowerCase();
  return routes.find((route) => {
    const upstream = String(route.upstreamHost || '').toLowerCase();
    return upstream === clean || clean.includes(upstream) || upstream.includes(clean);
  });
}

function normalizeService(container, routes) {
  const route = routeFor(routes, container.name);
  return {
    name: container.labels?.['dashboard.name'] || container.name,
    image: container.image,
    tech: techFor(container),
    purpose: container.labels?.['dashboard.purpose'] || container.labels?.['dashboard.group'] || '',
    status: container.state || container.status || 'unknown',
    uptime: container.uptime || container.status || '',
    restarts: container.restarts ?? 0,
    cpu: Math.round((container.cpu || 0) * 10) / 10,
    mem: Math.round((container.mem ?? container.memMB ?? 0) * 10) / 10,
    url: route?.url,
    role: serviceRole(container),
  };
}

export function assembleTopology({
  containers = [],
  networks = [],
  routes = [],
  vms = [],
  telemetry = { cpu: [], ram: [], net: [] },
  host = {},
} = {}) {
  const networkNames = [...new Set([
    ...networks,
    ...containers.flatMap((container) => container.networks || []),
  ])].filter(Boolean).sort((a, b) => a.localeCompare(b));

  const grouped = networkNames.map((name) => ({
    name,
    services: containers
      .filter((container) => (container.networks || []).includes(name))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .map((container) => normalizeService(container, routes)),
  })).filter((network) => network.services.length);

  const standalone = [
    { name: 'nginx', role: 'gateway', status: 'running' },
    { name: 'внешние LLM', id: 'external-llm', role: 'external', status: 'running' },
    { name: 'Netdata', role: 'monitor', status: 'running' },
    ...vms.map((vm) => ({
      name: vm.name,
      role: 'vm',
      status: vm.reachable === false ? 'down' : 'running',
      tech: (vm.protocol || 'vnc').toUpperCase(),
      via: 'guacamole',
      reachable: vm.reachable !== false,
      open: vm.open || process.env.GUAC_URL || '',
    })),
  ];

  const edges = [
    { from: 'internet', to: 'nginx', type: 'http' },
    ...grouped.map((network) => ({ from: 'nginx', to: network.name, type: 'http' })),
    ...vms.map((vm) => ({ from: 'guacamole', to: vm.name, type: vm.protocol || 'vnc' })),
    ...grouped.map((network) => ({ from: 'Netdata', to: network.name, type: 'monitor' })),
  ];

  const hasOmni = containers.some((container) => /omni/i.test(container.name || ''));
  if (hasOmni) edges.push({ from: 'omniroute', to: 'external-llm', type: 'llm' });

  return {
    host: {
      name: host.name || 'homelab',
      uptime: host.uptime || '',
      cpu: host.cpu ?? 0,
      ram: host.ram ?? 0,
      disk: host.disk ?? 0,
      net: host.net ?? 0,
      vcpu: host.vcpu,
      ram_total: host.ram_total,
      os: host.os || '',
      containers: host.containers || {
        total: containers.length,
        running: containers.filter((container) => container.state === 'running').length,
      },
    },
    telemetry,
    networks: grouped,
    standalone,
    edges,
  };
}

function netdataSeries(chart, mapRow) {
  if (!chart?.data?.length) return [];
  const labels = chart.labels || [];
  return chart.data
    .map((row) => mapRow(row, labels))
    .filter(Boolean)
    .sort((a, b) => (Number(a.t) || 0) - (Number(b.t) || 0));
}

async function collectTelemetry(getNetdataChart, minutes) {
  if (!getNetdataChart) return { host: {}, telemetry: { cpu: [], ram: [], net: [] } };
  const after = -minutes * 60;
  const points = Math.min(minutes, 180);
  try {
    const [cpuChart, ramChart, netChart, diskChart] = await Promise.all([
      getNetdataChart('system.cpu', after, points),
      getNetdataChart('system.ram', after, points),
      getNetdataChart('system.net', after, points),
      getNetdataChart('disk_space._', after, 1),
    ]);

    const cpu = netdataSeries(cpuChart, (row, labels) => {
      const idleIndex = labels.indexOf('idle');
      const idle = idleIndex >= 0 ? row[idleIndex] || 0 : 0;
      return { t: row[0], value: Math.max(0, Math.min(100, 100 - idle)) };
    });
    const ram = netdataSeries(ramChart, (row, labels) => {
      const usedIndex = labels.indexOf('used');
      const used = usedIndex >= 0 ? Math.abs(row[usedIndex] || 0) : 0;
      const total = labels.reduce((sum, label, index) => index === 0 ? sum : sum + Math.abs(row[index] || 0), 0);
      return { t: row[0], value: total ? Math.round((used / total) * 100) : 0 };
    });
    const net = netdataSeries(netChart, (row, labels) => {
      const value = labels.reduce((sum, label, index) => index === 0 ? sum : sum + Math.abs(row[index] || 0), 0);
      return { t: row[0], value: Math.round(value) };
    });
    const disk = diskChart?.data?.length ? (() => {
      const labels = diskChart.labels || [];
      const row = diskChart.data[diskChart.data.length - 1];
      const used = Math.abs(row[labels.indexOf('used')] || 0);
      const avail = Math.abs(row[labels.indexOf('avail')] || 0);
      return used + avail ? Math.round((used / (used + avail)) * 100) : 0;
    })() : 0;

    return {
      host: {
        cpu: cpu.at(-1)?.value ?? 0,
        ram: ram.at(-1)?.value ?? 0,
        disk,
        net: net.at(-1)?.value ?? 0,
      },
      telemetry: { cpu, ram, net },
    };
  } catch {
    return { host: {}, telemetry: { cpu: [], ram: [], net: [] } };
  }
}

async function dockerStats(docker, id, state) {
  if (!docker || state !== 'running') return { cpu: 0, mem: 0 };
  try {
    const stats = await docker.getContainer(id).stats({ stream: false });
    const cpuDelta = (stats.cpu_stats?.cpu_usage?.total_usage || 0) - (stats.precpu_stats?.cpu_usage?.total_usage || 0);
    const systemDelta = (stats.cpu_stats?.system_cpu_usage || 0) - (stats.precpu_stats?.system_cpu_usage || 0);
    const cpus = stats.cpu_stats?.online_cpus || 1;
    const cpu = systemDelta > 0 && cpuDelta > 0 ? (cpuDelta / systemDelta) * cpus * 100 : 0;
    const usage = stats.memory_stats?.usage || 0;
    const cache = stats.memory_stats?.stats?.cache || stats.memory_stats?.stats?.inactive_file || 0;
    return { cpu, mem: Math.max(0, (usage - cache) / (1024 * 1024)) };
  } catch {
    return { cpu: 0, mem: 0 };
  }
}

async function collectDocker(docker) {
  if (!docker) return { containers: [], networks: [] };
  try {
    const [rawContainers, rawNetworks] = await Promise.all([
      docker.listContainers({ all: true }),
      docker.listNetworks().catch(() => []),
    ]);
    const containers = await Promise.all(rawContainers.map(async (container) => {
      let inspect = {};
      try {
        inspect = await docker.getContainer(container.Id).inspect();
      } catch {
        inspect = {};
      }
      const name = (container.Names?.[0] || inspect.Name || container.Id || '').replace(/^\//, '');
      const networks = Object.keys(inspect.NetworkSettings?.Networks || container.NetworkSettings?.Networks || {});
      const stats = await dockerStats(docker, container.Id, container.State);
      return {
        id: container.Id,
        name,
        image: container.Image,
        state: container.State,
        status: container.Status,
        labels: container.Labels || inspect.Config?.Labels || {},
        networks,
        restarts: inspect.RestartCount || 0,
        uptime: container.Status,
        ...stats,
      };
    }));
    return {
      containers,
      networks: rawNetworks.map((network) => network.Name).filter(Boolean),
    };
  } catch {
    return { containers: [], networks: [] };
  }
}

export async function collectTopology({ docker, getNetdataChart, minutes = 60 } = {}) {
  try {
    const [{ containers, networks }, routes, vms, telemetryData] = await Promise.all([
      collectDocker(docker),
      Promise.resolve(readNginxRoutes()),
      getGuacConnections(),
      collectTelemetry(getNetdataChart, minutes),
    ]);

    return assembleTopology({
      containers,
      networks,
      routes,
      vms,
      telemetry: telemetryData.telemetry,
      host: {
        name: process.env.HOSTNAME || 'homelab',
        ...telemetryData.host,
      },
    });
  } catch {
    return emptyTopology();
  }
}
