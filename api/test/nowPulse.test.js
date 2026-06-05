import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildNowPulse, localDateString, nowPulseIntervalMs } from '../nowPulse.js';

test('buildNowPulse normalizes WakaTime summary into live strip payload', () => {
  const payload = buildNowPulse({
    data: [{
      grand_total: { total_seconds: 9000 },
      projects: [
        { name: 'life-dashboard', total_seconds: 5400 },
        { name: 'omniroute', total_seconds: 1800 },
      ],
      languages: [{ name: 'JavaScript', total_seconds: 600 }],
    }],
  });

  assert.deepEqual(payload, {
    activity: 'Код',
    project: 'life-dashboard',
    focus_min: 150,
    source: 'WakaTime',
  });
});

test('buildNowPulse degrades when WakaTime has no activity', () => {
  assert.deepEqual(buildNowPulse({ data: [{}] }), {
    activity: 'Нет активности',
    project: null,
    focus_min: 0,
    source: 'WakaTime',
  });
});

test('localDateString uses the local calendar day instead of UTC slicing', () => {
  const date = new Date(2026, 5, 5, 23, 10);

  assert.equal(localDateString(date), '2026-06-05');
});

test('nowPulseIntervalMs defaults to one minute and accepts positive overrides', () => {
  assert.equal(nowPulseIntervalMs(), 60000);
  assert.equal(nowPulseIntervalMs('1000'), 1000);
  assert.equal(nowPulseIntervalMs('0'), 60000);
});
