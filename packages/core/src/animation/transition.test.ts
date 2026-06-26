import { describe, it, expect } from 'vitest';
import { resolveUpdate, DEFAULT_UPDATE_DURATION } from './transition';
import { cubicInOut, bounceOut } from './easing';

describe('resolveUpdate', () => {
  it('enables a default cross-fade for undefined animation', () => {
    const r = resolveUpdate(undefined);
    expect(r.enabled).toBe(true);
    expect(r.duration).toBe(DEFAULT_UPDATE_DURATION);
    expect(r.easing).toBe(cubicInOut);
  });

  it('enables a default cross-fade for animation: true', () => {
    expect(resolveUpdate(true).enabled).toBe(true);
  });

  it('disables for animation: false', () => {
    expect(resolveUpdate(false).enabled).toBe(false);
  });

  it('disables for { enabled: false }', () => {
    expect(resolveUpdate({ enabled: false }).enabled).toBe(false);
  });

  it('disables for a non-positive duration', () => {
    expect(resolveUpdate({ duration: 0 }).enabled).toBe(false);
    expect(resolveUpdate({ duration: -100 }).enabled).toBe(false);
  });

  it('honors a custom duration and named easing', () => {
    const r = resolveUpdate({ duration: 200, easing: 'bounceOut' });
    expect(r).toMatchObject({ enabled: true, duration: 200 });
    expect(r.easing).toBe(bounceOut);
  });

  it('falls back to cubicInOut for an unknown easing name', () => {
    expect(resolveUpdate({ easing: 'nope' }).easing).toBe(cubicInOut);
  });

  it('disables when reduced motion is requested, regardless of spec', () => {
    expect(resolveUpdate(true, { reducedMotion: true }).enabled).toBe(false);
    expect(resolveUpdate({ duration: 500 }, { reducedMotion: true }).enabled).toBe(false);
  });

  it('disables when globally disabled (screenshot/automation kill-switch)', () => {
    expect(resolveUpdate({ duration: 500 }, { disabled: true }).enabled).toBe(false);
  });
});
