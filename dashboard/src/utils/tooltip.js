/**
 * tooltip.js — Global tooltip utility for the dashboard.
 * Creates a single tooltip element shared across all components.
 */

let tooltipEl = null;

const SOURCE_URLS = {
  Garmin: 'https://connect.garmin.com/modern/',
  GitHub: 'https://github.com/ivanyakimkin',
  WakaTime: 'https://wakatime.com/dashboard',
};

export function initGlobalTooltip() {
  if (tooltipEl) return;
  tooltipEl = document.createElement('div');
  tooltipEl.className = 'global-tooltip';
  document.body.appendChild(tooltipEl);
}

export function attachTooltip(el, text) {
  if (!tooltipEl) initGlobalTooltip();

  el.addEventListener('mouseenter', () => {
    tooltipEl.textContent = text;
    tooltipEl.classList.add('visible');
    const rect = el.getBoundingClientRect();
    tooltipEl.style.left = `${rect.left + rect.width / 2}px`;
    tooltipEl.style.top = `${rect.top - 6}px`;
  });

  el.addEventListener('mouseleave', () => {
    tooltipEl.classList.remove('visible');
  });
}

export function formatMetricTooltip({ label, value, avg, range, source }) {
  return `${label || 'Метрика'}: ${value || '—'} · avg ${avg || '—'} · range ${range || '—'} · source ${source || '—'}`;
}

export function sourceUrlFor(source) {
  return SOURCE_URLS[source] || null;
}

export function attachMetricTooltips(root = document) {
  if (!root?.querySelectorAll) return;

  root.querySelectorAll('.sub').forEach((el) => {
    if (el.dataset.tooltipBound === 'true') return;
    hydrateSubTooltipData(el);
    attachTooltip(el, formatMetricTooltip(el.dataset));
    el.dataset.tooltipBound = 'true';
  });

  root.querySelectorAll('.hc').forEach((el) => {
    if (el.dataset.tooltipBound === 'true') return;
    el.dataset.label ||= 'Корреляция';
    el.dataset.value ||= el.textContent.trim() || '—';
    el.dataset.avg ||= '—';
    el.dataset.range ||= '-1..1';
    el.dataset.source ||= 'Collector Pearson';
    attachTooltip(el, formatMetricTooltip(el.dataset));
    el.dataset.tooltipBound = 'true';
  });
}

export function enhanceSourceLinks(root = document) {
  if (!root?.querySelectorAll) return;

  root.querySelectorAll('.src').forEach((chip) => {
    if (chip.dataset.sourceBound === 'true') return;
    const url = sourceUrlFor(chip.textContent.trim());
    if (!url) return;

    chip.dataset.sourceUrl = url;
    chip.dataset.sourceBound = 'true';
    chip.classList.add('linked-source');
    chip.setAttribute('role', 'link');
    chip.setAttribute('tabindex', '0');
    chip.setAttribute('title', url);
    const open = () => window.open(url, '_blank', 'noopener,noreferrer');
    chip.addEventListener('click', (event) => {
      event.stopPropagation();
      open();
    });
    chip.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });
  });
}

function hydrateSubTooltipData(el) {
  el.dataset.label ||= el.querySelector('.sl')?.textContent?.replace(/\s*i$/, '').trim() || 'Метрика';
  el.dataset.value ||= el.querySelector('.sv')?.textContent?.trim() || '—';
  el.dataset.avg ||= '—';
  el.dataset.range ||= '—';
  el.dataset.source ||= el.closest('.dom')?.querySelector('.src')?.textContent?.trim() || '—';
}
