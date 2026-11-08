import { type JSX, useCallback } from 'react';

import UserList from './userList';
import { apiLoadUsers } from '@/utils/frontend/dataSource/user';

import { useAsyncData } from '@/utils/frontend/hooks/useAsyncData';

import style from '@/styles/hmv.module.scss';

const UserListPage = (): JSX.Element => {
    const loader = useCallback(() => apiLoadUsers({ take: 0 }), []);
    const { data: users, isLoading, error, reload: onUserChanged } = useAsyncData(loader);

    let content = null;
    if (isLoading) {
        content = <>Loading...</>;
    } else if (typeof error === 'string') {
        content = (
            <div role="alert" className={style.errorContainer}>
                {error}
            </div>
        );
    } else if (Array.isArray(users)) {
        content = <UserList users={users} onUserChanged={onUserChanged} />;
    }

    return (
        <div className={style.generalListContainer}>
            <h1 className={style.listTitle}>Users</h1>
            {content}
        </div>
    );
};

export default UserListPage;
