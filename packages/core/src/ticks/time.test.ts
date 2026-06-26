import { describe, expect, it } from 'vitest';
import { timeTickFormat, timeTicks } from './index';

const utc = Date.UTC;

describe('time ticks', () => {
  it('selects and aligns sub-day intervals', () => {
    const values = timeTicks(utc(2024, 0, 1, 0, 7), utc(2024, 0, 1, 1, 0), 4);

    expect(values).toEqual([
      utc(2024, 0, 1, 0, 0),
      utc(2024, 0, 1, 0, 15),
      utc(2024, 0, 1, 0, 30),
      utc(2024, 0, 1, 0, 45),
      utc(2024, 0, 1, 1, 0),
    ]);
  });

  it('supports reversed ranges', () => {
    expect(timeTicks(utc(2024, 0, 1, 0, 1), utc(2024, 0, 1, 0, 0), 2)).toEqual([
      utc(2024, 0, 1, 0, 1),
      utc(2024, 0, 1, 0, 0, 30),
      utc(2024, 0, 1, 0, 0),
    ]);
  });

  it('selects month intervals and aligns to calendar boundaries', () => {
    expect(timeTicks(utc(2024, 0, 15), utc(2024, 4, 10), 4)).toEqual([
      utc(2024, 0, 1),
      utc(2024, 1, 1),
      utc(2024, 2, 1),
      utc(2024, 3, 1),
      utc(2024, 4, 1),
      utc(2024, 5, 1),
    ]);
  });

  it('formats labels based on tick spacing', () => {
    const minuteTicks = [utc(2024, 0, 1, 0, 0), utc(2024, 0, 1, 0, 15)];
    const dayTicks = [utc(2024, 0, 1), utc(2024, 0, 2)];
    const monthTicks = [utc(2024, 0, 1), utc(2024, 1, 1)];
    const yearTicks = [utc(2024, 0, 1), utc(2025, 0, 1)];

    expect(timeTickFormat(minuteTicks)(minuteTicks[1])).toBe('00:15');
    expect(timeTickFormat(dayTicks)(dayTicks[0])).toBe('Jan 1');
    expect(timeTickFormat(monthTicks)(monthTicks[1])).toBe('Feb');
    expect(timeTickFormat(yearTicks)(yearTicks[0])).toBe('2024');
  });
});
