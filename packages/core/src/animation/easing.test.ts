import { describe, expect, it } from 'vitest';
import {
  backOut,
  bounceOut,
  cubicIn,
  cubicInOut,
  cubicOut,
  easings,
  elasticOut,
  expoInOut,
  expoOut,
  linear,
  quadIn,
  quadInOut,
  quadOut,
  sinInOut,
} from './index';

const easingFunctions = {
  linear,
  quadIn,
  quadOut,
  quadInOut,
  cubicIn,
  cubicOut,
  cubicInOut,
  expoOut,
  expoInOut,
  sinInOut,
  backOut,
  bounceOut,
  elasticOut,
};

describe('easings', () => {
  it('return exact endpoints', () => {
    for (const [name, easing] of Object.entries(easingFunctions)) {
      expect(easing(0), `${name}(0)`).toBeCloseTo(0, 9);
      expect(easing(1), `${name}(1)`).toBeCloseTo(1, 9);
    }
  });

  it('exports all easing functions in the easings map', () => {
    expect(easings).toEqual(easingFunctions);
  });
});
