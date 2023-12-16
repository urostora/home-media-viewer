import { useState, useEffect } from 'react'

import ContentFilter, { type ContentFilterType } from './content/contentFilter';
import ContentList from './content/contentList';
import ContentDisplay from './content/contentDisplay';

import { apiLoadFiles } from '@/utils/frontend/dataSource/file';

import { Status } from '@/types/api/generalTypes';
import type { FileResultType, FileSearchType } from '@/types/api/fileTypes';

const TAKE_VALUE = 50;

export default function FileList(): JSX.Element {
    const [ currentFilter, setCurrentFilter ] = useState<ContentFilterType>({ dateFrom: '2000-01-01', dateTo: `${new Date().getFullYear() + 1}-01-01`, contentType: 'all', location: undefined });
    const [ data, setData ] = useState<FileResultType[] | null>(null);
    const [ isLoading, setLoading ] = useState<boolean>(false);
    const [ isLastData, setIsLastData ] = useState<boolean>(false);
    const [ isScrolledToTheEnd, setIsScrolledToTheEnd ] = useState<boolean>(false);
    const [ errorMessage, setErrorMessage ] = useState<string | null>(null);
    const [ contentSelected, setContentSelected ] = useState<FileResultType | null>(null);

    const getFileFilter = (): FileSearchType => {
        return {
            status: Status.Active,
            metadataStatus: 'Processed',
            take: TAKE_VALUE,
            isDirectory: false,
        };
    }

    const fetchData = async (filter: FileSearchType): Promise<void> => {
        setLoading(true);

        try {
            const result = await apiLoadFiles(filter);

            // look for existing data
            if (Array.isArray(result) && result.length > 0) {
                const firstElementId = result[0].id;

                // update data when content not exists already
                setData(oldData => {
                    const isExistingData = Array.isArray(oldData)
                        ? oldData.filter(d => d.id === firstElementId).length > 0
                        : false;

                    return isExistingData
                        ? oldData
                        : Array.isArray(oldData) ? [...oldData, ...result] : result;
                });

                if (result.length < TAKE_VALUE) {
                    setIsLastData(true);
                }
            }
        } catch(e) {
            setData(oldData => Array.isArray(oldData) ? [ ...oldData ] : []);
            setErrorMessage(e !== null ? `${e}` : 'Could not load file list');
        } finally {
            setLoading(false);
        }
    };

    const loadNextPage = (): void => {
        if (isLoading || isLastData) {
            return;
        }

        const filter: FileSearchType = {
            ...getFileFilter(),
            contentDate: { from: currentFilter.dateFrom, to: currentFilter.dateTo },
            contentType: currentFilter.contentType,
            location: currentFilter.location,
            skip: data?.length ?? 0,
        };

        void fetchData(filter);
    };

    if (isScrolledToTheEnd) {
        loadNextPage();
        setIsScrolledToTheEnd(false);
    }

    useEffect(() => {
        const onScrollEventHandler =
            (): void => {
                const body = document.body;
                const html = document.documentElement;

                const scrolledToEnd = body.clientHeight - (html.scrollTop + html.clientHeight) <= 0;

                if (scrolledToEnd) {
                    setIsScrolledToTheEnd(true);
                }
            }
        ;

        void fetchData({
            ...getFileFilter(),
            contentDate: { from: currentFilter.dateFrom, to: currentFilter.dateTo },
            contentType: currentFilter.contentType,
            location: currentFilter.location,
        });


        if (typeof document === 'object') {
            document?.addEventListener('scroll', onScrollEventHandler);
        }

        return () => {
            if (typeof document === 'object') {
                document?.removeEventListener('scroll', onScrollEventHandler);
            }
        }
    }, [
        currentFilter.contentType,
        currentFilter.dateFrom,
        currentFilter.dateTo,
        currentFilter.location,
    ]);

    const onContentFilterChanged = (contentFilter: ContentFilterType): void => {

        setCurrentFilter(contentFilter);
        setData(null);
        setIsLastData(false);

        const filter: FileSearchType = {
            ...getFileFilter(),
            contentDate: { from: contentFilter.dateFrom, to: contentFilter.dateTo },
            contentType: contentFilter.contentType,
            location: contentFilter.location,
            skip: 0,
        };

        void fetchData(filter);
    };

    const onCardSelected = (content: FileResultType): void => {
        setContentSelected(content);
    }

    const onContentDisplayClosed = (): void => {
        setContentSelected(null);
    }

    const getContentDisplay = (content: FileResultType | null = null): JSX.Element => {
        if (content == null) {
            return <></>;
        }

        return <ContentDisplay content={content} closeHandler={onContentDisplayClosed} />;
    }

    let contentList = null;

    if (!isLoading && data === null) contentList = <p>No files available</p>
    else if (data !== null) contentList = <ContentList data={data} fileSelected={onCardSelected} />
    else contentList = null;

    return (<div>
        <ContentFilter key={1} currentFilter={currentFilter} onFilterChanged={onContentFilterChanged} />
        {contentList}
        { isLoading ? <>Loading data...</> : null }
        {getContentDisplay(contentSelected)}
        {typeof errorMessage === 'string'
            ? <p className='errorMessage'>{errorMessage}</p>
            : null
        }
    </div>);
}
