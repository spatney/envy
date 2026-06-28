import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ThemeName = 'light' | 'dark';

export interface ThemeState {
  theme: ThemeName;
  sketch: boolean;
  reducedMotion: boolean;
  toggleTheme(): void;
  setTheme(t: ThemeName): void;
  toggleSketch(): void;
  setSketch(on: boolean): void;
}

const ThemeContext = createContext<ThemeState | null>(null);

const THEME_KEY = 'graphein.theme';
const SKETCH_KEY = 'graphein.sketch';

function readStored<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T | null) ?? fallback;
  } catch {
    return fallback;
  }
}

function prefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(() => {
    const stored = readStored<ThemeName | ''>(THEME_KEY, '');
    return stored || (prefersDark() ? 'dark' : 'light');
  });
  const [sketch, setSketchState] = useState<boolean>(
    () => readStored<string>(SKETCH_KEY, '') === '1',
  );

  const reducedMotion = useMemo(
    () =>
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  useEffect(() => {
    document.documentElement.classList.toggle('theme-dark', theme === 'dark');
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(SKETCH_KEY, sketch ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [sketch]);

  const setTheme = useCallback((t: ThemeName) => setThemeState(t), []);
  const toggleTheme = useCallback(() => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')), []);
  const setSketch = useCallback((on: boolean) => setSketchState(on), []);
  const toggleSketch = useCallback(() => setSketchState((s) => !s), []);

  const value = useMemo<ThemeState>(
    () => ({ theme, sketch, reducedMotion, toggleTheme, setTheme, toggleSketch, setSketch }),
    [theme, sketch, reducedMotion, toggleTheme, setTheme, toggleSketch, setSketch],
  );

  return createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>');
  return ctx;
}
