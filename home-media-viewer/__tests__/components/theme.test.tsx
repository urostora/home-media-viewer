import '@testing-library/jest-dom';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from '@/components/layout/themeProvider';
import ThemeSwitch from '@/components/layout/themeSwitch';
import { THEME_KEY, themeBootstrap } from '@/utils/frontend/theme';

let dark = false;
const listeners = new Set<() => void>();
const mount = () =>
  render(
    <ThemeProvider>
      <ThemeSwitch />
    </ThemeProvider>,
  );
beforeEach(() => {
  dark = false;
  localStorage.clear();
  window.matchMedia = jest.fn().mockImplementation(() => ({
    matches: dark,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  }));
  window.dispatchEvent(new StorageEvent('storage', { key: THEME_KEY }));
});
afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

it('follows the system until a manual choice, then persists across remounts and system changes', () => {
  dark = true;
  const view = mount();
  expect(screen.getByRole('switch')).toBeChecked();
  fireEvent.click(screen.getByRole('switch'));
  expect(document.documentElement.dataset.theme).toBe('light');
  expect(localStorage.getItem(THEME_KEY)).toBe('light');
  act(() => {
    dark = false;
    listeners.forEach((fn) => fn());
    dark = true;
    listeners.forEach((fn) => fn());
  });
  expect(screen.getByRole('switch')).not.toBeChecked();
  view.unmount();
  mount();
  expect(screen.getByRole('switch')).not.toBeChecked();
});
it('responds to cross-tab changes and storage clearing, and removes subscriptions', () => {
  const view = mount();
  act(() => {
    localStorage.setItem(THEME_KEY, 'dark');
    window.dispatchEvent(new StorageEvent('storage', { key: THEME_KEY }));
  });
  expect(screen.getByRole('switch')).toBeChecked();
  act(() => {
    localStorage.clear();
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
  });
  expect(screen.getByRole('switch')).not.toBeChecked();
  act(() => {
    dark = true;
    listeners.forEach((fn) => fn());
  });
  expect(screen.getByRole('switch')).toBeChecked();
  view.unmount();
  expect(listeners.size).toBe(0);
});
it('keeps a manual choice in memory when storage fails', () => {
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  mount();
  fireEvent.click(screen.getByRole('switch'));
  expect(screen.getByRole('switch')).toBeChecked();
  expect(document.documentElement.dataset.theme).toBe('dark');
});
it('ignores malformed saved preferences and initializes before application render', () => {
  localStorage.setItem(THEME_KEY, 'invalid');
  dark = true;
  new Function(themeBootstrap)();
  expect(document.documentElement.dataset.theme).toBe('dark');
  localStorage.setItem(THEME_KEY, 'light');
  new Function(themeBootstrap)();
  expect(document.documentElement.dataset.theme).toBe('light');
});
