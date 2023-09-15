import { FileResultType, FileSearchType } from '@/types/api/fileTypes';
import { Status } from '@/types/api/generalTypes';
import { apiLoadFiles } from '@/utils/frontend/dataSource/file';
// import dynamic from "next/dynamic";
import { useState, useEffect, useCallback } from 'react'
import ContentFilter, { ContentFilterType } from './content/contentFilter';
import ContentList from './content/contentList';
import ContentDisplay from './content/contentDisplay';

// const ContentFilter = dynamic(
//     () => {
//       return import("@/components/content/contentFilter.tsx");
//     },
//     {
//         ssr: false,
//     }
//   );

const TAKE_VALUE = 50;

export default function FileList() {
    const [ currentFilter, setCurrentFilter ] = useState<ContentFilterType>({ dateFrom: '2000-01-01 00:00:00', contentType: 'all' });
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
            console.log('Fetch data with filter', filter);
            const result = await apiLoadFiles(filter);

            // look for existing data
            if (Array.isArray(result) && result.length > 0) {
                const firstElementId = result[0].id;

                // set new data
                setData(oldData => {
                    const isExistingData = Array.isArray(oldData)
                        ? oldData.filter(d => d.id === firstElementId).length > 0
                        : false;

                    return isExistingData
                        ? oldData
                        : Array.isArray(oldData) ? [...oldData, ...result] : result
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

        console.log(`Loading next page from element ${data?.length ?? 0}`);

        const filter: FileSearchType = {
            ...getFileFilter(),
            skip: data?.length ?? 0,
        };

        fetchData(filter);
    };

    if (isScrolledToTheEnd) {
        loadNextPage();
        setIsScrolledToTheEnd(false);
    }

    useEffect(() => {
        const onScrollEventHandler = // useCallback(
            () => {
                const body = document.body;
                const html = document.documentElement;

                const scrolledToEnd = body.clientHeight - (html.scrollTop + html.clientHeight) <= 0;

                if (scrolledToEnd) {
                    console.log(`Scrolled to end, skip value: ${data?.length ?? 0}`);
                    setIsScrolledToTheEnd(true);
                }
            }
            // , []);
        ;

        fetchData(getFileFilter());

        // setLoading(true);

        // apiLoadFiles(getFileFilter())
        //     .then(result => {
        //         setData(result);
        //         setLoading(false);
        //         setSkipValue(oldValue => oldValue + TAKE_VALUE);

        //         if (result.length < TAKE_VALUE) {
        //             setIsLastData(true);
        //         }
        //     })
        //     .catch(e => {
        //         setData(oldData => Array.isArray(oldData) ? [ ...oldData ] : []);
        //         setLoading(false);
        //         setErrorMessage(e ? `${e}` : 'Could not load file list');
        //     });

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

        const filter: FileSearchType = {
            ...getFileFilter(),
            contentDate: { from: contentFilter.dateFrom, to: contentFilter.dateTo },
            contentType: contentFilter.contentType,
            skip: 0,
        };

        fetchData(filter);
    };

    const onCardSelected = (content: FileResultType) => {
        console.log(`Content selected: ${content.path}`);
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

    console.log({ dataLength: data?.length ?? 0, isLastData });

    let contentList = null;

    if (!isLoading && !data) contentList = <p>No files available</p>
    else if (data != null) contentList = <ContentList data={data} contentSelected={onCardSelected} />
    else contentList = null;

    if (typeof errorMessage === 'string') {
        return <p className='errorMessage'>{errorMessage}</p>;
    }

    return (<div>
        <ContentFilter key={1} currentFilter={currentFilter} onFilterChanged={onContentFilterChanged} />
        {contentList}
        { isLoading ? <>Loading data...</> : null }
        {getContentDisplay(contentSelected)}
    </div>);
}
