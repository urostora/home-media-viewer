import { AlbumResultType } from "@/types/api/albumTypes";
import { FileResultType } from "@/types/api/fileTypes";
import { useState } from "react";


export default function Browser() {
    const [ currentAlbum, setCurrentAlbum ] = useState<AlbumResultType | null>(null);
    const [ currentDirectory, setCurrentDirectory ] = useState<FileResultType | null>(null);

    const albumSelectedHandler = (album: AlbumResultType): void => {
        setCurrentAlbum(album);
        setCurrentDirectory(null);
    };

    // get content
    if (currentAlbum === null) {
        // no album selected, load albums first
    }

    return (<></>);
}