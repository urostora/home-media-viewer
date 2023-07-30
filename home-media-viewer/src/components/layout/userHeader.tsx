import { useContext } from 'react';
import hmvStyle from '@/styles/hmv.module.scss';
import Link from 'next/link';
import { AuthContext } from '../auth/authContext';

const UserHeader = () => {
    const authContext = useContext(AuthContext);

    const onLogoutClicked = () => {
        if (typeof authContext.logout === 'function') {
            authContext.logout();
        }
    };

    return (
        <div className={hmvStyle.userHeaderContainer}>
            <span className={hmvStyle.userName}>
                <Link href="/album">{authContext.name}</Link>
            </span>
            <button onClick={onLogoutClicked}>Logout</button>
        </div>
    );
}

export default UserHeader;