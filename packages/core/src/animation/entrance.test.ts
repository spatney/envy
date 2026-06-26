import { describe, it, expect } from 'vitest';
import { resolveEntrance, DEFAULT_ENTRANCE_DURATION } from './entrance';
import { cubicOut, bounceOut } from './easing';

describe('resolveEntrance', () => {
  it('enables a default entrance for undefined animation', () => {
    const r = resolveEntrance(undefined);
    expect(r.enabled).toBe(true);
    expect(r.duration).toBe(DEFAULT_ENTRANCE_DURATION);
    expect(r.easing).toBe(cubicOut);
  });

  it('enables a default entrance for animation: true', () => {
    expect(resolveEntrance(true).enabled).toBe(true);
  });

  it('disables for animation: false', () => {
    expect(resolveEntrance(false).enabled).toBe(false);
  });

  it('disables for { enabled: false }', () => {
    expect(resolveEntrance({ enabled: false }).enabled).toBe(false);
  });

  it('disables for a non-positive duration', () => {
    expect(resolveEntrance({ duration: 0 }).enabled).toBe(false);
    expect(resolveEntrance({ duration: -100 }).enabled).toBe(false);
  });

  it('honors a custom duration and named easing', () => {
    const r = resolveEntrance({ duration: 200, easing: 'bounceOut' });
    expect(r).toMatchObject({ enabled: true, duration: 200 });
    expect(r.easing).toBe(bounceOut);
  });

  it('falls back to cubicOut for an unknown easing name', () => {
    expect(resolveEntrance({ easing: 'nope' }).easing).toBe(cubicOut);
  });

  it('disables when reduced motion is requested, regardless of spec', () => {
    expect(resolveEntrance(true, { reducedMotion: true }).enabled).toBe(false);
    expect(resolveEntrance({ duration: 500 }, { reducedMotion: true }).enabled).toBe(false);
  });

  it('disables when globally disabled (screenshot/automation kill-switch)', () => {
    expect(resolveEntrance({ duration: 500 }, { disabled: true }).enabled).toBe(false);
  });
});
