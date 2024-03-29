import { useEffect, useState } from "react";

import { apiLoadAlbums } from "@/utils/frontend/dataSource/album";
import ContentList from "./content/contentList";
import ScrollPositionReset from '@/utils/frontend/scrollPositionResetHandler';

import type { AlbumExtendedResultType, AlbumResultType } from "@/types/api/albumTypes";

import hmvStyle from '@/styles/hmv.module.scss';

export interface AlbumListPropsType {
    onAlbumSelected?: (album: AlbumResultType) => void,
}

export default function AlbumList( props: AlbumListPropsType ): JSX.Element {
    const [ albumData, setAlbumData ] = useState<AlbumExtendedResultType[] | null>(null);
    const [ order, setOrder ] = useState< 'nameAsc' | 'nameDesc' | 'dateAsc' | 'dateDesc' >('dateDesc');
    const [ error, setError ] = useState<string | undefined >(undefined);
    const [ scrollResetCompleted, setScrollResetCompleted ] = useState<boolean>(false);

    const { onAlbumSelected } = props;

    useEffect(() => {
        const fetchData = async (): Promise<void> => {
            try {
                const results = await apiLoadAlbums({ take: 0, returnThumbnails: false });
                setAlbumData(results);
            } catch (error) {
                setError(`${error}`);
            }
        }
        
        void fetchData();
    }, []);

    const onAlbumSelectedHandler = (album: AlbumResultType): void => {
        ScrollPositionReset.lastAlbumSelected = album.id;

        if (typeof onAlbumSelected === 'function') {
            onAlbumSelected(album);
        }
    };

    const onOrderChanged = (e: React.FormEvent<HTMLSelectElement>): void => {
        const newValue = e.currentTarget.value;

        if (newValue === 'nameAsc' || newValue === 'nameDesc' || newValue === 'dateAsc' || newValue === 'dateDesc') {
            setOrder(newValue);
        }
    };

    // show error if available
    if (error !== undefined) {
        return <div className={hmvStyle.errorMessage}>{error}</div>;
    }

    // get content
    if (albumData === null) {
        // no album selected, load albums first
        return (<>Loading albums...</>);
    }

    if (albumData.length === 0) {
        return <p>No albums found</p>;
    }
    
    albumData?.sort((a1: AlbumExtendedResultType, a2: AlbumExtendedResultType) => {
        if (
            ['dateAsc', 'dateDesc'].includes(order)
            && a1.thumbnailFile !== null
            && a1.thumbnailFile?.contentDate !== undefined
            && a2?.thumbnailFile !== null
            && a2.thumbnailFile?.contentDate !== undefined
        ) {
            return a1.thumbnailFile.contentDate.localeCompare(a2.thumbnailFile.contentDate) * (order === 'dateDesc' ? -1 : 1);
        }

        return a1.name.localeCompare(a2.name) * (order === 'nameDesc' ? -1 : 1);
    });

    if (!scrollResetCompleted) {
        // scroll to last selected item
        const lastSelectedAlbumId = ScrollPositionReset.lastAlbumSelected;

        if (lastSelectedAlbumId !== undefined) {
            setTimeout(() => {
                ScrollPositionReset.scrollToLastElement(lastSelectedAlbumId);
            }, 100);

            ScrollPositionReset.lastAlbumSelected = undefined;
            setScrollResetCompleted(true);
        }
    }

    return (<>
        <div className={hmvStyle.navigationBar}>
            <div className={hmvStyle.leftSide}></div>
            <div className={hmvStyle.rightSide}>
                <select className={hmvStyle.roundedElement} value={order} onChange={onOrderChanged}>
                    <option value="nameAsc">Name ascending</option>
                    <option value="nameDesc">Name descending</option>
                    <option value="dateAsc">Date ascending</option>
                    <option value="dateDesc">Date descending</option>
                </select>
            </div>
        </div>
        <ContentList data={albumData} contentSelected={onAlbumSelectedHandler} />
    </>);
}