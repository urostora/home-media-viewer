import { useState, useEffect, type ReactElement } from 'react';

import type { AlbumExtendedDataType } from '@/types/api/albumTypes';
import { apiAlbumDetails } from '@/utils/frontend/dataSource/album';

import hmvStyle from '@/styles/hmv.module.scss';

export interface AlbumDetailsProps {
    albumId?: string,
}

const AlbumDetails = (props: AlbumDetailsProps): ReactElement => {
    const { albumId } = props;

    const [ albumData, setAlbumData ] = useState<AlbumExtendedDataType | null>(null);
    const [ isLoading, setIsLoading ] = useState<boolean>(true);
    const [ error, setError ] = useState<string | null>(null);

    useEffect(() => {
        if (typeof albumId !== 'string') {
            setIsLoading(false);
            return;
        }

        apiAlbumDetails(albumId)
            .then(fetchedAlbumData => {
                setIsLoading(false);
                setAlbumData(fetchedAlbumData ?? null);
                setError(null);
            })
            .catch(e => {
                setIsLoading(false);
                setError(`${e}`);
            });
    }, [ albumId ]);

    if (typeof albumId !== 'string') {
        return <></>;
    }

    if (isLoading) {
        return <div className={`${hmvStyle.roundBorderedContainer} ${hmvStyle.albumDetails}`}>
            Loading album details...
        </div>;
    }

    if (albumData === null) {
        return  <div className={`${hmvStyle.roundBorderedContainer} ${hmvStyle.albumDetails}`}>
            {`Could not load album details (${albumId}): ${error}`}
        </div>;
    }

    // data is loaded

    const fileStatusData: {
        all: number,
        new: number,
        processed: number,
        failed: number,
    } = albumData?.fileStatus?.reduce((carry, fs) => {
        carry.all += fs.fileCount;
        
        if (fs.metadataStatus === 'New') {
            carry.new += fs.fileCount;
        } else if (fs.metadataStatus === 'Processed') {
            carry.processed += fs.fileCount;
        } else if (fs.metadataStatus === 'Failed') {
            carry.failed += fs.fileCount;
        }

        return carry;
    },
    {
        all: 0,
        new: 0,
        processed: 0,
        failed: 0,
    });

    let fileStatusString = `${fileStatusData?.all}`;

    if (fileStatusData.all > 0) {
        let fileStatusDetailString = '';
        if (fileStatusData.new > 0) {
            fileStatusDetailString += `, New: ${fileStatusData?.new}`;
        }
        if (fileStatusData.processed > 0) {
            fileStatusDetailString += `, Processed: ${fileStatusData?.processed}`;
        }
        if (fileStatusData.failed > 0) {
            fileStatusDetailString += `, Failed: ${fileStatusData?.failed}`;
        }

        fileStatusString += ` (${fileStatusDetailString.slice(2)})`
    }

    return (<div className={`${hmvStyle.roundBorderedContainer} ${hmvStyle.albumDetails}`}>
        <div className={hmvStyle.title}>Album details</div>
        <div>
            <span className={hmvStyle.caption}>Name:</span>
            <span className={hmvStyle.value}>{`${albumData.name} (${albumData.id})`}</span>
        </div>
        <div>
            <span className={hmvStyle.caption}>Path:</span>
            <span className={hmvStyle.value}>{albumData.basePath}</span>
        </div>
        <div>
            <span className={hmvStyle.caption}>Files:</span>
            <span className={hmvStyle.value}>{fileStatusString}</span>
        </div>
    </div>);
}

export default AlbumDetails;