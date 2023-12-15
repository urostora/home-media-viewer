import { type BrowseResultFile } from "@/types/api/browseTypes"

import hmvStyle from '@/styles/hmv.module.scss';
import { type MouseEventHandler, useState } from "react";
import { apiFileDelete, apiFileRefreshMetadata } from "@/utils/frontend/dataSource/file";
import { type AlbumResultType } from "@/types/api/albumTypes";
import { apiAlbumAdd } from "@/utils/frontend/dataSource/album";

interface BrowseContentMenuProps {
    content: BrowseResultFile,
    album?: AlbumResultType,
}

interface MenuItem {
    key: string,
    name: string,
    clickHandler?: MouseEventHandler<HTMLLIElement>,
}

const OperationCode = {
    refreshMetadata: 'refreshMetadata',
    addFile: 'addFile',
    deleteFile: 'deleteFile',
    addAlbum: 'addAlbum',
    deleteAlbum: 'deleteAlbum',
}

const BrowseContentMenu = (props: BrowseContentMenuProps): JSX.Element => {
    const { content, album } = props;

    const [ isOpen, setIsOpen ] = useState<boolean>(false);
    const [ operationInProgress, setOpertationInProgress ] = useState<string | null>(null);

    const placeholderClickedHandler = (): void => {
        setIsOpen(!isOpen);
    };

    const addAlbumHandler = (): void => {
        if (album !== undefined) {
            return;
        }

        setOpertationInProgress(OperationCode.addAlbum);
        void apiAlbumAdd(content.path)
        .finally(() => {
            setOpertationInProgress(null);
        });
    };

    const refreshMetadataHandler = (): void => {
        if (typeof content.storedFile?.id !== 'string') {
            return;
        }

        setOpertationInProgress(OperationCode.refreshMetadata);
        void apiFileRefreshMetadata(content.storedFile.id)
        .finally(() => {
            setOpertationInProgress(null);
        });
    };

    const deleteFileHandler = (): void => {
        if (typeof content.storedFile?.id !== 'string') {
            return;
        }

        setOpertationInProgress(OperationCode.deleteFile);

        void apiFileDelete(content.storedFile.id)
        .finally(() => {
            setOpertationInProgress(null);
        });
    };

    // collect menu items
    const menuList: MenuItem[] = [];

    if (content.storedFile != null) {
        menuList.push({
            key: OperationCode.refreshMetadata,
            name: 'Refresh metadata',
            clickHandler: refreshMetadataHandler,
        });

        menuList.push({
            key: OperationCode.deleteFile,
            name: 'Delete file',
            clickHandler: deleteFileHandler,
        });
    } else if (content.isDirectory && content.exactAlbum === null) {
        // directory out of an album

        menuList.push({
            key: OperationCode.addAlbum,
            name: 'Add album',
            clickHandler: addAlbumHandler,
        });
    }

    if (menuList.length === 0) {
        return <></>;
    }

    const menuItems = menuList.map((mi: MenuItem) => 
        (<li
            key={mi.key}
            className={operationInProgress !== null ? hmvStyle.operationInProgress : ''}
            onClick={mi.clickHandler}
        >
            {mi.name}
            {operationInProgress === mi.key ? '...' : null}
        </li>)
    );

    return (
        <div className={hmvStyle.menuOuter}>
            <div className={`${hmvStyle.menu} ${isOpen ? hmvStyle.open : ''}`}>
                <div className={hmvStyle.placeholder} onClick={placeholderClickedHandler}>{isOpen ? '[X]' : '...'}</div>
                <div className={hmvStyle.menuContent}>
                    <ul>
                        {menuItems}
                    </ul>
                </div>
            </div>
        </div>
    );
}

export default BrowseContentMenu;