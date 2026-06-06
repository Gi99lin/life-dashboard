import { describe, expect, it } from 'vitest';
import {
  donut,
  multiRing,
  rangeBar,
  sparkline,
  stageBar,
  streakDots,
} from '../src/components/microcharts.js';

describe('microcharts', () => {
  it('multiRing renders 4 value arcs + center score', () => {
    const s = multiRing({
      score: 76,
      factors: [
        { value: 82, color: '#5dc0a7' },
        { value: 71, color: '#59be6c' },
        { value: 66, color: '#e2c162' },
        { value: 58, color: '#69aed5' },
      ],
    });

    expect(s).toContain('<svg');
    expect((s.match(/<circle/g) || []).length).toBe(8);
    expect(s).toContain('76');
  });

  it('rangeBar places a pin within the track', () => {
    const s = rangeBar({
      value: 54,
      min: 50,
      max: 64,
      bandMin: 52,
      bandMax: 60,
      color: '#59be6c',
    });

    expect(s).toContain('class="track"');
    expect(s).toContain('pin');
  });

  it('stageBar emits one segment per phase', () => {
    const s = stageBar({ deep_h: 1, light_h: 4, rem_h: 2, awake_h: 0.5 });

    expect((s.match(/<i /g) || []).length).toBe(4);
  });

  it('donut and sparkline and streakDots return strings', () => {
    expect(donut([{ pct: 40, color: '#69aed5' }, { pct: 60, color: '#59be6c' }])).toContain('conic-gradient');
    expect(sparkline([1, 2, 3, 2, 4], '#5dc0a7')).toContain('<path');
    expect(streakDots([0, 1, 2, 3, 4])).toContain('commit-dot');
  });
});
