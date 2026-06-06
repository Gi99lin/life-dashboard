const TAG = {
  correlation: 'corr',
  driver: 'corr',
  threshold: 'thr',
  anomaly: 'anom',
  record: 'rec',
  pattern: 'patt',
};

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function renderFindings(container, data) {
  if (!container) return;
  const items = data?.meta?.findings || [];

  if (!items.length) {
    container.innerHTML = '<div class="empty-state"><b>Находок пока нет</b><span>Сбор начнётся ночью</span></div>';
    return;
  }

  container.innerHTML = `
    <div class="lane-head">
      <span class="lbl">Что нашлось</span>
      <span class="lbl lane-hint">клик — спросить AI про находку →</span>
    </div>
    <div class="lane">
      ${items.map((finding, index) => `
        <div class="find" data-finding="${index}">
          <span class="tag ${TAG[finding.type] || 'corr'}">${esc(finding.type)}</span>
          <div class="fh">${esc(finding.title)}</div>
          <div class="fsub">${esc(finding.subtitle || '')}</div>
        </div>
      `).join('')}
    </div>`;

  container.querySelectorAll?.('.find[data-finding]').forEach((el) => {
    el.addEventListener('click', () => window.__askFinding?.(Number(el.dataset.finding)));
  });
}
