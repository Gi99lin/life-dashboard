/**
 * ServerMetrics.js — Grafana-lite server resource monitoring.
 * System gauges (CPU/RAM/Disk/Net) + per-app container cards.
 */

import { Chart } from 'chart.js';

let cpuChart = null;
let netChart = null;
let currentMinutes = 60;
let currentAbort = null;

export async function renderServerMetrics(container) {
  container.innerHTML = `
    <div class="srv-period-selector">
      <button class="period-btn" data-min="10">10м</button>
      <button class="period-btn active" data-min="60">1ч</button>
      <button class="period-btn" data-min="360">6ч</button>
      <button class="period-btn" data-min="1440">24ч</button>
    </div>
    <div class="srv-gauges" id="srvGauges">
      <div style="grid-column: 1/-1; text-align: center; color: var(--fg-muted); padding: 20px;">Загрузка метрик...</div>
    </div>
    <div class="srv-charts-row" id="srvChartsRow"></div>
    <div class="srv-apps" id="srvApps"></div>
  `;

  container.querySelector('.srv-period-selector')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.period-btn');
    if (!btn) return;
    container.querySelectorAll('.srv-period-selector .period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentMinutes = parseInt(btn.dataset.min);
    loadMetrics();
  });

  loadMetrics();
}

async function loadMetrics() {
  // Abort any in-flight request
  if (currentAbort) currentAbort.abort();
  currentAbort = new AbortController();

  try {
    const res = await fetch(`/api/metrics/server?minutes=${currentMinutes}`, {
      signal: currentAbort.signal,
    });
    const data = await res.json();
    renderGauges(data.system);
    renderSystemCharts(data.system);
    renderApps(data.apps);
  } catch (err) {
    if (err.name === 'AbortError') return; // cancelled, ignore
    console.error('[ServerMetrics] Load error:', err);
    const el = document.getElementById('srvGauges');
    if (el) el.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:var(--red); padding:20px;">Ошибка загрузки метрик</div>';
  }
}

function renderGauges(sys) {
  const el = document.getElementById('srvGauges');
  if (!el) return;

  // CPU: latest total usage
  let cpuPct = 0;
  if (sys.cpu?.length) {
    const last = sys.cpu[sys.cpu.length - 1];
    cpuPct = Object.keys(last).filter(k => k !== 't' && k !== 'idle').reduce((s, k) => s + (last[k] || 0), 0);
  }

  // RAM
  let ramPct = 0;
  let ramUsed = 0;
  let ramTotal = 0;
  if (sys.ram) {
    const used = (sys.ram.used || 0);
    const total = Object.values(sys.ram).reduce((s, v) => s + Math.abs(v), 0);
    ramTotal = total;
    ramUsed = used;
    ramPct = total > 0 ? (used / total) * 100 : 0;
  }

  // Disk
  let diskPct = 0;
  if (sys.disk) {
    const used = Math.abs(sys.disk.used || sys.disk.avail || 0);
    const avail = Math.abs(sys.disk.avail || sys.disk.used || 0);
    const total = used + avail;
    diskPct = total > 0 ? (used / total) * 100 : 0;
  }

  // Net throughput (latest)
  let netIn = 0, netOut = 0;
  if (sys.net?.length) {
    const last = sys.net[sys.net.length - 1];
    netIn = Math.abs(last.received || last.InOctets || 0);
    netOut = Math.abs(last.sent || last.OutOctets || 0);
  }

  el.innerHTML = `
    ${gauge('CPU', cpuPct, `${cpuPct.toFixed(1)}%`)}
    ${gauge('RAM', ramPct, `${(ramUsed / 1024).toFixed(1)} / ${(ramTotal / 1024).toFixed(1)} GB`)}
    ${gauge('Диск', diskPct, `${diskPct.toFixed(0)}%`)}
    ${gaugeNet('Сеть', netIn, netOut)}
  `;
}

function gauge(label, pct, sub) {
  const color = pct < 50 ? 'var(--green)' : pct < 80 ? '#dbbc7f' : 'var(--red)';
  return `
    <div class="srv-gauge">
      <div class="srv-gauge-ring" style="--pct: ${Math.min(pct, 100)}; --color: ${color}">
        <span class="srv-gauge-value">${Math.round(pct)}%</span>
      </div>
      <div class="srv-gauge-label">${label}</div>
      <div class="srv-gauge-sub">${sub}</div>
    </div>
  `;
}

function gaugeNet(label, inKb, outKb) {
  const fmt = (v) => {
    if (Math.abs(v) > 1024) return (v / 1024).toFixed(1) + ' MB/s';
    return Math.round(v) + ' KB/s';
  };
  return `
    <div class="srv-gauge">
      <div class="srv-gauge-ring srv-gauge-net">
        <span class="srv-gauge-value" style="font-size: 0.8rem;">↓${fmt(inKb)}<br/>↑${fmt(outKb)}</span>
      </div>
      <div class="srv-gauge-label">${label}</div>
      <div class="srv-gauge-sub">вх / исх</div>
    </div>
  `;
}

function renderSystemCharts(sys) {
  const row = document.getElementById('srvChartsRow');
  if (!row) return;

  row.innerHTML = `
    <div class="chart-card srv-chart-card">
      <div class="chart-header"><h3>CPU</h3></div>
      <canvas id="srvCpuChart"></canvas>
    </div>
    <div class="chart-card srv-chart-card">
      <div class="chart-header"><h3>Сеть</h3></div>
      <canvas id="srvNetChart"></canvas>
    </div>
  `;

  // CPU chart
  if (sys.cpu?.length) {
    const labels = sys.cpu.map(d => {
      const dt = new Date(d.t * 1000);
      return `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
    });
    const userVals = sys.cpu.map(d => d.user || 0);
    const sysVals = sys.cpu.map(d => d.system || 0);
    const ioVals = sys.cpu.map(d => d.iowait || d.softirq || 0);

    if (cpuChart) cpuChart.destroy();
    const ctx = document.getElementById('srvCpuChart')?.getContext('2d');
    if (ctx) {
      cpuChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label: 'User', data: userVals, borderColor: '#a7c080', backgroundColor: '#a7c08020', fill: true, tension: 0.3, pointRadius: 0, borderWidth: 1.5 },
            { label: 'System', data: sysVals, borderColor: '#e69875', backgroundColor: '#e6987520', fill: true, tension: 0.3, pointRadius: 0, borderWidth: 1.5 },
            { label: 'IO Wait', data: ioVals, borderColor: '#e67e80', backgroundColor: '#e67e8015', fill: true, tension: 0.3, pointRadius: 0, borderWidth: 1 },
          ],
        },
        options: chartOpts('% CPU'),
      });
    }
  }

  // Net chart
  if (sys.net?.length) {
    const labels = sys.net.map(d => {
      const dt = new Date(d.t * 1000);
      return `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
    });
    const inVals = sys.net.map(d => Math.abs(d.received || d.InOctets || 0));
    const outVals = sys.net.map(d => Math.abs(d.sent || d.OutOctets || 0));

    if (netChart) netChart.destroy();
    const ctx = document.getElementById('srvNetChart')?.getContext('2d');
    if (ctx) {
      netChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label: 'Входящий', data: inVals, borderColor: '#7fbbb3', backgroundColor: '#7fbbb320', fill: true, tension: 0.3, pointRadius: 0, borderWidth: 1.5 },
            { label: 'Исходящий', data: outVals, borderColor: '#d699b6', backgroundColor: '#d699b620', fill: true, tension: 0.3, pointRadius: 0, borderWidth: 1.5 },
          ],
        },
        options: chartOpts('KB/s'),
      });
    }
  }
}

function chartOpts(yLabel) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: '#9da9a0', boxWidth: 8, font: { size: 10 } } },
      tooltip: {
        backgroundColor: 'rgba(35, 42, 46, 0.95)',
        titleColor: '#d3c6aa', bodyColor: '#9da9a0',
        padding: 10, cornerRadius: 8,
      },
    },
    scales: {
      x: { ticks: { color: '#6b7b72', font: { size: 9 }, maxTicksLimit: 10 }, grid: { display: false } },
      y: { title: { display: true, text: yLabel, color: '#6b7b72', font: { size: 9 } }, ticks: { color: '#6b7b72', font: { size: 9 } }, grid: { color: 'rgba(125,135,125,0.06)' } },
    },
    animation: { duration: 500 },
  };
}

function fmtMem(mb) {
  if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB';
  if (mb >= 1) return mb.toFixed(0) + ' MB';
  return (mb * 1024).toFixed(0) + ' KB';
}

function renderApps(apps) {
  const el = document.getElementById('srvApps');
  if (!el) return;

  if (!apps || Object.keys(apps).length === 0) {
    el.innerHTML = '<div style="color: var(--fg-muted); text-align: center; padding: 20px;">Нет данных о контейнерах</div>';
    return;
  }

  // Find max memory across all apps for relative bar scaling
  const maxMem = Math.max(...Object.values(apps).map(a => a.totalMem), 1);

  let html = '<h3 class="srv-section-title">Приложения</h3><div class="srv-apps-grid">';

  for (const [appKey, app] of Object.entries(apps).sort((a, b) => b[1].containers.length - a[1].containers.length || a[0].localeCompare(b[0]))) {
    const running = app.containers.filter(c => c.state === 'running').length;
    const total = app.containers.length;
    const allUp = running === total;
    const memBarPct = Math.min((app.totalMem / maxMem) * 100, 100);

    html += `
      <div class="srv-app-card ${allUp ? '' : 'srv-app-warn'}">
        <div class="srv-app-header">
          <span class="srv-app-name">${appKey}</span>
          <span class="srv-app-status ${allUp ? 'srv-up' : 'srv-down'}">${running}/${total} online</span>
        </div>
        <div class="srv-app-metrics">
          <div class="srv-app-metric">
            <span class="srv-app-metric-label">CPU</span>
            <div class="srv-app-bar-bg"><div class="srv-app-bar-fill" style="width: ${Math.min(app.totalCpu, 100)}%; background: ${app.totalCpu > 80 ? 'var(--red)' : 'var(--green)'}"></div></div>
            <span class="srv-app-metric-val">${app.totalCpu.toFixed(1)}%</span>
          </div>
          <div class="srv-app-metric">
            <span class="srv-app-metric-label">MEM</span>
            <div class="srv-app-bar-bg"><div class="srv-app-bar-fill" style="width: ${memBarPct.toFixed(0)}%; background: ${memBarPct > 80 ? 'var(--red)' : '#7fbbb3'}"></div></div>
            <span class="srv-app-metric-val">${fmtMem(app.totalMem)}</span>
          </div>
        </div>
        <div class="srv-app-containers">
          ${app.containers.map(c => `
            <div class="srv-cont-row">
              <span class="srv-cont-dot ${c.state === 'running' ? 'srv-dot-up' : 'srv-dot-down'}"></span>
              <span class="srv-cont-name">${c.name}</span>
              <span class="srv-cont-status">${c.status}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  html += '</div>';
  el.innerHTML = html;
}
