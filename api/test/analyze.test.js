import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAnalyzeContext, parseBoardDirective, fallbackAnswer } from '../analyze.js';

test('buildAnalyzeContext summarizes the period and findings', () => {
  const days = [{ date: '2026-06-01', garmin: { sleep_hours: 7.4, stress_avg: 30 }, manual: { mood: 4 } }];
  const meta = { findings: [{ type: 'correlation', title: 'Сон ↔ Наст · r=+0.62' }] };
  const ctx = buildAnalyzeContext(days, meta);
  assert.match(ctx, /Сон/);
  assert.match(ctx, /r=\+0\.62/);
});

test('parseBoardDirective reads a fenced json board block', () => {
  const text = 'Связь заметная.\n```board\n{"view":"correlation","x":"Сон","y":"Наст"}\n```';
  const { answer, board } = parseBoardDirective(text);
  assert.equal(board.view, 'correlation');
  assert.equal(board.x, 'Сон');
  assert.ok(!answer.includes('```'));
});

test('parseBoardDirective tolerates no board block', () => {
  const { answer, board } = parseBoardDirective('просто текст');
  assert.equal(answer, 'просто текст');
  assert.equal(board, null);
});

test('fallbackAnswer never throws and cites sources', () => {
  const out = fallbackAnswer([{ garmin: { sleep_hours: 7 }, manual: { mood: 4 } }]);
  assert.ok(out.answer.length > 0);
  assert.ok(Array.isArray(out.sources));
});
