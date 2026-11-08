import type { JSX } from 'react';
import Link from 'next/link';
import styles from '@/styles/shell.module.scss';

export default function TitleArea({ title = 'Home media viewer' }: { title?: string }): JSX.Element {
    return (
        <div data-testid="title-area">
            <Link className={styles.brand} href="/">
                <span className={styles.brandIcon} aria-hidden="true">
                    ▧
                </span>
                <span>{title}</span>
            </Link>
        </div>
    );
}
