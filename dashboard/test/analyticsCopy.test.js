import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf-8');
const chat = readFileSync(new URL('../src/components/AnalystChat.js', import.meta.url), 'utf-8');

describe('analytics copy', () => {
  it('uses natural Russian copy for the analytics heading and prompt', () => {
    expect(html).toContain('Разбор своих <b>данных</b>');
    expect(html).not.toContain('Спроси свои <b>данные</b>');
    expect(chat).toContain('placeholder="Задай вопрос по данным за период..."');
    expect(chat).not.toContain('Спроси про свои данные за период');
  });
});
