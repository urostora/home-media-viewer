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
    displayDetails?: boolean,
}

const ContentList = (props: ContentListPropsType) => {
    const { data, contentSelected, displaySelectedContent = true, displayDetails = false } = props;

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

    const getCurrentPosition = (currentContent: FileResultType | undefined): number | null => {
        if (data === null || !currentContent) {
            return null;
        }

        let position = data.indexOf(currentContent);
        return position === -1 ? null : position;
    };

    const onDisplayedContentClosed = () => {
        setDisplayedContent(undefined);
    };

    const onPreviousContentClickedHandler = () => {
        if (contentSelected === null) {
            return;
        }

        const currentPosition = getCurrentPosition(displayedContent);

        if (
            currentPosition === null
            || typeof data?.length !== 'number'
            || data?.length <= currentPosition
            || currentPosition <= 0
        ) {
            return;
        }

        const newContent = data[currentPosition - 1] as FileResultType;
        if (!newContent || newContent?.isDirectory === true) {
            return;
        }

        setDisplayedContent(newContent);
    };

    const onNextContentClickedHandler = () => {
        if (contentSelected === null) {
            return;
        }

        const currentPosition = getCurrentPosition(displayedContent);
        if (
            currentPosition === null
            || typeof data?.length !== 'number'
            || data?.length <= currentPosition + 1
        ) {
            return;
        }

        const newContent = data[currentPosition + 1] as FileResultType;
        if (!newContent || newContent?.isDirectory === true) {
            return;
        }

        setDisplayedContent(newContent);
    };

    const displayedContentElement = displayedContent
        ? <ContentDisplay
            content={displayedContent}
            closeHandler={onDisplayedContentClosed}
            previousHandler={onPreviousContentClickedHandler}
            nextHandler={onNextContentClickedHandler}
            />
        : null;

    const fileElements = data.map(data => {
        if (typeof (data as FileResultType)?.metadataStatus === 'string' ) {
            return <ContentThumbnail
                key={data.id}
                data-id={data.id}
                content={data as FileResultType}
                contentSelected={onContentSelectedHandler}
                displayDetails={displayDetails}
            />;
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