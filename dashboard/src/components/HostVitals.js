function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function pct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function fmtPct(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${Math.round(n)}%` : esc(value || '0');
}

function row(label, value, color = 'var(--green)') {
  const width = label === 'Сеть' ? 30 : pct(value);
  return `
    <div class="vr">
      <span class="vl">${esc(label)}</span>
      <div class="vb"><i style="width:${width}%;background:${color}"></i></div>
      <span class="vv">${label === 'Сеть' ? esc(value || '0') : fmtPct(value)}</span>
    </div>`;
}

export function renderHostVitals(container, topology = {}) {
  if (!container) return;
  const host = topology.host || {};
  const containers = host.containers || {};
  const running = containers.running ?? 0;
  const total = containers.total ?? 0;

  container.innerHTML = `
    <div class="panel node">
      <div class="nm"><span class="dot up pulse"></span>${esc(host.name || 'homelab')}</div>
      <div class="row"><span>статус</span><b>online${host.uptime ? ` · ${esc(host.uptime)}` : ''}</b></div>
      <div class="row"><span>железо</span><b>${esc(host.vcpu || '—')} vCPU · ${esc(host.ram_total || '—')} GB</b></div>
      <div class="row"><span>ОС</span><b>${esc(host.os || '—')}</b></div>
      <div class="row"><span>контейнеров</span><b>${esc(total)} · ${esc(running)} активны</b></div>
    </div>
    <div class="panel vc">
      ${row('CPU', host.cpu, 'var(--green)')}
      ${row('RAM', host.ram, 'var(--yellow)')}
      ${row('Диск', host.disk, 'var(--yellow)')}
      ${row('Сеть', host.net, 'var(--blue)')}
    </div>`;
}
