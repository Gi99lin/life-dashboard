import { describe, expect, it } from 'vitest';
import { renderLiveStrip } from '../src/components/LiveStrip.js';

describe('renderLiveStrip', () => {
  it('renders now, schedule, infra placeholder, and code streak', () => {
    const container = { className: '', innerHTML: '' };
    const data = {
      days: {
        '2026-06-05': {
          date: '2026-06-05',
          github: { streak: 23 },
        },
      },
      meta: {
        now: { activity: 'coding', project: 'omniroute', focus_min: 41, source: 'WakaTime' },
      },
    };
    const schedule = { current: { activity: 'Глубокая работа', start: '14:00', end: '18:00' } };

    renderLiveStrip(container, data, schedule);

    expect(container.className).toBe('live');
    expect(container.innerHTML).toContain('coding · omniroute');
    expect(container.innerHTML).toContain('Глубокая работа');
    expect(container.innerHTML).toContain('23 дн');
    expect(container.innerHTML).toContain('id="liveInfra"');
  });
});
