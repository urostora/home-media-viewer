import { BrowseResultFile } from "@/types/api/browseTypes"

import hmvStyle from '@/styles/hmv.module.scss';
import { MouseEventHandler, useState } from "react";
import { apiFileDelete, apiFileRefreshMetadata } from "@/utils/frontend/dataSource/file";
import { AlbumResultType } from "@/types/api/albumTypes";
import album from "@/pages/api/album";

type BrowseContentMenuProps = {
    content: BrowseResultFile,
    album?: AlbumResultType,
}

type MenuItem = {
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

const BrowseContentMenu = (props: BrowseContentMenuProps) => {
    const { content, album } = props;

    const [ isOpen, setIsOpen ] = useState<boolean>(false);
    const [ operationInProgress, setOpertationInProgress ] = useState<string | null>(null);

    const placeholderClickedHandler = () => {
        setIsOpen(isOpen ? false : true);
    };

    const addAlbumHandler = async () => {
        if (album) {
            return;
        }

        try {
            setOpertationInProgress(OperationCode.addAlbum);
            await apiFileRefreshMetadata(content.path);
        } catch (e) {
            // error
        }

        setOpertationInProgress(null);
    };

    const refreshMetadataHandler = async () => {
        if (typeof content.storedFile?.id !== 'string') {
            return;
        }

        try {
            setOpertationInProgress(OperationCode.refreshMetadata);
            await apiFileRefreshMetadata(content.storedFile.id);
        } catch (e) {
            // error
        }

        setOpertationInProgress(null);
    };

    const deleteFileHandler = async () => {
        if (typeof content.storedFile?.id !== 'string') {
            return;
        }

        try {
            setOpertationInProgress(OperationCode.deleteFile);
            await apiFileDelete(content.storedFile.id);
        } catch (e) {
            // error
        }

        setOpertationInProgress(null);
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
    } else if (!album && content.isDirectory && !content?.storedAlbum) {
        // directory out of an album

        menuList.push({
            key: OperationCode.addAlbum,
            name: 'Add album',
            clickHandler: addAlbumHandler,
        });
    }

    if (menuList.length === 0) {
        return null;
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