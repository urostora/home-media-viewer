import { FileResultType, FileSearchType } from '@/types/api/fileTypes';
import { Status } from '@/types/api/generalTypes';
import { apiLoadFiles } from '@/utils/frontend/dataSource/file';
import Image from 'next/image';
import { useState, useEffect } from 'react'
import ContentFilter, { ContentFilterType } from './content/contentFilter';
import ContentThumbnail from './content/contentThumbnail';
import hmvStyle from '@/styles/hmv.module.scss';
import ContentList from './content/contentList';

export default function FileList() {
    const [ currentFilter, setCurrentFilter ] = useState<ContentFilterType>({ dateFrom: '2000-01-01'});
    const [ data, setData ] = useState<FileResultType[] | null>(null);
    const [ isLoading, setLoading ] = useState<boolean>(false);
    const [ errorMessage, setErrorMessage ] = useState<string | null>(null);

    const getFileFilter = (): FileSearchType => {
        return {
            status: Status.Active,
            metadataStatus: 'Processed',
        };
    }

    const onContentFilterChanged = (contentFilter: ContentFilterType) => {
        const filter: FileSearchType = {
            ...currentFilter,
            contentDate: { from: contentFilter.dateFrom, to: contentFilter.dateTo },
            take: 50,
        };

        setData(null);
        setLoading(true);
        setCurrentFilter(contentFilter);

        apiLoadFiles(filter)
            .then(result => {
                setData(result);
                setLoading(false);
            })
            .catch(e => {
                setLoading(false);
                setErrorMessage(e ?? 'Could not load file list');
            });
    };

    const onCardSelected = (content: FileResultType) => {
        console.log(`Content selected: ${content.path}`);
    }

    useEffect(() => {
        setLoading(true);

        apiLoadFiles(getFileFilter())
            .then(result => {
                setData(result);
                setLoading(false);
            })
            .catch(e => {
                setLoading(false);
                setErrorMessage(e ?? 'Could not load file list');
            });
    }, []);

    let contentList = null;

    if (isLoading) contentList = <p>Loading...</p>
    else if (!data) contentList = <p>No files available</p>
    else contentList = <ContentList data={data} contentSelected={onCardSelected} />

    console.log(data);

    if (typeof errorMessage === 'string') {
        return <p className='errorMessage'>{errorMessage}</p>;
    }

    return (<div>
        <ContentFilter key={1} currentFilter={currentFilter} onFilterChanged={onContentFilterChanged} />
        {contentList}
    </div>);
}
