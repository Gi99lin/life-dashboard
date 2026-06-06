const TAU = 2 * Math.PI;

function clampPct(value) {
  return Math.max(0, Math.min(100, value ?? 0));
}

export function multiRing({ score, factors, size = 128 }) {
  const center = size / 2;
  const radii = [56, 44, 32, 20];
  const arcs = factors.slice(0, 4).map((factor, index) => {
    const radius = radii[index];
    const circumference = +(TAU * radius).toFixed(1);
    const offset = +(circumference * (1 - clampPct(factor.value) / 100)).toFixed(1);
    return `<circle cx="${center}" cy="${center}" r="${radius}" stroke="rgba(255,255,255,.07)"/>` +
      `<circle cx="${center}" cy="${center}" r="${radius}" stroke="${factor.color}" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" transform="rotate(-90 ${center} ${center})"/>`;
  }).join('');

  return `<div class="mring" style="width:${size}px;height:${size}px">` +
    `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">` +
    `<g fill="none" stroke-width="8" stroke-linecap="round">${arcs}</g></svg>` +
    `<div class="ctr"><div><b>${score ?? '—'}</b><span>/ 100</span></div></div></div>`;
}

export function rangeBar({ value, min, max, bandMin, bandMax, color }) {
  const span = max - min || 1;
  const pos = (v) => `${clampPct(((v - min) / span) * 100)}%`;
  const left = pos(bandMin);
  const right = `${100 - parseFloat(pos(bandMax))}%`;
  const valuePos = pos(value);

  return `<div class="track"><div class="band" style="left:${left};right:${right}"></div>` +
    `<div class="fill" style="width:${valuePos};background:${color}"></div>` +
    `<div class="pin" style="left:calc(${valuePos} - 5px);background:${color}"></div></div>`;
}

export function stageBar({ deep_h = 0, light_h = 0, rem_h = 0, awake_h = 0 }) {
  const segment = (flex, color) => `<i style="flex:${flex || 0.0001};background:${color}"></i>`;
  return `<div class="stage">${segment(deep_h, '#3b5566')}${segment(light_h, 'var(--aqua)')}` +
    `${segment(rem_h, 'var(--blue)')}${segment(awake_h, 'var(--red)')}</div>`;
}

export function donut(segments, label = '') {
  let acc = 0;
  const stops = segments.map((segment) => {
    const stop = `${segment.color} ${acc}% ${acc + segment.pct}%`;
    acc += segment.pct;
    return stop;
  });

  return `<div class="donut" style="background:conic-gradient(${stops.join(',')})">` +
    `${label ? `<div class="c">${label}</div>` : ''}</div>`;
}

/** Catmull-Rom smoothing → cubic-bezier path, matching the Chart.js tension. */
function smoothPath(pts) {
  if (pts.length < 2) return '';
  if (pts.length === 2) return `M${pts[0][0]},${pts[0][1]} L${pts[1][0]},${pts[1][1]}`;
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

export function sparkline(values, color, width = 60, height = 17) {
  const vals = values.filter((value) => value != null);
  if (vals.length < 2) return '';

  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const pts = vals.map((value, index) => [
    (index / (vals.length - 1)) * width,
    height - ((value - min) / span) * (height - 2) - 1,
  ]);

  return `<svg class="fspark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">` +
    `<path d="${smoothPath(pts)}" fill="none" stroke="${color}" stroke-width="1.6" ` +
    `stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

export function streakDots(levels) {
  return `<div class="commit-dots-grid">${levels.map((level) => (
    `<div class="commit-dot commit-dot-${level}"></div>`
  )).join('')}</div>`;
}

export function heatmapMatrix({ labels, matrix }) {
  const head = `<div class="hlbl"></div>${labels.map((label) => `<div class="hlbl">${label}</div>`).join('')}`;
  const rows = matrix.map((row, i) => {
    const cells = row.map((r, j) => {
      if (i === j) {
        return '<div class="hc" style="background:rgba(255,255,255,.05);color:var(--fg-muted)">—</div>';
      }
      if (r == null) {
        return '<div class="hc" style="background:rgba(255,255,255,.03)"></div>';
      }
      const alpha = (Math.abs(r) * 0.5 + 0.08).toFixed(2);
      const color = r >= 0 ? `rgba(89,190,108,${alpha})` : `rgba(227,100,94,${alpha})`;
      const text = `${r > 0 ? '.' : '-.'}${Math.round(Math.abs(r) * 100)}`;
      return `<div class="hc" data-i="${i}" data-j="${j}" style="background:${color}">${text}</div>`;
    }).join('');
    return `<div class="hlbl row">${labels[i]}</div>${cells}`;
  }).join('');

  return `<div class="hm">${head}${rows}</div>`;
}
