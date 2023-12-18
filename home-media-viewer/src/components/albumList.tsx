import { useEffect, useState } from "react";

import { apiLoadAlbums } from "@/utils/frontend/dataSource/album";
import ContentList from "./content/contentList";

import type { AlbumDataTypeWithFiles, AlbumResultType } from "@/types/api/albumTypes";

import hmvStyle from '@/styles/hmv.module.scss';
export interface AlbumListPropsType {
    onAlbumSelected?: (album: AlbumResultType) => void,
}

export default function AlbumList( props: AlbumListPropsType ): JSX.Element {
    const [ albumData, setAlbumData ] = useState<AlbumDataTypeWithFiles[] | null>(null);
    const [ order, setOrder ] = useState< 'nameAsc' | 'nameDesc' | 'dateAsc' | 'dateDesc' >('dateDesc');

    const { onAlbumSelected } = props;

    useEffect(() => {
        const fetchData = async (): Promise<void> => {
            try {
                const results = await apiLoadAlbums({ take: 0, returnThumbnails: true });
                setAlbumData(results);
            } catch (error) {

            }
        }
        
        void fetchData();
    }, []);

    const onOrderChanged = (e: React.FormEvent<HTMLSelectElement>): void => {
        const newValue = e.currentTarget.value;

        if (newValue === 'nameAsc' || newValue === 'nameDesc' || newValue === 'dateAsc' || newValue === 'dateDesc') {
            setOrder(newValue);
        }
    };

    albumData?.sort((a1: AlbumDataTypeWithFiles, a2: AlbumDataTypeWithFiles) => {
        if (
            ['dateAsc', 'dateDesc'].includes(order)
            && Array.isArray(a1?.files)
            && a1.files.length > 0
            && a1.files[0]?.contentDate !== undefined
            && Array.isArray(a2?.files)
            && a2.files.length > 0
            && a2.files[0]?.contentDate !== undefined
        ) {
            return a1.files[0].contentDate.localeCompare(a2.files[0].contentDate) * (order === 'dateDesc' ? -1 : 1);
        }

        return a1.name.localeCompare(a2.name) * (order === 'nameDesc' ? -1 : 1);
    });

    // get content
    if (albumData === null) {
        // no album selected, load albums first
        return (<>Loading albums...</>);
    }

    if (albumData.length === 0) {
        return <p>No albums found</p>;
    }

    return (<>
        <div className={hmvStyle.navigationBar}>
            <div className={hmvStyle.rightSide}>
                <select className={hmvStyle.roundedElement} value={order} onChange={onOrderChanged}>
                    <option value="nameAsc">Name ascending</option>
                    <option value="nameDesc">Name descending</option>
                    <option value="dateAsc">Date ascending</option>
                    <option value="dateDesc">Date descending</option>
                </select>
            </div>
        </div>
        <ContentList data={albumData} contentSelected={onAlbumSelected} />
    </>);
}