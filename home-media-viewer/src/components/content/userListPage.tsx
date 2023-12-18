import { useState, useEffect } from 'react';

import UserList from './userList';
import { apiLoadUsers } from '@/utils/frontend/dataSource/user';

import type { UserDataType } from "@/types/api/userTypes";

import style from '@/styles/hmv.module.scss';


const UserListPage = (): JSX.Element => {
    const [ isLoading, setIsLoading ] = useState<boolean>(true);
    const [ users, setUsers ] = useState<UserDataType[] | null | undefined>(undefined);
    const [ error, setError ] = useState<string | null>(null);

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = (): void => {
        setIsLoading(true);
        setError(null);
        setUsers(undefined);

        apiLoadUsers({ take: 0 })
            .then((result) => {
                setUsers(result);
            })
            .catch(e => {
                setError(`${e}`);
            })
            .finally(() => {
                setIsLoading(false);
            });
    }

    const onUserChanged = (user: UserDataType): void => {
        loadUsers();
    }

    let content = null;
    if (isLoading) {
        content = <>Loading...</>;
    } else if (typeof error === 'string') {
        content = <div className={style.errorContainer}>{error}</div>;
    } else if (Array.isArray(users)) {
        content = <UserList users={users} onUserChanged={onUserChanged} />;
    }

    return (<div className={style.generalListContainer}>
        <div className={style.listTitle}>Users</div>
        {content}
        </div>);
};

export default UserListPage;