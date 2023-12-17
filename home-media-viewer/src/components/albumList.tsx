import { useEffect, useState } from "react";

import { apiLoadAlbums } from "@/utils/frontend/dataSource/album";
import ContentList from "./content/contentList";

import { type AlbumResultType } from "@/types/api/albumTypes";

import hmvStyle from '@/styles/hmv.module.scss';
export interface AlbumListPropsType {
    onAlbumSelected?: (album: AlbumResultType) => void,
}

export default function AlbumList( props: AlbumListPropsType ): JSX.Element {
    const [ albumData, setAlbumData ] = useState<AlbumResultType[] | null>(null);
    const [ order, setOrder ] = useState< 'asc' | 'desc' >('desc');

    const { onAlbumSelected } = props;

    useEffect(() => {
        const fetchData = async (): Promise<void> => {
            try {
                const results = await apiLoadAlbums({ take: 0 });
                setAlbumData(results);
            } catch (error) {

            }
        }
        
        void fetchData();
    }, []);

    const onOrderChanged = (e: React.FormEvent<HTMLSelectElement>): void => {
        const newValue = e.currentTarget.value;

        if (newValue === 'asc' || newValue === 'desc') {
            setOrder(newValue);
        }
    };

    albumData?.sort((a1, a2) => a1.name.localeCompare(a2.name) * (order === 'desc' ? -1 : 1));

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
                    <option value="asc">Ascending</option>
                    <option value="desc">Descending</option>
                </select>
            </div>
        </div>
        <ContentList data={albumData} contentSelected={onAlbumSelected} />
    </>);
}