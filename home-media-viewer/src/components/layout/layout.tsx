import { type JSX, useState, useEffect, useCallback, useRef, type ReactElement } from 'react';
import Head from 'next/head';

import LayoutLoggedIn from '@/components/layout/layoutLoggedIn';
import { AuthContext, type AuthData } from '@/components/auth/authContext';
import LayoutNotLoggedIn from '@/components/layout/layoutNotLoggedIn';
import { apiCurrentUser, apiLogout } from '@/utils/frontend/dataSource/auth';
import { AUTH_RECHECK_EVENT } from '@/utils/frontend/dataSource/apiFetch';

import styles from '@/styles/shell.module.scss';

const AUTH_CHANGE_KEY = 'hmv:auth-change';
const clearAuthHints = (): void => {
    // Older clients used the current directory as the default cookie path.
    const paths = new Set(['/']);
    const segments = window.location.pathname.split('/').filter(Boolean);
    for (let length = 1; length <= segments.length; length++) {
        const path = `/${segments.slice(0, length).join('/')}`;
        paths.add(path);
        paths.add(`${path}/`);
    }
    for (const name of ['hmv-email', 'hmv-name', 'hmv-isadmin']) {
        for (const path of paths) document.cookie = `${name}=; Max-Age=0; Path=${path}; SameSite=Lax`;
    }
};
const notifyOtherTabs = (): void => {
    try {
        // A notification only; tabs always ask the server for current identity.
        localStorage.setItem(AUTH_CHANGE_KEY, `${Date.now()}:${Math.random()}`);
    } catch {
        // Storage may be disabled. Focus revalidation remains available.
    }
};

export default function Layout({ children }: { children: ReactElement }): JSX.Element {
    const [isAuthProcessed, setIsAuthProcessed] = useState(false);
    const [authData, setAuthData] = useState<AuthData>({ isLoggedIn: false });
    const [authError, setAuthError] = useState<string | null>(null);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const mounted = useRef(false);
    const loggingOut = useRef(false);
    const requestVersion = useRef(0);
    const identityRequest = useRef<AbortController | null>(null);

    const cancelIdentityRequest = useCallback((): void => {
        requestVersion.current++;
        identityRequest.current?.abort();
        identityRequest.current = null;
    }, []);

    const refreshAuth = useCallback(async (): Promise<void> => {
        if (!mounted.current || loggingOut.current || identityRequest.current !== null) return;
        const version = ++requestVersion.current;
        const controller = new AbortController();
        identityRequest.current = controller;
        try {
            const user = await apiCurrentUser(controller.signal);
            if (!mounted.current || version !== requestVersion.current) return;
            clearAuthHints();
            setAuthData(user === null ? { isLoggedIn: false } : { ...user, isLoggedIn: true });
            setAuthError(null);
            setIsAuthProcessed(true);
        } catch {
            if (mounted.current && version === requestVersion.current) {
                setAuthError('Could not confirm your session. Please retry.');
            }
        } finally {
            if (identityRequest.current === controller) identityRequest.current = null;
        }
    }, []);

    useEffect(() => {
        mounted.current = true;
        // This starts an external request; state updates happen only after it settles.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void refreshAuth();
        const recheck = (): void => {
            cancelIdentityRequest();
            void refreshAuth();
        };
        const onStorage = (event: StorageEvent): void => {
            if (event.key === AUTH_CHANGE_KEY || event.key === null) recheck();
        };
        window.addEventListener(AUTH_RECHECK_EVENT, recheck);
        window.addEventListener('focus', recheck);
        window.addEventListener('storage', onStorage);
        return () => {
            mounted.current = false;
            cancelIdentityRequest();
            window.removeEventListener(AUTH_RECHECK_EVENT, recheck);
            window.removeEventListener('focus', recheck);
            window.removeEventListener('storage', onStorage);
        };
    }, [refreshAuth, cancelIdentityRequest]);

    const logout = (): void => {
        if (loggingOut.current) return;
        loggingOut.current = true;
        cancelIdentityRequest();
        setIsLoggingOut(true);
        setAuthError(null);
        void apiLogout()
            .then(() => {
                clearAuthHints();
                notifyOtherTabs();
                if (!mounted.current) return;
                setAuthData({ isLoggedIn: false });
                setIsAuthProcessed(true);
            })
            .catch(() => {
                if (mounted.current) setAuthError('Logout could not be confirmed. Please retry.');
            })
            .finally(() => {
                loggingOut.current = false;
                if (mounted.current) setIsLoggingOut(false);
            });
    };

    const userAuthenticated = (): void => {
        // Login responses and legacy display hints do not become client authority.
        cancelIdentityRequest();
        setIsAuthProcessed(false);
        notifyOtherTabs();
        void refreshAuth();
    };

    let content;
    if (!isAuthProcessed) {
        content =
            authError === null ? (
                <div className={styles.sessionMessage} role="status">
                    Initiating...
                </div>
            ) : null;
    } else if (authData.isLoggedIn) {
        content = (
            <AuthContext.Provider value={{ ...authData, logout, isLoggingOut }}>
                <LayoutLoggedIn>{children}</LayoutLoggedIn>
            </AuthContext.Provider>
        );
    } else {
        content = <LayoutNotLoggedIn onUserAuthenticated={userAuthenticated} />;
    }

    return (
        <>
            <Head>
                <title>Home Media Viewer</title>
                <meta name="description" content="Your photos, videos, and family memories." />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <link rel="icon" href="/favicon.ico" />
            </Head>
            <div className={styles.shell}>
                {authError !== null && (
                    <div role="alert">
                        {authError}{' '}
                        <button
                            type="button"
                            disabled={isLoggingOut}
                            onClick={() => {
                                if (authError.startsWith('Logout')) logout();
                                else void refreshAuth();
                            }}
                        >
                            Retry
                        </button>
                    </div>
                )}
                {content}
            </div>
        </>
    );
}
