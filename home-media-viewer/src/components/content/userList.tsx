import { UserDataType } from "@/types/api/userTypes";

import style from '@/styles/hmv.module.scss';
import UserRowItem from './userRowItem';


type UserListProperties = {
    users: UserDataType[];
    onUserChanged?(user: UserDataType): void;
}

const UserList = (props: UserListProperties) => {
    const {users, onUserChanged} = props;

    console.log(users);

    return (<div className={style.userListContainer}>
        <div key="header" className={`${style.row} ${style.tableHeader}`}>
            <div className={style.nameField}>Name</div>
            <div className={style.emailField}>Email</div>
            <div className={style.isAdminField}>Admin</div>
            <div></div>
            <div className={style.actionField}>Actions</div>
        </div>
        {users.map((u) => (<UserRowItem key={u.id} user={u} onUserChanged={onUserChanged} />))}
        <UserRowItem key={''} onUserChanged={onUserChanged} />
    </div>);
};

export default UserList;