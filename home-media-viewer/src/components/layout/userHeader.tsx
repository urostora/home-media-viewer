import { type JSX, useContext } from 'react';

import { AuthContext } from '@/components/auth/authContext';

import hmvStyle from '@/styles/hmv.module.scss';
import styles from '@/styles/shell.module.scss';
import ThemeSwitch from './themeSwitch';

const UserHeader = (): JSX.Element => {
    const authContext = useContext(AuthContext);

    const onLogoutClicked = (): void => {
        if (typeof authContext.logout === 'function') {
            authContext.logout();
        }
    };

    return (
        <div className={styles.user} data-testid="user-header">
            <ThemeSwitch />
            <span className={styles.userName} data-testid="user-name">
                {authContext.name}
            </span>
            <button className={hmvStyle.buttonElement} onClick={onLogoutClicked} disabled={authContext.isLoggingOut}>
                {authContext.isLoggingOut ? 'Logging out...' : 'Logout'}
            </button>
        </div>
    );
};

export default UserHeader;
