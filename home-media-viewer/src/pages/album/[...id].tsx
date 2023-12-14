import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router'

import FilteredContentList from '@/components/content/filteredContentList';
import { type FileResultType } from '@/types/api/fileTypes';

import hmvStyle from '@/styles/hmv.module.scss';
import AlbumDetails from '@/components/content/albumDetails';

const AlbumRootPage = (): JSX.Element => {
    const router = useRouter();

    const [ displayDetails, setDisplayDetails ] = useState<boolean>(false);
    const [ contentType, setContentType ] = useState<string>('all');

    const albumId: string | undefined = Array.isArray(router?.query?.id)
        ? router.query.id[0]
        : router.query.id;

    if (typeof albumId !== 'string' || albumId.length <= 10) {
        return <>{`Album id (${albumId}) invalid`}</>;
    }

    const parentFileId = Array.isArray(router?.query?.id)
        ? router.query.id[1]
        : undefined;

    const onContentSelectedHandler = (content: FileResultType): void => {
        console.log('Browse album > content selected', content);
        if (!content.isDirectory) {
            return;
        }

        void router.push(`/album/${albumId}/${content.id}`);
    };

    const onDisplayDetailsToggleClicked = (): void => {
        setDisplayDetails(!displayDetails);
    };

    const onContentTypeChanged = (e: React.FormEvent<HTMLSelectElement>): void => {
        const newValue = e.currentTarget.value;

        setContentType(newValue);
    };

    const backToAlbumLink = parentFileId !== undefined
        ? <Link key="backToAlbum" href={`/album/${albumId}`} prefetch={false} >Back to album</Link>
        : null;

    const backLink = parentFileId !== undefined
        ? <a key="back" onClick={() => {window.history.back(); }}>Back</a>
        : null;

    return (<>
        <div className={hmvStyle.navigationBar}>
            <div className={hmvStyle.leftSide}>
                <Link key="backToAlbum" href={'/album'} prefetch={false} >Back to album list</Link>
                {backToAlbumLink}
                {backLink}
            </div>
            <div className={hmvStyle.rightSide}>
                <select className={hmvStyle.roundedElement} value={contentType} onChange={onContentTypeChanged}>
                    <option value="all">All content type</option>
                    <option value="image">Only images</option>
                    <option value="video">Only videos</option>
                </select>
                <button onClick={onDisplayDetailsToggleClicked}>{displayDetails ? 'Hide details' : 'Display details'}</button>
            </div>
        </div>
        {displayDetails ? <AlbumDetails albumId={albumId} /> : null}
        <FilteredContentList
            albumId={albumId}
            parentFileId={parentFileId ?? null}
            contentType={contentType}
            onContentSelected={onContentSelectedHandler}
            displayDetails={displayDetails}
            />
    </>);
};

export default AlbumRootPage;