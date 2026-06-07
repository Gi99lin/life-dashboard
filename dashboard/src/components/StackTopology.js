function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function dot(status) {
  if (status === 'running' || status === 'up') return 'up pulse';
  if (status === 'exited' || status === 'down') return 'down';
  return 'warn';
}

function fmtMem(mem) {
  const n = Number(mem) || 0;
  if (n >= 1024) return `${(n / 1024).toFixed(1)}GB`;
  return `${Math.round(n)}MB`;
}

function ring(cpu = 0) {
  const pct = Math.max(0, Math.min(100, Number(cpu) || 0));
  return `<span class="ring2" style="--p:${pct};--gc:var(--green)"><span>${Math.round(pct)}</span></span>`;
}

function serviceNode(service, compact = false) {
  const isApp = service.role === 'app' || service.url;
  const open = service.url ? `<span class="open" data-open="${esc(service.url)}">↗ открыть</span>` : '';
  return `
    <div class="inode ${isApp ? 'app' : ''}">
      <div class="ih">
        <span class="dot ${dot(service.status)}"></span>
        <span class="inm">${esc(service.name)}</span>
        ${!compact ? `<span class="itt">${esc(service.tech || service.role || 'svc')}</span>` : ''}
      </div>
      <div class="im">${compact ? fmtMem(service.mem) : `${ring(service.cpu)}${fmtMem(service.mem)}${open}`}</div>
    </div>`;
}

function networkBox(network, index) {
  const col = index % 2;
  const row = Math.floor(index / 2);
  const left = 330 + col * 290;
  const top = 24 + row * 232;
  const services = network.services || [];
  const app = services.find((service) => service.role === 'app' || service.url) || services[0] || {};
  const data = services.filter((service) => service !== app).slice(0, 3);

  return `
    <div class="net" style="left:${left}px;top:${top}px">
      <span class="nlabel">🖧 ${esc(network.name)}</span>
      ${serviceNode(app)}
      ${data.length ? `<div class="datarow">${data.map((service) => serviceNode(service, true)).join('')}</div>` : ''}
    </div>`;
}

function standaloneNode(node, index) {
  const byRole = {
    internet: { left: 42, top: 220, tag: '', cls: 'ext' },
    gateway: { left: 188, top: 220, tag: 'proxy', cls: '' },
    external: { left: 1012, top: 128, tag: '', cls: 'ext' },
    monitor: { left: 1122, top: 300, tag: 'C', cls: '' },
    vm: { left: 915, top: 414 + index * 4, tag: node.tech || 'VNC', cls: '' },
  };
  const pos = byRole[node.role] || { left: 42, top: 220, tag: '', cls: 'ext' };
  const open = node.open ? `<span class="open" data-open="${esc(node.open)}">↗ открыть</span>` : '';
  const meta = node.role === 'internet' ? '' : node.role === 'vm' ? `через Guacamole · ${open}` : node.role === 'monitor' ? 'наблюдает за всеми' : node.role === 'external' ? 'через OmniRoute' : 'шлюз · TLS';

  return `
    <div class="tnode ${pos.cls}" style="left:${pos.left}px;top:${pos.top}px">
      <div class="th"><span class="dot ${dot(node.status)}"></span><span class="tn">${esc(node.name)}</span>${pos.tag ? `<span class="tt">${esc(pos.tag)}</span>` : ''}</div>
      ${meta ? `<div class="tm">${node.role === 'gateway' ? ring(node.cpu || 8) : ''}${meta}</div>` : ''}
    </div>`;
}

function edgeLayer(topology) {
  const networkEdges = (topology.networks || []).map((network, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = 330 + col * 290;
    const y = 92 + row * 232;
    return `<path class="edge flow" d="M245,220 C${300 + col * 160},${160 + row * 120} ${300 + col * 240},${y} ${x},${y}"/>`;
  }).join('');
  const vmEdges = (topology.standalone || []).filter((node) => node.role === 'vm')
    .map((node, index) => `<path class="edge remote" d="M598,344 C720,420 800,418 ${852 + index * 8},${414 + index * 4}"/>`)
    .join('');

  return `
    <svg class="edges" viewBox="0 0 1240 470" preserveAspectRatio="none">
      <path class="edge flow" d="M74,220 L150,220"/>
      ${networkEdges}
      <path class="edge mon" d="M1118,300 C980,250 820,170 598,140"/>
      <path class="edge mon" d="M1118,300 C1000,330 820,350 598,372"/>
      ${vmEdges}
    </svg>`;
}

export function renderStackTopology(container, topology = {}) {
  if (!container) return;
  const standalone = topology.standalone || [];
  const internet = { name: '🌐 Интернет', role: 'internet', status: 'running' };
  const coreNodes = [
    internet,
    ...standalone.filter((node) => node.role === 'gateway' || node.name === 'nginx'),
    ...standalone.filter((node) => node.role === 'external' && node.name !== internet.name),
    ...standalone.filter((node) => node.role === 'monitor'),
    ...standalone.filter((node) => node.role === 'vm'),
  ];

  container.innerHTML = `
    <div class="topohead">
      <span class="lbl">Топология стека</span>
      <span class="lbl topo-live">живая · поток = трафик · кольцо = нагрузка</span>
      <div class="leg2">
        <span><span class="dot up"></span>работает</span>
        <span><span class="dot warn"></span>idle</span>
        <span><span class="dot down"></span>упал</span>
      </div>
    </div>
    <div class="topo">
      ${edgeLayer(topology)}
      ${coreNodes.map(standaloneNode).join('')}
      ${(topology.networks || []).map(networkBox).join('')}
    </div>
    <div class="foot">парсится из инфры: Docker API · nginx · Guacamole · Netdata · labels</div>`;

  container.querySelectorAll?.('[data-open]').forEach((el) => {
    el.addEventListener('click', (event) => {
      event.stopPropagation();
      window.__openApp?.(el.dataset.open || el.textContent);
    });
  });
}
