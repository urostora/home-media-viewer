import type { JSX } from 'react';
import { getVersionString } from '@/utils/package';
import styles from '@/styles/shell.module.scss';
export default function PageFooter(): JSX.Element {
    return <footer className={styles.footer}>{`HMV ${getVersionString()} · A home for your memories`}</footer>;
}
