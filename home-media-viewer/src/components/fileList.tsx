import { FileResultType, FileSearchType } from '@/types/api/fileTypes';
import { Status } from '@/types/api/generalTypes';
import { apiLoadFiles } from '@/utils/frontend/dataSource/file';
import Image from 'next/image';
import { useState, useEffect } from 'react'
import ContentFilter, { ContentFilterType } from './content/contentFilter';
import ContentThumbnail from './content/contentThumbnail';
import hmvStyle from '@/styles/hmv.module.scss';

export default function FileList() {
    const [ currentFilter, setCurrentFilter ] = useState<ContentFilterType>({});
    const [data, setData] = useState<FileResultType[] | null>(null);
    const [isLoading, setLoading] = useState<boolean>(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

        apiLoadFiles(filter)
            .then(result => {
                setData(result);
                setLoading(false);
            })
            .catch(e => {
                setLoading(false);
                setErrorMessage(e ?? 'Could not load file list');
            });

        setData(null);
        setLoading(true);
        setCurrentFilter(contentFilter);
    };

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

    if (isLoading) return <p>Loading...</p>
    if (!data) return <p>No files available</p>

    console.log(data);

    if (typeof errorMessage === 'string') {
        return <p className='errorMessage'>{errorMessage}</p>;
    }

    const fileElements = data.map(fileData => {
        return <ContentThumbnail key={fileData.id} data-id={fileData.id} content={fileData} />;
        
        return (<li key={fileData.id} data-id={fileData.id}>
            <span>{fileData.name}</span>
            <div /*style={{width: '200px', height: '200px', position: 'relative'}}*/>
                <Image sizes='200' width={200} height={200} alt={fileData.name} style={{objectFit: 'contain'}} src={`data:image/jpeg;base64,${fileData.thumbnail}`} />
            </div>
        </li>);
    });

    return (<div>
        <ContentFilter onFilterChanged={onContentFilterChanged} currentFilter={currentFilter} />
        <div className={hmvStyle.contentContainer}>
            {fileElements}
        </div>
    </div>);
}
