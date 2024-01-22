import { useContext } from 'react';

import { AuthContext } from '@/components/auth/authContext';

import hmvStyle from '@/styles/hmv.module.scss';

const UserHeader = (): JSX.Element => {
    const authContext = useContext(AuthContext);

    const onLogoutClicked = (): void => {
        if (typeof authContext.logout === 'function') {
            authContext.logout();
        }
    };

    return (
        <div className={hmvStyle.userHeaderContainer}>
            <span className={hmvStyle.userName}>{authContext.name}</span>
            <button className={hmvStyle.buttonElement} onClick={onLogoutClicked}>Logout</button>
        </div>
    );
}

export default UserHeader;