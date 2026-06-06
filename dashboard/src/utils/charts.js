/**
 * charts.js — shared Chart.js builders so every chart in the app speaks one
 * visual language (palette colours, mono ticks, shared tooltip, smooth lines,
 * hover-only points). Builds on the tokens/tooltip in palette.js.
 */
import { PAL, TOOLTIP, rgba } from './palette.js';

export const MONO = "'JetBrains Mono', ui-monospace, monospace";
export const TENSION = 0.35;

/** Vertical gradient fill (hex → transparent). Pass the 2d context. */
export function gradientFill(ctx, hex, height = 200, topAlpha = 0.2) {
  if (!ctx) return rgba(hex, 0.12);
  const g = ctx.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, rgba(hex, topAlpha));
  g.addColorStop(1, rgba(hex, 0));
  return g;
}

/**
 * Standard line series.
 * opts: { fill, bg, width, dash, yAxisID } — fill may be true / '+1' / index.
 */
export function lineSeries(label, data, color, opts = {}) {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: opts.fill ? (opts.bg ?? rgba(color, 0.14)) : 'transparent',
    fill: opts.fill ?? false,
    borderWidth: opts.width ?? 1.8,
    borderDash: opts.dash ?? [],
    yAxisID: opts.yAxisID,
    tension: TENSION,
    pointRadius: 0,
    pointHoverRadius: 4,
    pointHoverBackgroundColor: color,
    spanGaps: true,
  };
}

/** Standard bar series. opts: { solid, radius, stack } */
export function barSeries(label, data, color, opts = {}) {
  return {
    label,
    data,
    backgroundColor: opts.solid ? color : rgba(color, 0.85),
    borderRadius: opts.radius ?? 3,
    borderSkipped: false,
    stack: opts.stack,
  };
}

export function legend(extra = {}) {
  const { labels = {}, ...rest } = extra;
  return {
    display: true,
    position: 'top',
    align: 'end',
    labels: {
      color: PAL.fgMuted,
      boxHeight: 3,
      boxWidth: 12,
      font: { family: MONO, size: 10 },
      padding: 12,
      ...labels,
    },
    ...rest,
  };
}

/** One axis with the shared tick/grid look; pass min/max/position/title/stacked. */
export function axis({ ticks = {}, grid = {}, ...rest } = {}) {
  return {
    ticks: { color: PAL.fgMuted, font: { family: MONO, size: 10 }, ...ticks },
    grid: { color: PAL.grid, ...grid },
    border: { display: false },
    ...rest,
  };
}

/** Build a scales object from a map of axis overrides. */
export function scales(map = {}) {
  const out = {};
  for (const [key, value] of Object.entries(map)) out[key] = axis(value);
  return out;
}

export function lineOptions({ legend: lg = {}, scales: sc = {}, animation } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: legend(lg), tooltip: TOOLTIP },
    scales: scales(sc),
    animation: animation ?? { duration: 600, easing: 'easeOutCubic' },
  };
}

export function barOptions({ legend: lg = {}, scales: sc = {} } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: legend(lg), tooltip: TOOLTIP },
    scales: scales(sc),
  };
}
