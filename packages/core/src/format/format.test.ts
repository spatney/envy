import { describe, expect, it } from 'vitest';
import { formatNumber } from './number';
import { formatDate, smartDate } from './date';
import { formatValue } from './index';

describe('format/number', () => {
  it('groups thousands', () => {
    expect(formatNumber(1234567, ',d')).toBe('1,234,567');
    expect(formatNumber(1234.5, ',.1f')).toBe('1,234.5');
  });

  it('formats fixed and percent', () => {
    expect(formatNumber(3.14159, '.2f')).toBe('3.14');
    expect(formatNumber(0.426, '.0%')).toBe('43%');
    expect(formatNumber(0.426, '.1%')).toBe('42.6%');
  });

  it('formats SI suffixes', () => {
    expect(formatNumber(1200, '.1s')).toBe('1.2k');
    expect(formatNumber(3_400_000, '.1s')).toBe('3.4M');
    expect(formatNumber(950, 's')).toBe('950');
  });

  it('prefixes currency and keeps sign outside', () => {
    expect(formatNumber(1234.5, '$,.2f')).toBe('$1,234.50');
    expect(formatNumber(-1234.5, '$,.2f')).toBe('-$1,234.50');
  });

  it('smart default trims and handles integers', () => {
    expect(formatNumber(42)).toBe('42');
    expect(formatNumber(3.1400000000001)).toBe('3.14');
    expect(formatNumber(NaN)).toBe('');
  });
});

describe('format/date', () => {
  const d = new Date(2024, 0, 5, 14, 30, 0); // Jan 5 2024 14:30 local

  it('formats with strftime tokens', () => {
    expect(formatDate(d, '%Y-%m-%d')).toBe('2024-01-05');
    expect(formatDate(d, '%b %e, %Y')).toBe('Jan 5, 2024');
    expect(formatDate(d, '%H:%M')).toBe('14:30');
    expect(formatDate(d, '%I:%M %p')).toBe('02:30 PM');
  });

  it('smartDate picks granularity from the step', () => {
    expect(smartDate(d, 2 * 60 * 1000)).toBe('14:30');
    expect(smartDate(d, 5 * 24 * 60 * 60 * 1000)).toBe('Jan 5');
    expect(smartDate(d, 60 * 24 * 60 * 60 * 1000)).toBe('Jan 2024');
  });
});

describe('format/formatValue', () => {
  it('routes by value type and hint', () => {
    expect(formatValue(1234, ',d')).toBe('1,234');
    expect(formatValue(0.5, '.0%')).toBe('50%');
    expect(formatValue(new Date(2024, 0, 1), '%Y')).toBe('2024');
    expect(formatValue('West')).toBe('West');
    expect(formatValue(null)).toBe('');
  });
});
