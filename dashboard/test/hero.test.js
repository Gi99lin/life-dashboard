import { describe, expect, it } from 'vitest';
import { renderHero } from '../src/components/Hero.js';

describe('renderHero', () => {
  it('renders readiness rings, factors, strip, and AI brief', () => {
    const container = { className: '', innerHTML: '' };
    const data = {
      days: {
        '2026-06-04': {
          date: '2026-06-04',
          readiness: { score: 68, sleep: 70, energy: 65, calm: 64, hrv: 55 },
        },
        '2026-06-05': {
          date: '2026-06-05',
          readiness: { score: 76, sleep: 82, energy: 71, calm: 66, hrv: 58 },
        },
      },
      meta: {
        ai_brief: {
          text: 'Сон поднял восстановление.',
          sources: ['Garmin', 'Obsidian'],
        },
      },
    };

    renderHero(container, data);

    expect(container.className).toBe('hero2');
    expect(container.innerHTML).toContain('76');
    expect(container.innerHTML).toContain('Состояние дня');
    expect(container.innerHTML).toContain('Сон поднял восстановление.');
    expect((container.innerHTML.match(/class="frow"/g) || []).length).toBe(4);
    expect(container.innerHTML).toContain('class="strip"');
  });

  it('renders a clear empty state when readiness and brief are missing', () => {
    const container = { className: '', innerHTML: '' };

    renderHero(container, { days: {}, meta: {} });

    expect(container.innerHTML).toContain('Нет данных за день');
    expect(container.innerHTML).toContain('Сбор начнётся ночью');
  });
});
