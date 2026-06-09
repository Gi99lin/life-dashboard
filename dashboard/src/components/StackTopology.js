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

function netPos(index) {
  const col = index % 2;
  const row = Math.floor(index / 2);
  return {
    left: 330 + col * 290,
    top: 24 + row * 232,
    cx: 330 + col * 290,
    cy: 92 + row * 232,
  };
}

function findNetworkIndex(topology, pattern) {
  return (topology.networks || []).findIndex((network) => {
    const haystack = `${network.name || ''} ${(network.services || []).map((service) => service.name || '').join(' ')}`;
    return pattern.test(haystack);
  });
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
  const { left, top } = netPos(index);
  const services = network.services || [];
  const app = services.find((service) => service.role === 'app' || service.url) || services[0] || {};
  const data = services.filter((service) => service !== app).slice(0, 3);

  return `
    <div class="net" style="left:${left}px;top:${top}px">
      <span class="nlabel"><span class="nkind">NET</span>${esc(network.name)}</span>
      ${serviceNode(app)}
      ${data.length ? `<div class="datarow">${data.map((service) => serviceNode(service, true)).join('')}</div>` : ''}
    </div>`;
}

function standalonePosition(node, index, topology = {}) {
  const omniIndex = findNetworkIndex(topology, /omni/i);
  const monitorIndex = Math.max(0, (topology.networks || []).length - 1);
  const externalAnchor = omniIndex >= 0 ? netPos(omniIndex) : netPos(0);
  const monitorAnchor = netPos(monitorIndex);
  const byRole = {
    internet: { left: 42, top: 220, tag: '', cls: 'ext' },
    gateway: { left: 188, top: 220, tag: 'proxy', cls: '' },
    external: { left: 930, top: externalAnchor.cy, tag: 'LLM', cls: 'ext' },
    monitor: { left: 930, top: Math.max(300, monitorAnchor.cy), tag: 'obs', cls: '' },
    vm: { left: 915, top: 414 + index * 4, tag: node.tech || 'VNC', cls: '' },
  };
  return byRole[node.role] || { left: 42, top: 220, tag: '', cls: 'ext' };
}

function standaloneNode(node, index, topology) {
  const pos = standalonePosition(node, index, topology);
  const open = node.open ? `<span class="open" data-open="${esc(node.open)}">↗ открыть</span>` : '';
  const meta = node.role === 'internet' ? '' : node.role === 'vm' ? `через Guacamole · ${open}` : node.role === 'monitor' ? 'наблюдает за всеми' : node.role === 'external' ? 'через OmniRoute' : 'шлюз · TLS';

  return `
    <div class="tnode ${pos.cls}" style="left:${pos.left}px;top:${pos.top}px">
      <div class="th"><span class="dot ${dot(node.status)}"></span><span class="tn">${esc(node.name)}</span>${pos.tag ? `<span class="tt">${esc(pos.tag)}</span>` : ''}</div>
      ${meta ? `<div class="tm">${node.role === 'gateway' ? ring(node.cpu || 8) : ''}${meta}</div>` : ''}
    </div>`;
}

function canvasSize(topology) {
  const rows = Math.ceil((topology.networks || []).length / 2);
  return {
    width: 1240,
    height: Math.max(470, 192 + rows * 232),
  };
}

function edgeLayer(topology, size) {
  const networkEdges = (topology.networks || []).map((network, index) => {
    const { cx, cy } = netPos(index);
    const bendX = 300 + (index % 2) * 160;
    const bendY = 160 + Math.floor(index / 2) * 120;
    return `<path class="edge flow" d="M245,220 C${bendX},${bendY} ${cx - 30},${cy} ${cx},${cy}"/>`;
  }).join('');
  const vmEdges = (topology.standalone || []).filter((node) => node.role === 'vm')
    .map((node, index) => `<path class="edge remote" d="M598,344 C720,420 800,418 ${852 + index * 8},${414 + index * 4}"/>`)
    .join('');
  const monitor = (topology.standalone || []).find((node) => node.role === 'monitor');
  const monitorPos = monitor ? standalonePosition(monitor, 0, topology) : null;
  const monitorEdges = monitorPos ? (topology.networks || []).map((network, index) => {
    const { cx, cy } = netPos(index);
    return `<path class="edge mon" d="M${monitorPos.left - 48},${monitorPos.top} C${monitorPos.left - 160},${monitorPos.top} ${cx + 128},${cy + 54} ${cx + 95},${cy + 54}"/>`;
  }).join('') : '';
  const external = (topology.standalone || []).find((node) => node.role === 'external');
  const externalPos = external ? standalonePosition(external, 0, topology) : null;
  const omniIndex = findNetworkIndex(topology, /omni/i);
  const llmAnchor = netPos(omniIndex >= 0 ? omniIndex : 0);
  const llmEdge = externalPos ? `<path class="edge llm" d="M${llmAnchor.cx + 128},${llmAnchor.cy} C${llmAnchor.cx + 230},${llmAnchor.cy} ${externalPos.left - 120},${externalPos.top} ${externalPos.left - 52},${externalPos.top}"/>` : '';

  return `
    <svg class="edges" viewBox="0 0 ${size.width} ${size.height}" preserveAspectRatio="none">
      <path class="edge flow" d="M74,220 L150,220"/>
      ${networkEdges}
      ${llmEdge}
      ${monitorEdges}
      ${vmEdges}
    </svg>`;
}

export function renderStackTopology(container, topology = {}) {
  if (!container) return;
  const standalone = topology.standalone || [];
  const size = canvasSize(topology);
  const internet = { name: '🌐 Интернет', role: 'internet', status: 'running' };
  const coreNodes = [
    internet,
    ...standalone.filter((node) => node.role === 'gateway' || node.name === 'nginx'),
    ...standalone.filter((node) => node.role === 'external' && node.name !== internet.name),
    ...standalone.filter((node) => node.role === 'monitor'),
    ...standalone.filter((node) => node.role === 'vm'),
  ];

  container.innerHTML = `
    <div class="topo-frame">
      <div class="topohead">
        <span class="lbl">Топология стека</span>
        <span class="lbl topo-live">живая · поток = трафик · кольцо = нагрузка</span>
        <div class="topo-controls" aria-label="Масштаб карты">
          <button class="topo-ctl" data-topo-zoom="out" type="button" aria-label="Уменьшить">−</button>
          <button class="topo-ctl" data-topo-zoom="reset" type="button" aria-label="Сбросить масштаб">100</button>
          <button class="topo-ctl" data-topo-zoom="in" type="button" aria-label="Увеличить">+</button>
          <button class="topo-ctl wide" data-topo-fullscreen type="button" aria-label="Открыть карту на весь экран">FULL</button>
        </div>
        <div class="leg2">
          <span><span class="dot up"></span>работает</span>
          <span><span class="dot warn"></span>idle</span>
          <span><span class="dot down"></span>упал</span>
        </div>
      </div>
      <div class="topo" tabindex="0" aria-label="Прокручиваемая карта инфраструктуры">
        <div class="topo-canvas" style="width:${size.width}px;height:${size.height}px" data-base-width="${size.width}" data-base-height="${size.height}">
          <div class="topo-plane" style="width:${size.width}px;height:${size.height}px">
            ${edgeLayer(topology, size)}
            ${coreNodes.map((node, index) => standaloneNode(node, index, topology)).join('')}
            ${(topology.networks || []).map(networkBox).join('')}
          </div>
        </div>
      </div>
    </div>
    <div class="foot">парсится из инфры: Docker API · nginx · Guacamole · Netdata · labels</div>`;

  container.querySelectorAll?.('[data-open]').forEach((el) => {
    el.addEventListener('click', (event) => {
      event.stopPropagation();
      window.__openApp?.(el.dataset.open || el.textContent);
    });
  });

  const frame = container.querySelector?.('.topo-frame');
  const canvas = container.querySelector?.('.topo-canvas');
  const plane = container.querySelector?.('.topo-plane');
  let zoom = 1;
  const applyZoom = () => {
    if (!canvas || !plane) return;
    const baseWidth = Number(canvas.dataset.baseWidth) || size.width;
    const baseHeight = Number(canvas.dataset.baseHeight) || size.height;
    canvas.style.width = `${Math.round(baseWidth * zoom)}px`;
    canvas.style.height = `${Math.round(baseHeight * zoom)}px`;
    plane.style.transform = `scale(${zoom})`;
    plane.style.transformOrigin = '0 0';
  };

  container.querySelectorAll?.('[data-topo-zoom]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.topoZoom;
      if (action === 'in') zoom = Math.min(1.6, Math.round((zoom + 0.15) * 100) / 100);
      else if (action === 'out') zoom = Math.max(0.55, Math.round((zoom - 0.15) * 100) / 100);
      else zoom = 1;
      applyZoom();
    });
  });

  container.querySelector?.('[data-topo-fullscreen]')?.addEventListener('click', async () => {
    if (!frame) return;
    if (typeof document !== 'undefined' && document.fullscreenElement) {
      await document.exitFullscreen?.();
      return;
    }
    if (frame.requestFullscreen) {
      try {
        await frame.requestFullscreen();
      } catch {
        frame.classList.toggle('is-fullscreen');
      }
    } else {
      frame.classList.toggle('is-fullscreen');
    }
  });
}
