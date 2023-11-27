import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

import hmvStyle from '@/styles/hmv.module.scss';
import { BrowseResult, BrowseResultFile } from '@/types/api/browseTypes';
import { apiBrowse } from '@/utils/frontend/dataSource/browse';
import BrowseContentCard from './browseContentCard';
import ContentDisplay from './contentDisplay';
import AlbumDetails from './albumDetails';

type BrowserContentListProps = {
    path: string;
}

const BrowserContentList = (props: BrowserContentListProps) => {
    const { path } = props;

    const router = useRouter();

    const [ isLoading, setIsLoading ] = useState<boolean>(false);
    const [ error, setError ] = useState<string | Error | null>(null);
    const [ content, setContent ] = useState<BrowseResult | null>(null);
    const [ contentSelected, setContentSelected ] = useState<BrowseResultFile | null>(null);

    useEffect(() => {
        apiBrowse(path)
        .then((loadedContent) => {
            setIsLoading(false);
            setContent(loadedContent);
        })
        .catch(e => {
            setIsLoading(false);
            setError(e);
        });
    }, [ path ]);

    if (
        isLoading
        || (content === null && error === null)
    ) {
        return <>Loading content...</>
    }

    if (error !== null) {
        return <>Error while loading content: {error.toString()}</>
    }

    const onContentClosedHandler = () => {
        setContentSelected(null);
    };

    const getCurrentPosition = (currentContent: BrowseResultFile): number | null => {
        if (content === null) {
            return null;
        }

        const position = content.content.indexOf(currentContent);
        return position === -1 ? null : position;
    };

    const onPreviousContentClickedHandler = () => {
        if (contentSelected === null) {
            return;
        }

        const currentPosition = getCurrentPosition(contentSelected);

        if (
            currentPosition === null
            || typeof content?.content?.length !== 'number'
            || content?.content?.length <= currentPosition
            || currentPosition <= 0
        ) {
            return;
        }

        const newContent = content?.content[currentPosition - 1] as BrowseResultFile;
        if (!newContent || newContent?.isDirectory === true) {
            return;
        }

        setContentSelected(newContent);
    };

    const onNextContentClickedHandler = () => {
        if (contentSelected === null) {
            return;
        }

        const currentPosition = getCurrentPosition(contentSelected);
        if (
            currentPosition === null
            || typeof content?.content?.length !== 'number'
            || content?.content?.length <= currentPosition + 1
        ) {
            return;
        }

        const newContent = content?.content[currentPosition + 1] as BrowseResultFile;
        if (!newContent || newContent?.isDirectory === true) {
            return;
        }

        setContentSelected(content.content[currentPosition + 1]);
    };

    const onContentSelectedHandler = (content: BrowseResultFile) => {
        if (content?.isDirectory) {
            // Browse directory
            router.push(`/browse/${content.path}`);
            return;
        }

        if (typeof content.storedFile !== 'object') {
            return;
        }

        setContentSelected(content);
    };

    const displayContent = contentSelected === null || contentSelected?.storedFile === null
        ? null
        : <ContentDisplay
            key={contentSelected?.path}
            content={contentSelected?.storedFile}
            closeHandler={onContentClosedHandler}
            previousHandler={onPreviousContentClickedHandler}
            nextHandler={onNextContentClickedHandler}
        />;

    const albumDetails = content?.albumContains ?? content?.albumExactly
        ? <AlbumDetails albumId={(content?.albumContains ?? content?.albumExactly ?? {})?.id} />
        : null;

    const contentElements = content?.content.map(c => {
        return <BrowseContentCard
            key={c.name}
            content={c}
            album={content.albumExactly ?? content.albumContains ?? undefined}
            contentSelected={onContentSelectedHandler}
        />;
    });

    return <div>
        {albumDetails}
        <div className={hmvStyle.browserContent}>
            {Array.isArray(contentElements) && contentElements.length > 0
                ? contentElements
                : <>Directory is empty</>}
            {displayContent}
        </div>
    </div>;
};

export default BrowserContentList;