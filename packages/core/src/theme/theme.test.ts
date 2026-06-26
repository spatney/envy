import { describe, it, expect } from 'vitest';
import { resolveTheme, lightTheme, darkTheme } from './tokens';

describe('resolveTheme', () => {
  it('defaults to the light theme', () => {
    expect(resolveTheme()).toBe(lightTheme);
  });

  it('selects a built-in theme by name', () => {
    expect(resolveTheme('dark')).toBe(darkTheme);
    expect(resolveTheme('light')).toBe(lightTheme);
  });

  it('falls back to light for unknown names', () => {
    expect(resolveTheme('nope')).toBe(lightTheme);
  });

  it('deep-merges overrides onto a base', () => {
    const t = resolveTheme({ base: 'dark', color: { accent: '#ff0000' } });
    expect(t.dark).toBe(true);
    expect(t.color.accent).toBe('#ff0000');
    // untouched tokens preserved from the dark base
    expect(t.color.background).toBe(darkTheme.color.background);
    expect(t.font.family).toBe(darkTheme.font.family);
  });

  it('does not mutate the base theme', () => {
    const before = darkTheme.color.accent;
    resolveTheme({ base: 'dark', color: { accent: '#123456' } });
    expect(darkTheme.color.accent).toBe(before);
  });

  it('every palette color is a hex string', () => {
    for (const c of lightTheme.color.palette) {
      expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});
