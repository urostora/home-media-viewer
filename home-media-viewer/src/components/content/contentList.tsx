import { useState, useEffect } from "react";

import AlbumThumbnail from "./albumThumbnail";
import ContentDisplay from "./contentDisplay";
import ContentThumbnail from "./contentThumbnail";
import ScrollToTop from "./scrollToTop";
import MetadataDisplay from "./metadataDisplay";

import type { AlbumExtendedResultType, AlbumResultType } from "@/types/api/albumTypes";
import type { FileResultType } from "@/types/api/fileTypes";

import hmvStyle from '@/styles/hmv.module.scss';

const PAGE_SIZE = 5;

export interface ContentListPropsType {
    albumSelected?: (album: AlbumResultType) => void,
    fileSelected?: (file: FileResultType) => void,
    contentSelected?: (content: FileResultType | AlbumResultType) => void,
    onFileChanged?: (file: FileResultType) => void;
    data: Array<FileResultType | AlbumExtendedResultType>,
    displaySelectedContent?: boolean,
    displayDetails?: boolean,
}

const ContentList = (props: ContentListPropsType): JSX.Element => {
    const { data, contentSelected, albumSelected, fileSelected, onFileChanged, displaySelectedContent = true, displayDetails = false } = props;

    const [ displayedContent, setDisplayedContent ] = useState<FileResultType>();
    const [ infoContent, setInfoContent ] = useState<FileResultType>();

    // pagination states
    const [ isScrolledToTheEnd, setIsScrolledToTheEnd ] = useState<boolean>(false);
    const [ itemsDisplayed, setItemsDisplayed ] = useState<number>(PAGE_SIZE);

    const onScrollEventHandler =
        (): void => {
            const body = document.body;
            const html = document.documentElement;

            const scrolledToEnd = body.clientHeight - (html.scrollTop + html.clientHeight) <= 100;

            if (scrolledToEnd) {
                setIsScrolledToTheEnd(true);
            }
        };

    useEffect(
        () => {
            if (isScrolledToTheEnd) {
                displayNextItems();
                setIsScrolledToTheEnd(false);
                setTimeout(onScrollEventHandler, 200);
            }
        },
        [ isScrolledToTheEnd ]
    );

    useEffect(() => {
        if (typeof document === 'object') {
            document?.addEventListener('scroll', onScrollEventHandler);
        }
        
        setTimeout(onScrollEventHandler, 200);

        return () => {
            if (typeof document === 'object') {
                document?.removeEventListener('scroll', onScrollEventHandler);
            }
        }
    });

    const displayNextItems = (): void => {
        if (itemsDisplayed <= data.length) {
            setItemsDisplayed(itemsDisplayed + PAGE_SIZE);
        }
    };

    const onContentSelectedHandler = (content: FileResultType | AlbumResultType): void => {
        if (
            'isDirectory' in content
            && !content.isDirectory
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

    const onContentInfoSelectedHandler = (content: FileResultType | AlbumResultType): void => {
        if (
            'isDirectory' in content
            && !content.isDirectory
        ) {
            setInfoContent(content);
        }
    }

    const getCurrentPosition = (currentContent: FileResultType | AlbumExtendedResultType | undefined): number | null => {
        if (data === null || currentContent === undefined) {
            return null;
        }

        const position = data.indexOf(currentContent);
        return position === -1 ? null : position;
    };

    const onDisplayedContentClosed = (): void => {
        setDisplayedContent(undefined);
    };
    

    const onInfoContentClosed = (): void => {
        setInfoContent(undefined);
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
        if (!('isDirectory' in newContent) || newContent.isDirectory) {
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

    const infoContentElement = infoContent !== undefined
        ? (<MetadataDisplay
                file={infoContent}
                key="infoContent"
                onClose={onInfoContentClosed}
                onFileChanged={onFileChanged}
            />)
        : null;

    const fileElements = data
        .slice(0, itemsDisplayed)
        .map(data => {
            if ('metadataStatus' in data ) {
                return <ContentThumbnail
                    key={data.id}
                    data-id={data.id}
                    content={data}
                    contentSelected={onContentSelectedHandler}
                    contentInfoSelected={onContentInfoSelectedHandler}
                    displayDetails={displayDetails}
                />;
            } else if ('thumbnailFile' in data) {
                return <AlbumThumbnail key={data.id} content={data} contentSelected={onContentSelectedHandler} />;
            }

            return (null);
        });

    return (<div className={hmvStyle.contentsContainer}>
            {fileElements.length === 0 ? <>Content list is empty</> : fileElements}
            {displayedContentElement}
            {infoContentElement}
            <ScrollToTop />
        </div>);
};

export default ContentList;