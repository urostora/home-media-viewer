import { FileResultType, FileSearchType } from '@/types/api/fileTypes';
import { Status } from '@/types/api/generalTypes';
import { apiLoadFiles } from '@/utils/frontend/dataSource/file';
import Image from 'next/image';
import { useState, useEffect } from 'react'

export default function FileList() {
    const [data, setData] = useState<FileResultType[] | null>(null);
    const [isLoading, setLoading] = useState<boolean>(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const getFileFilter = (): FileSearchType => {
        return {
            status: Status.Active,
            metadataStatus: 'Processed',
        };
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

    if (isLoading) return <p>Loading...</p>
    if (!data) return <p>No files available</p>

    console.log(data);

    if (typeof errorMessage === 'string') {
        return <p className='errorMessage'>{errorMessage}</p>;
    }

    const fileElements = data.map(fileData => {
        return <li key={fileData.id}>{fileData.name}<Image alt={fileData.name} width={200} height={150} src={`data:image/jpeg;base64,${fileData.thumbnail}`} /></li>;
    });

    return (<div>
        <ul>
            {fileElements}
        </ul>
    </div>);
}
