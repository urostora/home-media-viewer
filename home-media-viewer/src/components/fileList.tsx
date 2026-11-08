import { type JSX, useState, useEffect, useCallback } from 'react';

import ContentFilter, { type ContentFilterType } from '@/components/content/filter/contentFilter';
import ContentList from '@/components/content/contentList';
import ContentDisplay from '@/components/content/contentDisplay';

import { apiLoadFiles } from '@/utils/frontend/dataSource/file';

import { Status } from '@/types/api/generalTypes';
import type { FileResultType, FileSearchType } from '@/types/api/fileTypes';

import style from '@/styles/hmv.module.scss';

const TAKE_VALUE = 20;

export default function FileList(): JSX.Element {
    const [currentFilter, setCurrentFilter] = useState<ContentFilterType>({
        dateFrom: undefined,
        dateTo: undefined,
        contentType: 'all',
        location: undefined,
    });
    return (
        <FilteredFileList
            key={JSON.stringify(currentFilter)}
            currentFilter={currentFilter}
            onFilterChanged={setCurrentFilter}
        />
    );
}

function FilteredFileList({
    currentFilter,
    onFilterChanged,
}: {
    currentFilter: ContentFilterType;
    onFilterChanged: (filter: ContentFilterType) => void;
}): JSX.Element {
    const [data, setData] = useState<FileResultType[] | null>(null);
    const [skip, setSkip] = useState(0);
    const [attempt, setAttempt] = useState(0);
    const [completedSkip, setCompletedSkip] = useState<number | null>(null);
    const isLoading = completedSkip !== skip;
    const [isLastData, setIsLastData] = useState<boolean>(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [contentSelected, setContentSelected] = useState<FileResultType | null>(null);

    useEffect(() => {
        let active = true;
        const filter: FileSearchType = {
            status: Status.Active,
            metadataStatus: 'Processed',
            take: TAKE_VALUE,
            isDirectory: false,
            contentDate: { from: currentFilter.dateFrom, to: currentFilter.dateTo },
            contentType: currentFilter.contentType,
            location: currentFilter.location,
            skip,
        };
        apiLoadFiles(filter).then(
            (result) => {
                if (!active) return;
                setData((previous) => {
                    const ids = new Set(previous?.map((file) => file.id));
                    return [...(previous ?? []), ...result.filter((file) => !ids.has(file.id))];
                });
                setIsLastData(result.length < TAKE_VALUE);
                setErrorMessage(null);
                setCompletedSkip(skip);
            },
            (error: unknown) => {
                if (!active) return;
                setErrorMessage(String(error));
                setData((previous) => previous ?? []);
                setCompletedSkip(skip);
            },
        );
        return () => {
            active = false;
        };
    }, [currentFilter, skip, attempt]);

    const loadNextPage = useCallback((): void => {
        if (isLoading || isLastData) return;
        setSkip(data?.length ?? 0);
        setCompletedSkip(null);
        setAttempt((value) => value + 1);
    }, [isLoading, isLastData, data?.length]);

    useEffect(() => {
        const onScroll = (): void => {
            if (
                document.body.clientHeight -
                    (document.documentElement.scrollTop + document.documentElement.clientHeight) <=
                100
            ) {
                loadNextPage();
            }
        };
        document.addEventListener('scroll', onScroll);
        return () => document.removeEventListener('scroll', onScroll);
    }, [loadNextPage]);

    const onThumbnailUpdated = (file: FileResultType): void => {
        setData((current) => current?.map((item) => (item.id === file.id ? file : item)) ?? null);
    };

    const onCardSelected = (content: FileResultType): void => {
        setContentSelected(content);
    };

    const onContentDisplayClosed = (): void => {
        setContentSelected(null);
    };

    const getContentDisplay = (content: FileResultType | null = null): JSX.Element => {
        if (content == null) {
            return <></>;
        }

        return (
            <ContentDisplay
                content={content}
                onThumbnailUpdated={onThumbnailUpdated}
                closeHandler={onContentDisplayClosed}
            />
        );
    };

    let contentList = null;

    if (!isLoading && data === null) contentList = <p>No files available</p>;
    else if (data !== null) contentList = <ContentList data={data} fileSelected={onCardSelected} />;
    else contentList = null;

    let loadingContent = null;
    if (isLoading) {
        loadingContent = <>Loading data...</>;
    } else if (!isLastData) {
        loadingContent = (
            <div className={style.fullWidthContainer}>
                <button className={style.buttonElement} onClick={loadNextPage}>
                    Load more content
                </button>
            </div>
        );
    }

    return (
        <div>
            <h1 className={style.pageTitle}>Explore your library</h1>
            <p className={style.pageDescription}>Find a moment by date, media type, or place.</p>
            <ContentFilter key={1} currentFilter={currentFilter} onFilterChanged={onFilterChanged} />
            {contentList}
            {loadingContent}
            {getContentDisplay(contentSelected)}
            {typeof errorMessage === 'string' ? (
                <p role="alert" className="errorMessage">
                    {errorMessage}
                </p>
            ) : null}
        </div>
    );
}
