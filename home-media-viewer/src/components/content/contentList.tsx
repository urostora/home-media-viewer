import { FileResultType } from "@/types/api/fileTypes";
import ContentThumbnail from "./contentThumbnail";
import hmvStyle from '@/styles/hmv.module.scss';
import { AlbumResultType } from "@/types/api/albumTypes";
import AlbumThumbnail from "./albumThumbnail";
import { useState } from "react";
import ContentDisplay from "./contentDisplay";

export type ContentListPropsType = {
    contentSelected?(content: FileResultType | AlbumResultType): void,
    data: FileResultType[] | AlbumResultType[],
    displaySelectedContent?: boolean,
}

const ContentList = (props: ContentListPropsType) => {
    const { data, contentSelected, displaySelectedContent = true } = props;

    const [ displayedContent, setDisplayedContent ] = useState<FileResultType>();

    const onContentSelectedHandler = (content: FileResultType | AlbumResultType) => {
        if (
            typeof (content as FileResultType)?.isDirectory !== 'boolean'
            || (content as FileResultType)?.isDirectory === true
            || displaySelectedContent === false
        ) {
            if (typeof contentSelected === 'function') {
                contentSelected(content);
            }
        } else {
            setDisplayedContent(content as FileResultType);
        }
    }

    const onDisplayedContentClosed = () => {
        setDisplayedContent(undefined);
    };

    const displayedContentElement = displayedContent
        ? <ContentDisplay content={displayedContent} closeHandler={onDisplayedContentClosed} />
        : null;

    const fileElements = data.map(data => {
        if (typeof (data as FileResultType)?.albumId === 'string' ) {
            return <ContentThumbnail key={data.id} data-id={data.id} content={data as FileResultType} contentSelected={onContentSelectedHandler} />;
        } else if (typeof (data as AlbumResultType)?.id === 'string') {
            return <AlbumThumbnail key={data.id} content={data} contentSelected={onContentSelectedHandler} />;
        }

        return (<></>);
    });

    return (<div className={hmvStyle.contentsContainer}>
            {fileElements.length === 0 ? <>Content list is empty</> : fileElements}
            {displayedContentElement}
        </div>);
};

export default ContentList;