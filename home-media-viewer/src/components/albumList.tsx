import { AlbumResultType } from "@/types/api/albumTypes";
import { FileResultType } from "@/types/api/fileTypes";
import { apiLoadAlbums } from "@/utils/frontend/dataSource/album";
import { useEffect, useState } from "react";
import ContentList from "./content/contentList";

export type AlbumListPropsType = {
    onAlbumSelected?(album: AlbumResultType): void,
}

export default function AlbumList( props: AlbumListPropsType ) {
    const [ albumData, setAlbumData ] = useState<AlbumResultType[] | null>(null);

    const { onAlbumSelected } = props;

    useEffect(() => {
        apiLoadAlbums({ take: 0 })
        .then((result: AlbumResultType[]) => {
            setAlbumData(result);
        });
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