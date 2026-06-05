/**
 * palette.js — single source of truth for chart colors, resolved from the
 * portfolio-aligned CSS tokens (sRGB hex of the oklch values in main.css).
 * Also sets Chart.js global defaults so every chart shares the mono,
 * technical look of the dashboard.
 */
import { Chart } from 'chart.js';

export const PAL = {
  green:  '#59be6c',
  aqua:   '#5dc0a7',
  blue:   '#69aed5',
  yellow: '#e2c162',
  orange: '#e99355',
  purple: '#c88ec3',
  red:    '#e3645e',
  fg:     '#eaeff3',
  fgDim:  '#a3acb3',
  fgMuted:'#727c84',
  bg0:    '#0b1219',
  grid:   'rgba(255,255,255,0.05)',
  hair:   'rgba(255,255,255,0.10)',
};

/** rgba helper from a hex + alpha (0..1) */
export function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

let done = false;
export function initChartTheme() {
  if (done) return;
  done = true;
  Chart.defaults.font.family = "'JetBrains Mono','IBM Plex Mono',ui-monospace,Menlo,monospace";
  Chart.defaults.font.size = 10;
  Chart.defaults.color = PAL.fgMuted;
}

/** Shared tooltip style for the dark technical theme */
export const TOOLTIP = {
  backgroundColor: 'rgba(11,18,25,0.96)',
  titleColor: PAL.fg,
  bodyColor: PAL.fgDim,
  borderColor: PAL.hair,
  borderWidth: 1,
  cornerRadius: 8,
  padding: 10,
};
