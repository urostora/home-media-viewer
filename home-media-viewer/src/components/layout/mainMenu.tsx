import { type JSX, useContext, useState, useRef, useId } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { AuthContext } from '../auth/authContext';
import styles from '@/styles/shell.module.scss';

export default function MainMenu(): JSX.Element {
    const { pathname } = useRouter();
    const { isAdmin } = useContext(AuthContext);
    const [isOpen, setIsOpen] = useState(false);
    const toggle = useRef<HTMLButtonElement>(null);
    const id = useId();
    const links = [
        { href: '/album', label: 'Albums', active: pathname === '/' || pathname.startsWith('/album') },
        { href: '/search', label: 'Search', active: pathname.startsWith('/search') },
        ...(isAdmin
            ? [
                  { href: '/browse', label: 'Browse', active: pathname.startsWith('/browse') },
                  { href: '/user', label: 'Users', active: pathname.startsWith('/user') },
              ]
            : []),
    ];
    return (
        <nav
            aria-label="Main navigation"
            className={styles.nav}
            data-testid="main-menu"
            onKeyDown={(event) => {
                if (event.key === 'Escape' && isOpen) {
                    setIsOpen(false);
                    toggle.current?.focus();
                }
            }}
        >
            <button
                ref={toggle}
                type="button"
                className={styles.menuToggle}
                aria-expanded={isOpen}
                aria-controls={id}
                onClick={() => setIsOpen(!isOpen)}
            >
                Menu {isOpen ? '−' : '+'}
            </button>
            <div id={id} className={`${styles.navLinks} ${isOpen ? styles.isOpen : ''}`} data-testid="menu-links">
                {links.map((link) => (
                    <Link
                        key={link.href}
                        href={link.href}
                        className={styles.navLink}
                        aria-current={link.active ? 'page' : undefined}
                        onClick={() => {
                            setIsOpen(false);
                            if (isOpen) toggle.current?.focus();
                        }}
                    >
                        {link.label}
                    </Link>
                ))}
            </div>
        </nav>
    );
}
