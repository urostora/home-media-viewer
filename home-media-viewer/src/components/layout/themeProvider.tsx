import { createContext, useContext, useSyncExternalStore, type ReactNode, type JSX } from 'react';
import { isTheme, THEME_EVENT, THEME_KEY, type Theme } from '@/utils/frontend/theme';

let memoryPreference: Theme | undefined;
const systemTheme = (): Theme => (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
const readTheme = (): Theme => {
    if (memoryPreference) return memoryPreference;
    try {
        const saved = localStorage.getItem(THEME_KEY);
        if (isTheme(saved)) return saved;
    } catch {
        // A manual choice still works in memory when storage is unavailable.
    }
    return systemTheme();
};
const applyTheme = (): void => {
    document.documentElement.dataset.theme = readTheme();
};
const subscribe = (notify: () => void): (() => void) => {
    const sync = (): void => {
        applyTheme();
        notify();
    };
    const storage = (event: StorageEvent): void => {
        if (event.key === THEME_KEY || event.key === null) {
            memoryPreference = undefined;
            sync();
        }
    };
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', sync);
    window.addEventListener('storage', storage);
    window.addEventListener(THEME_EVENT, sync);
    applyTheme();
    return () => {
        media.removeEventListener('change', sync);
        window.removeEventListener('storage', storage);
        window.removeEventListener(THEME_EVENT, sync);
    };
};
const ThemeContext = createContext({ theme: 'light' as Theme, toggle: (): void => {} });

export function ThemeProvider({ children }: { children: ReactNode }): JSX.Element {
    const theme = useSyncExternalStore(subscribe, readTheme, (): Theme => 'light');
    const toggle = (): void => {
        const next = readTheme() === 'dark' ? 'light' : 'dark';
        memoryPreference = next;
        try {
            localStorage.setItem(THEME_KEY, next);
        } catch {
            /* Keep the in-memory choice. */
        }
        applyTheme();
        window.dispatchEvent(new Event(THEME_EVENT));
    };
    return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}
export const useTheme = (): { theme: Theme; toggle: () => void } => useContext(ThemeContext);
