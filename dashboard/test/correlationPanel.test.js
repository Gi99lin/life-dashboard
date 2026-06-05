import { describe, expect, it } from 'vitest';
import { renderCorrelationPanel } from '../src/components/CorrelationPanel.js';

describe('renderCorrelationPanel', () => {
  it('renders heatmap and strongest links from meta correlations', () => {
    const container = { innerHTML: '' };
    const data = {
      meta: {
        correlations: {
          labels: ['Сон', 'Наст'],
          matrix: [[1, 0.62], [0.62, 1]],
          strongest: [{ a: 'Сон', b: 'Наст', r: 0.62 }],
        },
      },
    };

    renderCorrelationPanel(container, data);

    expect(container.innerHTML).toContain('Корреляции');
    expect(container.innerHTML).toContain('Сильнейшие связи');
    expect(container.innerHTML).toContain('Сон → Наст');
    expect(container.innerHTML).toContain('class="hm"');
    expect(container.innerHTML).toContain('+0.62');
  });

  it('renders an empty state when correlations are unavailable', () => {
    const container = { innerHTML: '' };

    renderCorrelationPanel(container, { meta: {} });

    expect(container.innerHTML).toContain('Нет данных за день');
    expect(container.innerHTML).toContain('Сбор начнётся ночью');
  });
});
