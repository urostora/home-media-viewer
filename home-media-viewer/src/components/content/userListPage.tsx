import { useState, useEffect } from 'react';

import { UserDataType } from "@/types/api/userTypes";
import { apiLoadUsers } from '@/utils/frontend/dataSource/user';

import style from '@/styles/hmv.module.scss';
import UserList from './userList';


const UserListPage = () => {
    const [ isLoading, setIsLoading ] = useState<boolean>(true);
    const [ users, setUsers ] = useState<UserDataType[] | null | undefined>(undefined);
    const [ error, setError ] = useState<string | null>(null);

    useEffect(() => {
        console.log('UserListPage effect');
        loadUsers();
    }, []);

    const loadUsers = () => {
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

    const onUserChanged = (user: UserDataType) => {
        console.log(user);
        loadUsers();
    }

    let content = null;
    if (isLoading) {
        content = <>Loading...</>;
    } else if (error) {
        content = <div className={style.errorContainer}>{error}</div>;
    } else if (users) {
        content = <UserList users={users} onUserChanged={onUserChanged} />;
    }

    return <div className={style.generalListContainer}>{content}</div>;
};

export default UserListPage;