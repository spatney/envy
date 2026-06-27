import { describe, expect, it } from 'vitest';
import { evalRules, iconForValue, toneColor } from './condFormat';

describe('conditional formatting helpers', () => {
  it('applies the first matching value rule', () => {
    expect(
      evalRules(12, [
        { when: 'gte', value: 10, background: '#ecfdf5', color: '#166534', weight: 'bold' },
        { when: 'gte', value: 5, background: '#fffbeb' },
      ]),
    ).toEqual({ background: '#ecfdf5', color: '#166534', weight: 'bold', icon: undefined });
  });

  it('matches between inclusively and permits reversed endpoints', () => {
    expect(evalRules(5, [{ when: 'between', value: 10, to: 5, icon: '●' }])).toEqual({
      background: undefined,
      color: undefined,
      weight: undefined,
      icon: '●',
    });
  });

  it('uses stringified equality for eq and ne', () => {
    expect(evalRules(7, [{ when: 'eq', value: '7', color: 'green' }]).color).toBe('green');
    expect(evalRules(7, [{ when: 'ne', value: '8', color: 'red' }]).color).toBe('red');
  });

  it('returns semantic icon thirds for built-in sets', () => {
    expect(iconForValue('arrows', 90, [0, 90])).toEqual({ icon: '▲', tone: 'up' });
    expect(iconForValue('arrows', 45, [0, 90])).toEqual({ icon: '▬', tone: 'mid' });
    expect(iconForValue('arrows', 5, [0, 90])).toEqual({ icon: '▼', tone: 'down' });
    expect(iconForValue('trafficLights', 90, [0, 90])).toEqual({ icon: '●', tone: 'up' });
  });

  it('honors explicit icon rules before built-in thirds', () => {
    expect(
      iconForValue('triangles', 2, [0, 100], [{ when: 'lt', value: 5, icon: '◆', color: '#dc2626' }]),
    ).toEqual({ icon: '◆', tone: 'down' });
    expect(iconForValue('triangles', 20, [0, 100], [{ when: 'lt', value: 5, icon: '◆' }])).toBeNull();
  });

  it('maps semantic tones to default or provided colors', () => {
    expect(toneColor('up')).toBe('#16a34a');
    expect(toneColor('mid', { mid: '#f59e0b' })).toBe('#f59e0b');
  });
});
