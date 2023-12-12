import { type FileResultType } from "@/types/api/fileTypes";
import ContentThumbnail from "./contentThumbnail";
import hmvStyle from '@/styles/hmv.module.scss';
import { type AlbumResultType } from "@/types/api/albumTypes";
import AlbumThumbnail from "./albumThumbnail";
import { useState } from "react";
import ContentDisplay from "./contentDisplay";

export interface ContentListPropsType {
    albumSelected?: (album: AlbumResultType) => void,
    fileSelected?: (file: FileResultType) => void,
    contentSelected?: (content: FileResultType | AlbumResultType) => void,
    data: Array<FileResultType | AlbumResultType>,
    displaySelectedContent?: boolean,
    displayDetails?: boolean,
}

const ContentList = (props: ContentListPropsType): JSX.Element => {
    const { data, contentSelected, albumSelected, fileSelected, displaySelectedContent = true, displayDetails = false } = props;

    const [ displayedContent, setDisplayedContent ] = useState<FileResultType>();

    const onContentSelectedHandler = (content: FileResultType | AlbumResultType): void => {
        if (
            'isDirectory' in content
            && displaySelectedContent
        ) {
            setDisplayedContent(content);
        } else {
            if (typeof contentSelected === 'function') {
                contentSelected(content);
            }

            if ('isDirectory' in content && typeof fileSelected === 'function') {
                fileSelected(content);
            }

            if ('files' in content && typeof albumSelected === 'function') {
                albumSelected(content);
            }
        }
    }

    const getCurrentPosition = (currentContent: FileResultType | AlbumResultType | undefined): number | null => {
        if (data === null || currentContent === undefined) {
            return null;
        }

        const position = data.indexOf(currentContent);
        return position === -1 ? null : position;
    };

    const onDisplayedContentClosed = (): void => {
        setDisplayedContent(undefined);
    };

    const onPreviousContentClickedHandler = (): void => {
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

        const newContent = data[currentPosition - 1];
        if (! ('isDirectory' in newContent)) {
            return;
        }

        setDisplayedContent(newContent);
    };

    const onNextContentClickedHandler = (): void => {
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

        const newContent = data[currentPosition + 1];
        if (! ('isDirectory' in newContent)) {
            return;
        }

        setDisplayedContent(newContent);
    };

    const displayedContentElement = displayedContent !== undefined
        ? <ContentDisplay
            content={displayedContent}
            closeHandler={onDisplayedContentClosed}
            previousHandler={onPreviousContentClickedHandler}
            nextHandler={onNextContentClickedHandler}
            />
        : null;

    const fileElements = data.map(data => {
        if ('metadataStatus' in data ) {
            return <ContentThumbnail
                key={data.id}
                data-id={data.id}
                content={data}
                contentSelected={onContentSelectedHandler}
                displayDetails={displayDetails}
            />;
        } else if ('files' in data) {
            return <AlbumThumbnail key={data.id} content={data} contentSelected={onContentSelectedHandler} />;
        }

        return (null);
    });

    return (<div className={hmvStyle.contentsContainer}>
            {fileElements.length === 0 ? <>Content list is empty</> : fileElements}
            {displayedContentElement}
        </div>);
};

export default ContentList;