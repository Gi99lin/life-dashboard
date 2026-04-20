/**
 * tooltip.js — Global tooltip utility for the dashboard.
 * Creates a single tooltip element shared across all components.
 */

let tooltipEl = null;

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
