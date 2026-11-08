import { useAsyncData } from '@/utils/frontend/hooks/useAsyncData';
import { type JSX, useState, useCallback } from 'react';
import { useRouter } from 'next/router';

import BrowseContentCard from './browseContentCard';
import ContentDisplay from './contentDisplay';
import AlbumDetails from './albumDetails';
import ScrollToTop from './scrollToTop';
import { apiBrowse } from '@/utils/frontend/dataSource/browse';

import type { FileResultType } from '@/types/api/fileTypes';
import type { BrowseResultFile } from '@/types/api/browseTypes';

import hmvStyle from '@/styles/hmv.module.scss';
import gallery from '@/styles/gallery.module.scss';

interface BrowserContentListProps {
    path: string;
}

const BrowserContentList = (props: BrowserContentListProps): JSX.Element => {
    const { path } = props;

    const router = useRouter();

    const loader = useCallback(() => apiBrowse(path), [path]);
    const { data: content, isLoading, error, reload, updateData } = useAsyncData(loader);
    const [contentSelected, setContentSelected] = useState<BrowseResultFile | null>(null);

    if (isLoading) {
        return <>Loading content...</>;
    }

    if (error !== null) {
        return <div className={hmvStyle.errorContainer}>{error.toString()}</div>;
    }

    const onContentClosedHandler = (): void => {
        setContentSelected(null);
    };

    const getCurrentPosition = (currentContent: BrowseResultFile): number | null => {
        if (content == null) {
            return null;
        }

        const position = content.content.findIndex((item) => item.path === currentContent.path);
        return position === -1 ? null : position;
    };

    const onPreviousContentClickedHandler = (): void => {
        if (contentSelected === null) {
            return;
        }

        const currentPosition = getCurrentPosition(contentSelected);

        if (
            currentPosition === null ||
            typeof content?.content?.length !== 'number' ||
            content?.content?.length <= currentPosition ||
            currentPosition <= 0
        ) {
            return;
        }

        const newContent = content?.content[currentPosition - 1];
        if (newContent.isDirectory) {
            return;
        }

        setContentSelected(newContent);
    };

    const onNextContentClickedHandler = (): void => {
        if (contentSelected === null) {
            return;
        }

        const currentPosition = getCurrentPosition(contentSelected);
        if (
            currentPosition === null ||
            typeof content?.content?.length !== 'number' ||
            content?.content?.length <= currentPosition + 1
        ) {
            return;
        }

        const newContent = content?.content[currentPosition + 1];
        if (newContent.isDirectory) {
            return;
        }

        setContentSelected(content.content[currentPosition + 1]);
    };

    const onContentSelectedHandler = (content: BrowseResultFile): void => {
        if (content?.isDirectory) {
            // Browse directory
            void router.push(`/browse/${content.path}`);
            return;
        }

        if (typeof content.storedFile !== 'object') {
            return;
        }

        setContentSelected(content);
    };

    const onContentChanged = (): void => {
        reload();
    };

    const onThumbnailUpdated = (file: FileResultType): void => {
        updateData((current) => ({
            ...current,
            content: current.content.map((item) =>
                item.storedFile?.id === file.id ? { ...item, storedFile: file } : item,
            ),
        }));
    };

    const displayContent =
        contentSelected?.storedFile === null ? null : (
            <ContentDisplay
                key={contentSelected?.path}
                content={contentSelected?.storedFile}
                onThumbnailUpdated={onThumbnailUpdated}
                closeHandler={onContentClosedHandler}
                previousHandler={onPreviousContentClickedHandler}
                nextHandler={onNextContentClickedHandler}
            />
        );

    const albumDetailsList = content?.albumContains.map((ac) => (
        <AlbumDetails key={ac.id} albumId={ac.id} showDetails={true} />
    ));

    const contentElements = content?.content.map((c) => {
        return (
            <BrowseContentCard
                key={c.name}
                content={c}
                contentSelected={onContentSelectedHandler}
                contentChanged={onContentChanged}
            />
        );
    });

    return (
        <div>
            <>{albumDetailsList}</>
            <div className={gallery.browserContent}>
                {Array.isArray(contentElements) && contentElements.length > 0 ? (
                    contentElements
                ) : (
                    <>Directory is empty</>
                )}
                {displayContent}
                <ScrollToTop />
            </div>
        </div>
    );
};

export default BrowserContentList;
