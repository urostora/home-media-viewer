import type { JSX } from 'react';
import MainMenu from './mainMenu';
import TitleArea from './titleArea';
import UserHeader from './userHeader';
import styles from '@/styles/shell.module.scss';

export default function PageHeader(): JSX.Element {
  return (
    <header className={styles.header}>
      <a className={styles.skipLink} href="#main-content">
        Skip to content
      </a>
      <div className={styles.headerInner}>
        <TitleArea />
        <MainMenu />
        <UserHeader />
      </div>
    </header>
  );
}
