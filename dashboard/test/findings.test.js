import { describe, it, expect } from 'vitest';
import { renderFindings } from '../src/components/Findings.js';

describe('renderFindings', () => {
  it('renders a card per finding with a type tag and click data', () => {
    const container = { innerHTML: '', querySelectorAll: () => [] };
    const data = { meta: { findings: [
      {
        type: 'correlation',
        title: 'Сон ↔ Наст · r=+0.62',
        subtitle: 'p<0.01',
        evidence: { view: 'correlation', x: 'Сон', y: 'Наст' },
      },
      {
        type: 'anomaly',
        title: '3 апр — стресс 78',
        subtitle: 'σ +2.4',
        evidence: { view: 'timeline', x: 'Стр', y: null },
      },
    ] } };
    renderFindings(container, data);
    expect(container.innerHTML).toContain('Сон ↔ Наст');
    expect(container.innerHTML).toContain('class="tag corr"');
    expect(container.innerHTML).toContain('class="tag anom"');
    expect(container.innerHTML).toContain('data-finding="0"');
  });

  it('empty findings → empty state', () => {
    const container = { innerHTML: '', querySelectorAll: () => [] };
    renderFindings(container, { meta: { findings: [] } });
    expect(container.innerHTML).toContain('Сбор начнётся ночью');
  });
});
