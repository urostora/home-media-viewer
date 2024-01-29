import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router'

import FilteredContentList from '@/components/content/filteredContentList';
import AlbumDetails from '@/components/content/albumDetails';

import type { FileResultType } from '@/types/api/fileTypes';

import hmvStyle from '@/styles/hmv.module.scss';

const AlbumRootPage = (): JSX.Element => {
    const router = useRouter();

    const [ displayDetails, setDisplayDetails ] = useState<boolean>(false);
    const [ contentType, setContentType ] = useState<string>('all');

    const albumId: string | undefined = Array.isArray(router?.query?.id)
        ? router.query.id[0]
        : router.query.id;

    const queryIds: string[] = router?.query?.id !== undefined
    ? (Array.isArray(router?.query?.id)
        ? router.query.id
        : [router.query.id])
    : [];

    if (typeof albumId !== 'string' || albumId.length <= 10) {
        return <>{`Album id (${albumId}) invalid`}</>;
    }

    const parentFileId = queryIds.length >= 2
        ? queryIds[queryIds.length - 1]
        : undefined;

    const onContentSelectedHandler = (content: FileResultType): void => {
        if (!content.isDirectory) {
            return;
        }

        void router.push(`/album/${queryIds.join('/')}/${content.id}`);
    };

    const onDisplayDetailsToggleClicked = (): void => {
        setDisplayDetails(!displayDetails);
    };

    const onContentTypeChanged = (e: React.FormEvent<HTMLSelectElement>): void => {
        const newValue = e.currentTarget.value;

        setContentType(newValue);
    };

    const backToAlbumLink = queryIds.length > 1
        ? <Link key="backToAlbum" href={`/album/${queryIds[0]}`} prefetch={false} >Current album</Link>
        : null;

    const backLink = queryIds.length > 2
        ? <Link key="back" href={`/album/${queryIds.slice(0, queryIds.length - 1).join('/')}`} prefetch={false} >Back</Link>
        : null;

    return (<>
        <div className={hmvStyle.navigationBar}>
            <div className={hmvStyle.leftSide}>
                <Link key="backToAlbumList" href={'/album'} prefetch={false} >Album list</Link>
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
        <AlbumDetails albumId={albumId} showDetails={displayDetails} />
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