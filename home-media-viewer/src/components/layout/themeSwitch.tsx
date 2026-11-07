import { useTheme } from './themeProvider';
import styles from '@/styles/shell.module.scss';

export default function ThemeSwitch(): React.JSX.Element {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={theme === 'dark'}
      aria-label="Dark mode"
      onClick={toggle}
      className={styles.themeSwitch}
    >
      <span aria-hidden="true">{theme === 'dark' ? '☾' : '☀'}</span>
      <span>Dark mode</span>
      <span className={styles.switchTrack} aria-hidden="true">
        <span />
      </span>
    </button>
  );
}
