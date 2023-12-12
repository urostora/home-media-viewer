import { type AlbumResultType } from "@/types/api/albumTypes";
import { apiLoadAlbums } from "@/utils/frontend/dataSource/album";
import { useEffect, useState } from "react";
import ContentList from "./content/contentList";

export interface AlbumListPropsType {
    onAlbumSelected?: (album: AlbumResultType) => void,
}

export default function AlbumList( props: AlbumListPropsType ): JSX.Element {
    const [ albumData, setAlbumData ] = useState<AlbumResultType[] | null>(null);

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

    // get content
    if (albumData === null) {
        // no album selected, load albums first
        return (<>Loading albums...</>);
    }

    if (albumData.length === 0) {
        return <p>No albums found</p>;
    }

    return (<ContentList data={albumData} contentSelected={onAlbumSelected}></ContentList>);
}