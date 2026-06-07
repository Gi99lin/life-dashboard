import { describe, it, expect } from 'vitest';
import { analystPeriodText, questionForFinding, renderSourceChips } from '../src/components/AnalystChat.js';

describe('AnalystChat helpers', () => {
  it('builds a natural-language prompt from a finding', () => {
    expect(questionForFinding({ title: 'Сон ↔ Наст · r=+0.62' })).toBe('Расскажи про: Сон ↔ Наст · r=+0.62');
  });

  it('renders source chips safely', () => {
    const html = renderSourceChips(['Garmin', '<bad>']);
    expect(html).toContain('class="src"');
    expect(html).toContain('Garmin');
    expect(html).toContain('&lt;bad&gt;');
  });

  it('formats the selected analytics period for the chat header', () => {
    expect(analystPeriodText(7)).toBe('7 дней');
    expect(analystPeriodText(30)).toBe('30 дней');
  });
});
