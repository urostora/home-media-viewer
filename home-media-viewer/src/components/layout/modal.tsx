import * as Dialog from '@radix-ui/react-dialog';
import { useRef, type ReactNode, type KeyboardEvent, type JSX } from 'react';
import styles from '@/styles/dialog.module.scss';

interface ModalProps {
    title: string;
    children: ReactNode;
    onClose: () => void;
    fullscreen?: boolean;
    onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
}

export default function Modal({ title, children, onClose, fullscreen = false, onKeyDown }: ModalProps): JSX.Element {
    const opener = useRef<HTMLElement | null>(null);
    return (
        <Dialog.Root
            open
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            <Dialog.Portal>
                <Dialog.Overlay className={styles.overlay} />
                <Dialog.Content
                    className={fullscreen ? styles.viewer : styles.panel}
                    aria-describedby={undefined}
                    onKeyDown={onKeyDown}
                    onOpenAutoFocus={() => {
                        opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
                    }}
                    onCloseAutoFocus={(event) => {
                        event.preventDefault();
                        const target = opener.current?.isConnected
                            ? opener.current
                            : document.getElementById('main-content');
                        target?.focus();
                    }}
                >
                    <Dialog.Title className={styles.srOnly}>{title}</Dialog.Title>
                    <Dialog.Close className={styles.close} aria-label="Close dialog">
                        <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            aria-hidden="true"
                            focusable="false"
                        >
                            <path d="M6 6L18 18M18 6L6 18" />
                        </svg>
                    </Dialog.Close>
                    {children}
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
