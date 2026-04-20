/**
 * Life Dashboard API — Express server
 *
 * POST /api/entry  — saves mood, food, note to metrics.json + Obsidian daily note
 * GET  /api/forecast — returns 7-day weather forecast
 */

import express from 'express';
import cors from 'cors';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server } from 'socket.io';
import Docker from 'dockerode';

import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

let docker;
try {
  docker = new Docker({ socketPath: '/var/run/docker.sock' });
} catch(e) {
  console.warn("Docker socket not available", e.message);
}

const DASHBOARD_PASS = process.env.DASHBOARD_PASS;
const SESSION_SECRET = crypto.randomBytes(32).toString('hex');

function makeSessionToken() {
  return crypto.createHmac('sha256', SESSION_SECRET).update(DASHBOARD_PASS || '').digest('hex');
}

function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach(c => {
    const [key, ...v] = c.trim().split('=');
    if (key) cookies[key] = decodeURIComponent(v.join('='));
  });
  return cookies;
}

function isAuthed(req) {
  if (!DASHBOARD_PASS) return true;
  const cookies = parseCookies(req.headers.cookie);
  return cookies.dashboard_session === makeSessionToken();
}

app.use(cors());
app.use(express.json());

// Login endpoint — sets httpOnly session cookie
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (!DASHBOARD_PASS || password === DASHBOARD_PASS) {
    res.setHeader('Set-Cookie',
      `dashboard_session=${makeSessionToken()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 24 * 3600}`
    );
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Неверный пароль' });
});

// Auth check endpoint
app.get('/api/auth-check', (req, res) => {
  if (isAuthed(req)) return res.json({ ok: true });
  res.status(401).json({ error: 'Unauthorized' });
});

// Protect all API routes (except login)
app.use('/api', (req, res, next) => {
  if (req.path === '/login' || req.path === '/auth-check') return next();
  if (isAuthed(req)) return next();
  res.status(401).json({ error: 'Unauthorized' });
});

// Socket.io auth via cookie
io.use((socket, next) => {
  if (!DASHBOARD_PASS) return next();
  const cookies = parseCookies(socket.handshake.headers.cookie);
  if (cookies.dashboard_session === makeSessionToken()) return next();
  next(new Error('Unauthorized'));
});

// ---- Docker Polling ----
const dockerState = { containers: [], activeAgent: null, lastAgentTime: null };

const NETDATA_URL = process.env.NETDATA_URL || 'http://172.17.0.1:19999';

async function getNetdata(chartName) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${NETDATA_URL}/api/v1/data?chart=${chartName}&points=1`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return 0;
    const data = await res.json();
    return data.data[0][1] || 0; 
  } catch {
    return 0;      
  }
}

async function pollDocker() {
  if (!docker) return;
  try {
    const containers = await docker.listContainers({ all: true });
    const targets = ['openclaw', 'omniroute', 'life-dashboard-api', 'hrBot'];
    
    const promises = containers.map(async c => {
      const name = c.Names[0].replace('/', '');
      const targetName = targets.find(t => name.includes(t));
      if (!targetName) return null;

      // Netdata automatically resolves docker container names for cgroup plugins
      const [cpu, mem] = await Promise.all([
         getNetdata(`cgroup_${name}.cpu_limit`),
         getNetdata(`cgroup_${name}.mem_usage_limit`)
      ]);
      
      return { name: targetName, state: c.State, status: c.Status, cpu, mem };
    });

    const results = await Promise.all(promises);
    dockerState.containers = results.filter(Boolean);
    io.emit('docker_pulse', dockerState);
  } catch(e) {
    console.error("Docker poll error", e.message);
  }
}

async function tailOpenclawLogs() {
  if (!docker) return;
  try {
    const containers = await docker.listContainers({ all: true });
    const oc = containers.find(c => c.Names[0].includes('openclaw'));
    if (!oc) return;

    const container = docker.getContainer(oc.Id);
    const logStream = await container.logs({ follow: true, stdout: true, stderr: true, tail: 100 });
    
    logStream.on('data', chunk => {
      const line = chunk.toString();
      const match = line.match(/runId=announce:v1:agent:([a-zA-Z0-9_\-]+):subagent/);
      if (match) {
        dockerState.activeAgent = match[1];
        dockerState.lastAgentTime = Date.now();
        io.emit('agent_pulse', dockerState);
      }
    });
  } catch(e) {
    console.warn("Could not tail OpenClaw logs", e.message);
  }
}

setInterval(() => {
  if (dockerState.activeAgent && Date.now() - dockerState.lastAgentTime > 120000) {
     dockerState.activeAgent = null;
     io.emit('agent_pulse', dockerState);
  }
  pollDocker();
}, 5000);

// ---- Server Metrics (Netdata Proxy) ----

async function getNetdataChart(chart, after = -3600, points = 60) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${NETDATA_URL}/api/v1/data?chart=${chart}&after=${after}&points=${points}&format=json`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

app.get('/api/metrics/server', async (req, res) => {
  try {
    const minutes = Math.min(parseInt(req.query.minutes) || 60, 1440);
    const after = -minutes * 60;
    const points = Math.min(minutes, 120);

    // System-wide metrics
    const [cpuData, ramData, netData, diskData] = await Promise.all([
      getNetdataChart('system.cpu', after, points),
      getNetdataChart('system.ram', after, points),
      getNetdataChart('system.net', after, points),
      getNetdataChart('disk_space._', after, 1),
    ]);

    const system = {
      cpu: null,
      ram: null,
      net: null,
      disk: null,
    };

    if (cpuData?.data) {
      const labels = cpuData.labels;
      system.cpu = cpuData.data.map(row => {
        const obj = { t: row[0] };
        labels.forEach((l, i) => { if (i > 0) obj[l] = row[i]; });
        return obj;
      });
    }

    if (ramData?.data?.length) {
      const labels = ramData.labels;
      const last = ramData.data[ramData.data.length - 1];
      const obj = {};
      labels.forEach((l, i) => { if (i > 0) obj[l] = Math.round(last[i]); });
      system.ram = obj;
    }

    if (netData?.data) {
      const labels = netData.labels;
      system.net = netData.data.map(row => {
        const obj = { t: row[0] };
        labels.forEach((l, i) => { if (i > 0) obj[l] = row[i]; });
        return obj;
      });
    }

    if (diskData?.data?.length) {
      const labels = diskData.labels;
      const last = diskData.data[diskData.data.length - 1];
      const obj = {};
      labels.forEach((l, i) => { if (i > 0) obj[l] = Math.round(last[i]); });
      system.disk = obj;
    }

    // Per-container metrics via Docker API (not Netdata — more reliable)
    const apps = {};
    if (docker) {
      try {
        const containers = await docker.listContainers({ all: true });

        // Resolve app group for a container name
        function resolveAppKey(name) {
          const n = name.toLowerCase();
          if (n.includes('life-dashboard')) return 'life-dashboard';
          if (n.includes('openclaw') || n.includes('spawn')) return 'openclaw';
          if (n.includes('omniroute')) return 'omniroute';
          if (n.includes('nextcloud')) return 'nextcloud';
          if (n.includes('hrbot') || n.includes('hrbot_')) return 'hrbot';
          if (n.includes('chat-') || n === 'librechat') return 'librechat';
          if (n.includes('marz')) return 'marzneshin';
          if (n.includes('nginx')) return 'nginx';
          if (n.includes('syncthing')) return 'syncthing';
          if (n.includes('trueconf')) return 'trueconf';
          return name.split(/[-_]/)[0];
        }

        // Get stats from Docker API for running containers (parallel)
        const enriched = await Promise.all(
          containers.map(async (c) => {
            const name = c.Names[0].replace('/', '');
            let cpu = 0, memMB = 0;

            if (c.State === 'running') {
              try {
                const container = docker.getContainer(c.Id);
                const stats = await container.stats({ stream: false });

                // CPU % (same formula as `docker stats`)
                const cpuDelta = (stats.cpu_stats?.cpu_usage?.total_usage || 0) -
                                 (stats.precpu_stats?.cpu_usage?.total_usage || 0);
                const systemDelta = (stats.cpu_stats?.system_cpu_usage || 0) -
                                    (stats.precpu_stats?.system_cpu_usage || 0);
                const numCpus = stats.cpu_stats?.online_cpus || 1;
                if (systemDelta > 0 && cpuDelta > 0) {
                  cpu = (cpuDelta / systemDelta) * numCpus * 100;
                }

                // Memory (usage minus cache, in MB)
                const usage = stats.memory_stats?.usage || 0;
                const cache = stats.memory_stats?.stats?.cache || stats.memory_stats?.stats?.inactive_file || 0;
                memMB = (usage - cache) / (1024 * 1024);
              } catch (e) {
                // stats failed — leave at 0
              }
            }

            return {
              name,
              appKey: resolveAppKey(name),
              state: c.State,
              status: c.Status,
              cpu: Math.round(cpu * 100) / 100,
              memMB: Math.round(memMB * 10) / 10,
            };
          })
        );

        // Group results
        for (const c of enriched) {
          if (!apps[c.appKey]) {
            apps[c.appKey] = { containers: [], totalCpu: 0, totalMem: 0 };
          }
          apps[c.appKey].containers.push(c);
          apps[c.appKey].totalCpu += c.cpu;
          apps[c.appKey].totalMem += c.memMB;
        }
      } catch (e) {
        console.error('Container metrics error:', e.message);
      }
    }

    res.json({ system, apps });
  } catch (err) {
    console.error('Server metrics error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---- Config ----
const VAULT_PATH = process.env.VAULT_PATH || '/Users/ivanakimkin/Documents/1';
const METRICS_PATH = process.env.METRICS_PATH || join(__dirname, '..', 'data', 'metrics.json');

// ---- Helpers ----

function loadMetrics() {
  try {
    return JSON.parse(readFileSync(METRICS_PATH, 'utf-8'));
  } catch {
    return { days: {}, meta: {} };
  }
}

function saveMetrics(data) {
  data.meta.last_updated = new Date().toISOString();
  writeFileSync(METRICS_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Parse YAML frontmatter from an Obsidian daily note file.
 * Returns { mood, food_before_20, sleep_goal, project_work } or null.
 */
function parseFrontmatter(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!match) return null;

    const result = {};
    for (const line of match[1].split('\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');

      if (key === 'mood' && val && val !== '') {
        const num = parseInt(val);
        if (!isNaN(num)) result.mood = num;
      } else if (key === 'Питание_до_20') {
        result.food_before_20 = val.toLowerCase() === 'true';
      } else if (key === 'Сон_8ч_и_до_9') {
        result.sleep_goal = val.toLowerCase() === 'true';
      } else if (key === 'Работа_над_проектом') {
        result.project_work = val.toLowerCase() === 'true';
      }
    }
    return Object.keys(result).length ? result : null;
  } catch {
    return null;
  }
}

/**
 * Sync recent daily notes from Obsidian vault into metrics.json.
 * Scans last `daysBack` days of daily notes and updates manual fields.
 */
function syncFromVault(daysBack = 14) {
  const metrics = loadMetrics();
  const today = new Date();
  let updated = 0;

  for (let i = 0; i < daysBack; i++) {
    const dt = new Date(today);
    dt.setDate(dt.getDate() - i);
    const dateStr = dt.toISOString().slice(0, 10);

    const notePath = findDailyNote(dateStr);
    if (!existsSync(notePath)) continue;

    const fm = parseFrontmatter(notePath);
    if (!fm) continue;

    // Ensure day entry exists
    if (!metrics.days[dateStr]) {
      const weekdays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
      metrics.days[dateStr] = {
        date: dateStr,
        weekday: weekdays[dt.getDay()],
        week_iso: getISOWeek(dateStr),
      };
    }
    if (!metrics.days[dateStr].manual) {
      metrics.days[dateStr].manual = {};
    }

    // Update from frontmatter (Obsidian is source of truth)
    if (fm.mood != null) metrics.days[dateStr].manual.mood = fm.mood;
    if (fm.food_before_20 != null) metrics.days[dateStr].manual.food_before_20 = fm.food_before_20;

    updated++;
  }

  if (updated > 0) {
    saveMetrics(metrics);
    console.log(`🔄 Synced ${updated} days from Obsidian vault`);
  }

  return metrics;
}

/**
 * Find the daily note file path for a given date.
 * Tries multiple directory structures.
 */
function findDailyNote(dateStr) {
  const [year, monthNum] = dateStr.split('-');
  const monthNames = {
    '01': '01-Январь', '02': '02-Февраль', '03': '03-Март',
    '04': '04-Апрель', '05': '05-Май', '06': '06-Июнь',
    '07': '07-Июль', '08': '08-Август', '09': '09-Сентябрь',
    '10': '10-Октябрь', '11': '11-Ноябрь', '12': '12-Декабрь',
  };

  const candidates = [
    // New structure: Daily/YYYY/MM-Месяц/YYYY-MM-DD.md
    join(VAULT_PATH, 'Жизнь', 'Daily', year, monthNames[monthNum] || '', `${dateStr}.md`),
    // Old/flat structure: Daily/YYYY-MM-DD.md
    join(VAULT_PATH, 'Жизнь', 'Daily', `${dateStr}.md`),
  ];

  for (const path of candidates) {
    if (existsSync(path)) return path;
  }

  // Return the flat path for creating new files
  return join(VAULT_PATH, 'Жизнь', 'Daily', `${dateStr}.md`);
}

/**
 * Update (or create) daily note frontmatter.
 */
function updateDailyNote(dateStr, entry) {
  const filePath = findDailyNote(dateStr);
  let content = '';

  if (existsSync(filePath)) {
    content = readFileSync(filePath, 'utf-8');
  }

  // Parse existing frontmatter
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);

  const fm = {
    mood: entry.mood ?? '',
    'Сон_8ч_и_до_9': false,
    'Питание_до_20': entry.food_before_20 ?? false,
    'Работа_над_проектом': false,
  };

  if (fmMatch) {
    // Preserve existing values we don't overwrite
    const existing = fmMatch[1];
    for (const line of existing.split('\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');

      if (key === 'Сон_8ч_и_до_9') {
        fm['Сон_8ч_и_до_9'] = val === 'true';
      } else if (key === 'Работа_над_проектом') {
        fm['Работа_над_проектом'] = val === 'true';
      }
    }

    // Overwrite only what we have
    if (entry.mood != null) fm.mood = entry.mood;
    if (entry.food_before_20 != null) fm['Питание_до_20'] = entry.food_before_20;

    // Rebuild frontmatter
    const newFm = [
      '---',
      `mood: "${fm.mood}"`,
      `Сон_8ч_и_до_9: ${fm['Сон_8ч_и_до_9']}`,
      `Питание_до_20: ${fm['Питание_до_20']}`,
      `Работа_над_проектом: ${fm['Работа_над_проектом']}`,
      '---',
    ].join('\n');

    // Replace frontmatter, keep body
    const body = content.slice(fmMatch[0].length);
    let newContent = newFm + body;

    // Append note if provided and body doesn't already have it
    if (entry.note && !body.includes(entry.note)) {
      newContent = newContent.trimEnd() + '\n\n> ' + entry.note + '\n';
    }

    writeFileSync(filePath, newContent, 'utf-8');
  } else {
    // Create new file with frontmatter
    const newContent = [
      '---',
      `mood: "${entry.mood || ''}"`,
      `Сон_8ч_и_до_9: false`,
      `Питание_до_20: ${entry.food_before_20 ?? false}`,
      `Работа_над_проектом: false`,
      '---',
      '',
      `## 📅 ${dateStr}`,
      '',
      entry.note ? `> ${entry.note}` : '',
      '',
    ].join('\n');

    writeFileSync(filePath, newContent, 'utf-8');
  }

  return filePath;
}

// ---- Routes ----

/**
 * GET /api/schedule
 * Parses today's Markdown schedule table and returns current/next activity
 */
app.get('/api/schedule', (req, res) => {
  try {
    const dateStr = req.query.date || new Date().toISOString().slice(0, 10);

    // Try structured path first, then flat
    const [year, monthNum] = dateStr.split('-');
    const monthNames = {
      '01': '01-Январь', '02': '02-Февраль', '03': '03-Март',
      '04': '04-Апрель', '05': '05-Май', '06': '06-Июнь',
      '07': '07-Июль', '08': '08-Август', '09': '09-Сентябрь',
      '10': '10-Октябрь', '11': '11-Ноябрь', '12': '12-Декабрь',
    };

    const candidates = [
      join(VAULT_PATH, 'Жизнь', 'Daily', year, monthNames[monthNum] || '', `${dateStr}-schedules.md`),
      join(VAULT_PATH, 'Жизнь', 'Daily', `${dateStr}-schedules.md`),
    ];

    let schedulePath = null;
    for (const p of candidates) {
      if (existsSync(p)) { schedulePath = p; break; }
    }

    if (!schedulePath) return res.json({ current: null, next: null, blocks: [] });

    const content = readFileSync(schedulePath, 'utf-8');
    const lines = content.split('\n');
    let blocks = [];
    for (const line of lines) {
       const m = line.match(/\|\s*(\d{2}:\d{2})-(\d{2}:\d{2})\s*\|\s*(.*?)\s*\|/);
       if (m) {
           blocks.push({ start: m[1], end: m[2], activity: m[3].trim() });
       }
    }
    
    const now = new Date();
    const curHm = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
    
    let current = null;
    let next = null;
    
    for (let i=0; i<blocks.length; i++) {
        const b = blocks[i];
        if (curHm >= b.start && curHm < b.end) {
            current = b;
            next = blocks[i+1] || null;
            break;
        } else if (b.start > curHm && !current) {
            next = b;
            break;
        }
    }
    
    res.json({ current, next, blocks, date: dateStr });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/schedule
 * Body: { date: "2026-04-19", blocks: [{ start, end, activity }] }
 * Writes the schedule to the Obsidian vault as a markdown table.
 */
app.post('/api/schedule', (req, res) => {
  try {
    const { date, blocks } = req.body;
    if (!date || !blocks) return res.status(400).json({ error: 'date and blocks required' });

    // Determine file path
    const [year, monthNum] = date.split('-');
    const monthNames = {
      '01': '01-Январь', '02': '02-Февраль', '03': '03-Март',
      '04': '04-Апрель', '05': '05-Май', '06': '06-Июнь',
      '07': '07-Июль', '08': '08-Август', '09': '09-Сентябрь',
      '10': '10-Октябрь', '11': '11-Ноябрь', '12': '12-Декабрь',
    };

    // Try structured path first
    const structuredDir = join(VAULT_PATH, 'Жизнь', 'Daily', year, monthNames[monthNum] || '');
    const structuredPath = join(structuredDir, `${date}-schedules.md`);
    const flatPath = join(VAULT_PATH, 'Жизнь', 'Daily', `${date}-schedules.md`);

    let filePath;
    if (existsSync(structuredPath)) {
      filePath = structuredPath;
    } else if (existsSync(flatPath)) {
      filePath = flatPath;
    } else {
      // Create new file in flat structure
      filePath = flatPath;
    }

    // Build markdown table
    const dt = new Date(date + 'T12:00:00');
    const weekdays = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    const title = `# ${weekdays[dt.getDay()].toUpperCase()} — ${dt.getDate()} ${months[dt.getMonth()]} ${dt.getFullYear()}`;

    let table = '| Время | Активность | Статус |\n|-------|------------|--------|\n';
    for (const b of blocks) {
      table += `| ${b.start}-${b.end} | ${b.activity} | |\n`;
    }

    // If file exists, try to preserve non-table content
    let content;
    if (existsSync(filePath)) {
      const existing = readFileSync(filePath, 'utf-8');
      // Replace table portion: everything between the header line with '|' and end of consecutive '|' lines
      const lines = existing.split('\n');
      const preTable = [];
      const postTable = [];
      let inTable = false;
      let pastTable = false;

      for (const line of lines) {
        if (!inTable && !pastTable && line.trim().startsWith('|')) {
          inTable = true;
          continue; // skip old table lines
        }
        if (inTable && !line.trim().startsWith('|')) {
          inTable = false;
          pastTable = true;
          postTable.push(line);
          continue;
        }
        if (inTable) continue; // skip old table lines
        if (pastTable) {
          postTable.push(line);
        } else {
          preTable.push(line);
        }
      }

      content = preTable.join('\n') + '\n' + table + (postTable.length ? '\n' + postTable.join('\n') : '');
    } else {
      content = title + '\n\n' + table;
    }

    writeFileSync(filePath, content.trim() + '\n', 'utf-8');
    console.log(`📋 Schedule saved: ${filePath} (${blocks.length} blocks)`);

    res.json({ ok: true, date, path: filePath });
  } catch (err) {
    console.error('Schedule save error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/entry?date=YYYY-MM-DD
 * Returns existing mood/food/note data for a specific day
 */
app.get('/api/entry', (req, res) => {
  try {
    const dateStr = req.query.date || new Date().toISOString().slice(0, 10);
    const metrics = loadMetrics();
    const day = metrics.days[dateStr];

    if (!day || !day.manual) {
      return res.json({ date: dateStr, mood: null, food_before_20: false, note: '' });
    }

    res.json({
      date: dateStr,
      mood: day.manual.mood ?? null,
      food_before_20: day.manual.food_before_20 ?? false,
      note: day.manual.note ?? '',
    });
  } catch (err) {
    console.error('GET entry error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/entry
 * Body: { date, mood, food_before_20, note }
 */
app.post('/api/entry', (req, res) => {
  try {
    const { date, mood, food_before_20, note } = req.body;
    const dateStr = date || new Date().toISOString().slice(0, 10);

    console.log(`📝 Entry for ${dateStr}: mood=${mood}, food=${food_before_20}, note="${note || ''}"`);

    // 1. Update metrics.json
    const metrics = loadMetrics();
    if (!metrics.days[dateStr]) {
      const dt = new Date(dateStr);
      const weekdays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
      metrics.days[dateStr] = {
        date: dateStr,
        weekday: weekdays[dt.getDay()],
        week_iso: getISOWeek(dateStr),
      };
    }

    if (!metrics.days[dateStr].manual) {
      metrics.days[dateStr].manual = {};
    }

    if (mood != null) metrics.days[dateStr].manual.mood = mood;
    if (food_before_20 != null) metrics.days[dateStr].manual.food_before_20 = food_before_20;
    if (note) metrics.days[dateStr].manual.note = note;

    saveMetrics(metrics);

    // 2. Update Obsidian daily note
    const notePath = updateDailyNote(dateStr, { mood, food_before_20, note });
    console.log(`   → metrics.json updated`);
    console.log(`   → ${notePath} updated`);

    // 3. Copy to dashboard public dir
    const publicPath = join(__dirname, '..', 'dashboard', 'public', 'data', 'metrics.json');
    try { writeFileSync(publicPath, JSON.stringify(metrics, null, 2), 'utf-8'); } catch {}

    res.json({ ok: true, date: dateStr });
  } catch (err) {
    console.error('Entry error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/forecast
 * Returns 7-day weather forecast from Open-Meteo with hourly data for the first 2 days
 */
app.get('/api/forecast', async (req, res) => {
  try {
    const lat = 55.7558;
    const lon = 37.6173;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_sum,sunrise,sunset&hourly=temperature_2m,weathercode&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,surface_pressure&timezone=auto&forecast_days=7`;

    const response = await fetch(url);
    const data = await response.json();

    const WMO = {
      0: ['Ясно', '☀️'], 1: ['Малооблачно', '🌤'], 2: ['Облачно', '⛅'], 3: ['Пасмурно', '☁️'],
      45: ['Туман', '🌫'], 48: ['Изморось', '🌫'],
      51: ['Морось', '🌧'], 53: ['Морось', '🌧'], 55: ['Сильная морось', '🌧'],
      56: ['Ледяная морось', '🌧'], 57: ['Ледяная морось', '🌧'],
      61: ['Дождь', '🌧'], 63: ['Умеренный дождь', '🌧'], 65: ['Сильный дождь', '🌧'],
      66: ['Ледяной дождь', '🌧'], 67: ['Ледяной дождь', '🌧'],
      71: ['Снег', '🌨'], 73: ['Умеренный снег', '🌨'], 75: ['Сильный снег', '🌨'],
      77: ['Снежная крупа', '🌨'],
      80: ['Ливень', '🌧'], 81: ['Сильный ливень', '🌧'], 82: ['Штормовой ливень', '🌧'],
      85: ['Снежный ливень', '🌨'], 86: ['Снежный ливень', '🌨'],
      95: ['Гроза', '⛈'], 96: ['Гроза с градом', '⛈'], 99: ['Гроза', '⛈'],
    };

    const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const daily = data.daily || {};
    const hourlyRaw = data.hourly || {};

    const days = (daily.time || []).map((date, i) => {
      const code = daily.weathercode?.[i] ?? 0;
      const [desc, icon] = WMO[code] || ['?', '❓'];
      const dt = new Date(date + 'T12:00:00');
      return {
        date,
        weekday: WEEKDAYS[dt.getDay()],
        temp_max: daily.temperature_2m_max?.[i],
        temp_min: daily.temperature_2m_min?.[i],
        precip: daily.precipitation_sum?.[i],
        sunrise: daily.sunrise?.[i],
        sunset: daily.sunset?.[i],
        desc,
        icon,
      };
    });

    const hourly = (hourlyRaw.time || []).map((timeStr, i) => {
      const code = hourlyRaw.weathercode?.[i] ?? 0;
      const [, icon] = WMO[code] || ['?', '❓'];
      return {
        time: timeStr, // format: "YYYY-MM-DDTHH:00"
        temp: hourlyRaw.temperature_2m?.[i],
        icon
      };
    });

    const currentRaw = data.current || {};
    const current = {
      temp: currentRaw.temperature_2m,
      feels_like: currentRaw.apparent_temperature,
      humidity: currentRaw.relative_humidity_2m,
      wind: currentRaw.wind_speed_10m,
      pressure: currentRaw.surface_pressure
    };

    res.json({ days, hourly, current });
  } catch (err) {
    console.error('Forecast error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/sync
 * Reads recent Obsidian daily notes and updates metrics.json.
 * Returns the updated metrics.
 */
app.get('/api/sync', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 14;
    const metrics = syncFromVault(days);
    res.json(metrics);
  } catch (err) {
    console.error('Sync error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/metrics
 * Returns current metrics.json (without syncing).
 */
app.get('/api/metrics', (req, res) => {
  try {
    res.json(loadMetrics());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function getISOWeek(dateStr) {
  const dt = new Date(dateStr);
  const d = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

// ---- Start ----
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`🌿 Life Dashboard API on http://localhost:${PORT}`);
  console.log(`   Vault: ${VAULT_PATH}`);
  console.log(`   Metrics: ${METRICS_PATH}`);

  // Initial sync on startup
  try {
    syncFromVault(14);
  } catch (e) {
    console.warn('Initial vault sync failed:', e.message);
  }
  
  // Start docker polling and log tailing
  setTimeout(tailOpenclawLogs, 3000);
  pollDocker();
});
