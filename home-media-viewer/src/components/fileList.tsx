import { FileResultType, FileSearchType } from '@/types/api/fileTypes';
import { Status } from '@/types/api/generalTypes';
import { apiLoadFiles } from '@/utils/frontend/dataSource/file';
import { useState, useEffect } from 'react'
import ContentFilter, { ContentFilterType } from './content/contentFilter';
import ContentList from './content/contentList';
import ContentDisplay from './content/contentDisplay';


const TAKE_VALUE = 50;

export default function FileList() {
    const [ currentFilter, setCurrentFilter ] = useState<ContentFilterType>({ dateFrom: '2000-01-01', contentType: 'all' });
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

    const fetchData = async (filter: FileSearchType) => {
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
            setErrorMessage(e ? `${e}` : 'Could not load file list');
        } finally {
            setLoading(false);
        }
    };

    const loadNextPage = () => {
        if (isLoading || isLastData) {
            return;
        }

        const filter: FileSearchType = {
            ...getFileFilter(),
            contentDate: { from: currentFilter.dateFrom, to: currentFilter.dateTo },
            contentType: currentFilter.contentType,
            skip: data?.length ?? 0,
        };

        fetchData(filter);
    };

    if (isScrolledToTheEnd) {
        loadNextPage();
        setIsScrolledToTheEnd(false);
    }

    useEffect(() => {
        const onScrollEventHandler =
            () => {
                const body = document.body;
                const html = document.documentElement;

                const scrolledToEnd = body.clientHeight - (html.scrollTop + html.clientHeight) <= 0;

                if (scrolledToEnd) {
                    setIsScrolledToTheEnd(true);
                }
            }
        ;

        fetchData({
            ...getFileFilter(),
            contentDate: { from: currentFilter.dateFrom, to: currentFilter.dateTo },
            contentType: currentFilter.contentType,
        });


        if (document) {
            document.addEventListener('scroll', onScrollEventHandler);
        }

        return () => {
            if (document) {
                document.removeEventListener('scroll', onScrollEventHandler);
            }
        }
    }, []);

    const onContentFilterChanged = (contentFilter: ContentFilterType) => {

        setCurrentFilter(contentFilter);
        setData(null);
        setIsLastData(false);

        const filter: FileSearchType = {
            ...getFileFilter(),
            contentDate: { from: contentFilter.dateFrom, to: contentFilter.dateTo },
            contentType: contentFilter.contentType,
            skip: 0,
        };

        fetchData(filter);
    };

    const onCardSelected = (content: FileResultType) => {
        setContentSelected(content);
    }

    const onContentDisplayClosed = () => {
        setContentSelected(null);
    }

    const getContentDisplay = (content: FileResultType | null = null) => {
        if (content == null) {
            return null;
        }

        return <ContentDisplay content={content} closeHandler={onContentDisplayClosed} />;
    }

    let contentList = null;

    if (!isLoading && !data) contentList = <p>No files available</p>
    else if (data != null) contentList = <ContentList data={data} contentSelected={onCardSelected} />
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
