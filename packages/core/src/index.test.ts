import { describe, it, expect } from 'vitest';
import { VERSION } from './index';

describe('@envy/core smoke', () => {
  it('exposes a VERSION string', () => {
    expect(typeof VERSION).toBe('string');
  });
});
