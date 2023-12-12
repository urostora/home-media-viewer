import { useState } from 'react';

import { apiAddUser, apiEditUser, apiGetUserData, apiUserAlbumConnection } from '@/utils/frontend/dataSource/user';
import { apiLoadAlbums } from '@/utils/frontend/dataSource/album';

import type { AlbumResultType } from '@/types/api/albumTypes';
import type { UserDataType, UserExtendedDataType } from '@/types/api/userTypes';

import style from '@/styles/hmv.module.scss';

interface UserRowItemProperties {
    onUserChanged?: (user: UserDataType) => void;
    user?: UserDataType;
}

interface UserAlbumConnection {
    albumId: string,
    albumName: string,
    isAlbumDeleted: boolean,
    userId: string,
    isConnected: boolean,
}

const getUserAlbumConnections = (user: UserExtendedDataType, albums: AlbumResultType[]): UserAlbumConnection[] => {
    return albums
        .sort((album1, album2) => {
            if (album1.name.toLocaleLowerCase() < album2.name.toLocaleLowerCase()) { return -1; }
            if (album1.name.toLocaleLowerCase() > album2.name.toLocaleLowerCase()) { return 1; }
            return 0;
        })
        .map(album => {
            return {
                albumId: album.id,
                albumName: album.name,
                isAlbumDeleted: album.status === 'Deleted',
                userId: user.id,
                isConnected: user.albums.findIndex(a => a.id === album.id) >= 0
            };
        })
};

const UserRowItem = (props: UserRowItemProperties): JSX.Element => {
    const {user, onUserChanged } = props;

    const [ isInEditMode, setIsInEditMode ] = useState<boolean>(typeof user !== 'object');
    const [ isInProgress, setIsInProgress ] = useState<boolean>(false);
    const [ error, setError ] = useState<string | null>(null);

    const [ extendedUserData, setExtendedUserData ] = useState<UserExtendedDataType | undefined | null>(undefined);
    const [ allAlbums, setAllAlbums ] = useState<AlbumResultType[] | undefined | null>(undefined);
    const [ isLoadingAlbumData, setIsLoadingAlbumData ] = useState<boolean>(false);
    const [ albumLoadingError, setAlbumLoadingError ] = useState<string | null>(null);

    const ensureAlbumConnectionsAreLoaded = (): void => {
        if (user === undefined) {
            return;
        }

        // load connected albums
        if (extendedUserData === undefined) {
            setIsLoadingAlbumData(true);
            apiGetUserData(user?.id)
                .then(userData => {
                    setExtendedUserData(userData);

                    if (allAlbums !== undefined && extendedUserData !== undefined) {
                        setIsLoadingAlbumData(false);
                    }
                })
                .catch(e => {
                    setAlbumLoadingError(`${e}`);
                    setExtendedUserData(null);
                });
        }

        if (allAlbums === undefined) {
            setIsLoadingAlbumData(true);
            apiLoadAlbums({ status: ['Active', 'Disabled' ], metadataStatus: undefined})
                .then(albums => {
                    setAllAlbums(albums);

                    if (albums !== undefined && extendedUserData !== undefined) {
                        setIsLoadingAlbumData(false);
                    }
                })
                .catch(e => {
                    setAlbumLoadingError(`${e}`);
                    setAllAlbums(null);
                });
        }
    };

    const onEditClicked = (): void => {
        setIsInEditMode(true);
        ensureAlbumConnectionsAreLoaded();
    };

    const onSaveClicked = (e: React.SyntheticEvent): void => {
        const row = e.currentTarget.closest(`div.${style.row}`);
        if (row === null) {
            return;
        }

        setError(null);
        setIsInProgress(true);

        const doSaveProcess = async (rowElement: Element): Promise<void> => {
            const id = rowElement.getAttribute('data-id') ?? '';
            const name = rowElement.querySelector<HTMLInputElement>('input[name="name"]')?.value;
            const email = rowElement.querySelector<HTMLInputElement>('input[name="email"]')?.value;
            const password = rowElement.querySelector<HTMLInputElement>('input[name="newPassword"]')?.value;
            const isAdmin = rowElement.querySelector<HTMLInputElement>('input[name="isAdmin"]')?.checked;

            try {
                let result: UserDataType | undefined;
                if (id.length > 0) {
                    // modify user
                    const userUpdateData = {
                        name,
                        email,
                        isAdmin,
                        password: password !== undefined && password.length > 0 ? password : undefined,
                    }

                    result = await apiEditUser(id, userUpdateData);
                } else {
                    // add user
                    if (name === undefined || email === undefined || isAdmin === undefined || password === undefined) {
                        throw Error('Name, e-mail and password must be set');
                    }

                    const newUserData = {
                        name,
                        email,
                        isAdmin,
                        password
                    }

                    result = await apiAddUser(newUserData);
                }

                if (typeof onUserChanged === 'function') {
                    onUserChanged(result);
                }
            } catch (e) {
                setError(`${e}`);
            }
            finally {
                setIsInProgress(false);
            }
        }

        void doSaveProcess(row);
    }

    const onCancelEdit = (): void => {
        setIsInEditMode(false);
    };

    const onAlbumConnectionChanged = (e: React.SyntheticEvent<HTMLInputElement>): void => {
        e.preventDefault();
        const cb = e.currentTarget;

        if (user === undefined) {
            return;
        }

        const container = cb.closest('div');
        if (container === null) {
            return;
        }

        const userId = user.id;
        const albumId = container.getAttribute('data-album-id');
        if (albumId === null) {
            return;
        }

        const connect = (e.currentTarget as HTMLInputElement).checked;

        cb.disabled = true;

        const connectProcess = async (userId: string, albumId: string, connect: boolean): Promise<void> => {
            try {
                setAlbumLoadingError(null);
                await apiUserAlbumConnection(userId, albumId, connect);

                cb.checked = connect;
            } catch(e) {
                setAlbumLoadingError(`${e}`);
            } finally {
                cb.disabled = false;
            }
        }
        
        void connectProcess(userId, albumId, connect);
    };

    let content = <></>;
    let errorContent = null;

    if (error !== null) {
        errorContent = <div className={`${style.fullWidth} ${style.errorContainer}`}>{error}</div>;
    }
    
    if (!isInEditMode && user !== undefined) {
        content = (<div className={style.row}>
            <div className={style.emailField}>{user.name}</div>
            <div className={style.nameField}>{user.email}</div>
            <div className={style.isAdminField}>{user.isAdmin ? String.fromCodePoint(0x2714) : ''}</div>
            <div></div>
            <div><button className={style.buttonElement} onClick={onEditClicked}>Edit</button></div>
        </div>);
    } else if (isInEditMode) {
        let albumConnectionSection = null;
        if (user !== undefined) {
            // load album connections
            if (Array.isArray(allAlbums) && extendedUserData !== null && extendedUserData !== undefined) {
                const albumConnections = getUserAlbumConnections(extendedUserData, allAlbums);

                const albumConnectionElements = albumConnections.map(ac => {
                    return (
                        <div
                            key={ac.albumId}
                            className={`${style.connectionElement} ${ac.isAlbumDeleted ? style.disabled : ''}`}
                            data-album-id={ac.albumId}
                            data-user-id={ac.userId}
                        >
                            <input type="checkbox" value={1} disabled={ac.isAlbumDeleted} defaultChecked={ac.isConnected} onChange={onAlbumConnectionChanged} />
                            <span>{ac.albumName}</span>
                        </div>);
                });

                albumConnectionSection = <div className={style.albumConnectionContainer}>{albumConnectionElements}</div>;
            } else {
                if (isLoadingAlbumData || allAlbums === undefined || extendedUserData === undefined) {
                    albumConnectionSection = <>... Loading connected albums</>;
                } else if (albumLoadingError !== null) {
                    albumConnectionSection = <div className={`${style.fullWidth} ${style.errorContainer}`}>{albumLoadingError}</div>;
                } else {
                    albumConnectionSection = <>... Could not load connected albums</>;
                }
            }
        }

        // edit / add user data
        content = (
            <div className={`${style.isEditing} ${style.row}`} data-id={user?.id ?? ''}>
                {user === undefined ? null : <div className={style.fullWidthField}>Add new user</div>}
                <div className={style.nameField}><span>Name</span><input type="text" name="name" required defaultValue={user?.name ?? ''} placeholder="Name" /></div>
                <div className={style.emailField}><span>E-mail</span><input type="email" name="email" required defaultValue={user?.email ?? ''} placeholder="E-mail address" /></div>
                <div className={style.isAdminField}><span>Admin</span><input type="checkbox" name="isAdmin" value={1} defaultChecked={user?.isAdmin ?? false} /></div>
                <div className={style.passwordField}><span>{user === undefined ? 'Reset password' : 'Password'}</span><input type="password" name="newPassword" autoComplete="off" defaultValue="" placeholder="Password" /></div>
                <div className={style.fullWidthField}>
                    <button className={`${style.buttonElement} ${style.primaryButton}`} onClick={onSaveClicked} disabled={isInProgress}>Save</button>
                    {user === undefined ? <button className={style.buttonElement} onClick={onCancelEdit}>Cancel</button> : null}
                </div>
                {albumConnectionSection}
                {errorContent}
            </div>);
    }

    return content;
};

export default UserRowItem;