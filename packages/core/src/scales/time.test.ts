import { describe, expect, it } from 'vitest';
import { timeScale } from './index';

const utc = Date.UTC;

describe('timeScale', () => {
  it('accepts Date domains and maps epoch milliseconds', () => {
    const start = new Date(utc(2024, 0, 1));
    const stop = new Date(utc(2024, 0, 2));
    const scale = timeScale({ domain: [start, stop], range: [0, 24] });

    expect(scale.domain).toEqual([start.getTime(), stop.getTime()]);
    expect(scale.map(utc(2024, 0, 1, 12))).toBe(12);
    expect(scale.invert(6)).toBe(utc(2024, 0, 1, 6));
  });

  it('uses time ticks and formatters', () => {
    const scale = timeScale({
      domain: [utc(2024, 0, 1, 0, 7), utc(2024, 0, 1, 1, 0)],
      range: [0, 100],
    });
    const values = scale.ticks(4);

    expect(values[0]).toBe(utc(2024, 0, 1, 0, 0));
    expect(values[values.length - 1]).toBe(utc(2024, 0, 1, 1, 0));
    expect(scale.tickFormat(4)(values[1])).toBe('00:15');
  });

  it('clamps and returns nice copies', () => {
    const scale = timeScale({
      domain: [utc(2024, 0, 1, 0, 7), utc(2024, 0, 1, 1, 0)],
      range: [0, 100],
      clamp: true,
    });
    const nice = scale.nice(4);

    expect(scale.map(utc(2024, 0, 2))).toBe(100);
    expect(nice.domain).toEqual([utc(2024, 0, 1, 0, 0), utc(2024, 0, 1, 1, 0)]);
    expect(scale.copy()).not.toBe(scale);
  });
});
