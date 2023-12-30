import { type MouseEventHandler, useState } from "react";

import { apiFileDelete, apiFileRefreshMetadata, apiGetFile } from "@/utils/frontend/dataSource/file";
import { apiAlbumAdd, apiAlbumUpdate } from "@/utils/frontend/dataSource/album";

import type { FileResultType } from "@/types/api/fileTypes";
import type { BrowseResultFile } from "@/types/api/browseTypes"

import hmvStyle from '@/styles/hmv.module.scss';

interface BrowseContentMenuProps {
    content: BrowseResultFile,
}

interface MenuItem {
    key: string,
    name: string,
    clickHandler?: MouseEventHandler<HTMLLIElement>,
    data?: Record<string, string>,
}

interface SetAsThumbnailData {
    albumId: string;
}

const OperationCode = {
    refreshMetadata: 'refreshMetadata',
    addFile: 'addFile',
    deleteFile: 'deleteFile',
    addAlbum: 'addAlbum',
    deleteAlbum: 'deleteAlbum',
    setThumbnail: 'setThumbnail',
}

const getDataObjectFromElement = <T extends object>(element: HTMLElement): T | null => {
    const dataStringValue = element.getAttribute('data-data');
    if (dataStringValue === null) {
        return null;
    }

    const dataValue = JSON.parse(dataStringValue);
    if (dataValue === undefined) {
        return null;
    }

    return dataValue as T;
}

const BrowseContentMenu = (props: BrowseContentMenuProps): JSX.Element => {
    const { content } = props;

    const [ isOpen, setIsOpen ] = useState<boolean>(false);
    const [ operationInProgress, setOpertationInProgress ] = useState<string | null>(null);

    const [ isLoadingFileData, setIsLoadingFileData ] = useState<boolean>(false);
    const [ fileData, setFileData ] = useState<FileResultType | null | undefined>(undefined);

    const loadFileData = (): void => {
        if (content?.storedFile === null) {
            return;
        }

        setIsLoadingFileData(true);

        void apiGetFile(content.storedFile.id)
            .then(fileData => {
                setFileData(fileData);
            })
            .catch((e) => {
                console.log(`Error while loading file data: ${e}`);
                setFileData(null);
            })
            .finally(() => {
                setIsLoadingFileData(false);
            });
    }

    if (isOpen && fileData === undefined && !isLoadingFileData) {
        loadFileData();
    }

    const placeholderClickedHandler = (): void => {
        setIsOpen(!isOpen);
    };

    const addAlbumHandler = (): void => {
        if (content.exactAlbum !== null) {
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

    const setThumbnailHandler = (e: React.SyntheticEvent<HTMLLIElement>): void => {
        const data = getDataObjectFromElement<SetAsThumbnailData>(e.currentTarget);
        if (data === null || content.storedFile?.id === undefined) {
            return;
        }

        const { albumId } = data;

        setOpertationInProgress(`${OperationCode.setThumbnail}-${albumId}`);

        void apiAlbumUpdate(albumId, { thumbnailFileId: content.storedFile?.id })
            .finally(() => {
                setOpertationInProgress(null);
            });
    }

    // collect menu items
    const menuList: MenuItem[] = [];
    
    if (content.isDirectory && content.exactAlbum === null) {
        // directory out of an album

        menuList.push({
            key: OperationCode.addAlbum,
            name: 'Add album',
            clickHandler: addAlbumHandler,
        });
    }

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
    }

    if (typeof fileData === 'object' && Array.isArray(fileData?.albums) && !fileData.isDirectory) {
        for(const album of fileData.albums) {
            menuList.push({
                key: `${OperationCode.setThumbnail}-${album.id}`,
                name: `Set as ${album.name} thumbnail`,
                clickHandler: setThumbnailHandler,
                data: {
                    albumId: album.id,
                }
            });
        }
    }

    if (menuList.length === 0) {
        return <></>;
    }

    const menuItems = menuList.map((mi: MenuItem) => 
        (<li
            key={mi.key}
            className={operationInProgress !== null ? hmvStyle.operationInProgress : ''}
            onClick={mi.clickHandler}
            data-data={JSON.stringify(mi.data ?? null)}
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