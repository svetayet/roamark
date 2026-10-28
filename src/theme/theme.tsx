import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ThemePref = 'light' | 'dark' | 'system';
type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'roamark.theme';

interface ThemeContextValue {
  pref: ThemePref;
  setPref(pref: ThemePref): void;
  /** Фактическая тема — для карты и прочего не-CSS. */
  resolved: ThemeMode;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredPref(): ThemePref {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* приватный режим — просто system */
  }
  return 'system';
}

function systemMode(): ThemeMode {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolve(pref: ThemePref): ThemeMode {
  return pref === 'system' ? systemMode() : pref;
}

function apply(mode: ThemeMode): void {
  document.documentElement.setAttribute('data-theme', mode);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(readStoredPref);
  const [resolved, setResolved] = useState<ThemeMode>(() => resolve(readStoredPref()));

  useEffect(() => {
    const next = resolve(pref);
    setResolved(next);
    apply(next);
  }, [pref]);

  useEffect(() => {
    if (pref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const next = systemMode();
      setResolved(next);
      apply(next);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pref]);

  const setPref = useCallback((next: ThemePref) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* без localStorage тема живёт до перезагрузки */
    }
    setPrefState(next);
  }, []);

  const value = useMemo(() => ({ pref, setPref, resolved }), [pref, setPref, resolved]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme вне ThemeProvider');
  return ctx;
}
