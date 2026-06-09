import { describe, expect, it } from 'vitest';
import { formatMetricTooltip, sourceUrlFor } from '../src/utils/tooltip.js';

describe('metric tooltips and source links', () => {
  it('formats value, average, range and source', () => {
    expect(formatMetricTooltip({
      label: 'Пульс покоя',
      value: '54',
      avg: '56',
      range: '50–60',
      source: 'Garmin',
    })).toBe('Пульс покоя: 54 · среднее 56 · диапазон 50–60 · источник Garmin');
  });

  it('does not expose internal collector wording for correlations', () => {
    expect(formatMetricTooltip({
      label: 'Связь',
      value: 'r=0.62',
      avg: '—',
      range: '-1..1',
      source: 'Collector Pearson',
    })).toBe('Связь: r=0.62 · диапазон -1..1 · источник корреляция Pearson');
  });

  it('returns URLs for known source chips', () => {
    expect(sourceUrlFor('GitHub')).toBe('https://github.com/Gi99lin');
    expect(sourceUrlFor('WakaTime')).toBe('https://wakatime.com/dashboard');
    expect(sourceUrlFor('Obsidian')).toBeNull();
  });
});
