import { type JSX, type ReactNode } from 'react';
import styles from '@/styles/shell.module.scss';
export default function PageBody({ children }: { children?: ReactNode }): JSX.Element {
  return (
    <main id="main-content" tabIndex={-1} className={styles.body}>
      {children}
    </main>
  );
}
