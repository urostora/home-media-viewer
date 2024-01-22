import { type FileResultType } from "@/types/api/fileTypes"
import hmvStyle from '@/styles/hmv.module.scss';
import { type ReactElement } from "react";
import { getContentUrl, getThumbnailUrl, isImageByExtension, isVideoByExtension } from "@/utils/frontend/contentUtils";
import { thumbnailSize } from "@/utils/frontend/thumbnailUtils";

interface ContentDisplayProps {
    content?: FileResultType,
    closeHandler?: () => void,
    previousHandler?: () => void,
    nextHandler?: () => void,
}

const getImageUrl = (id: string): string => {
    if (window === undefined) {
        return getContentUrl(id);
    }

    if (window.innerWidth <= thumbnailSize.medium) {
        return getThumbnailUrl(id, thumbnailSize.medium);
    } else if (window.innerWidth <= thumbnailSize.large) {
        return getThumbnailUrl(id, thumbnailSize.large);
    }

    return getContentUrl(id);
};

const ContentDisplay = (props: ContentDisplayProps): JSX.Element => {
    const { content, closeHandler, previousHandler, nextHandler } = props;
    
    if (content === undefined) {
        return <></>;
    }

    const getContentElement = (content: FileResultType): ReactElement => {
        if (isImageByExtension(content.extension)) {
            const thumbnailLink = getImageUrl(content.id);
            // eslint-disable-next-line @next/next/no-img-element
            return (<img src={thumbnailLink} alt={content.path} />);
        } else if (isVideoByExtension(content.extension)) {
            const contentLink = getContentUrl(content.id);
            // eslint-disable-next-line @next/next/no-img-element
            return (<video controls><source src={contentLink} /></video>);
        }

        return <></>;
    }

    const onBackgroundClicked = (e: React.MouseEvent<HTMLElement>): void => {
        const targetElement = e.target as HTMLElement;

        if (targetElement.tagName.toLowerCase() === 'img') {
            if (typeof closeHandler === 'function') {
                closeHandler()
                e.stopPropagation();
            }
        }
    };

    const onDownloadClickedHandler = (e: React.MouseEvent): void => {
        const contentUrl = getContentUrl(content.id);

        if (window === undefined) {
            return;
        }

        window.open(contentUrl, '__blank');
    };

    return (
        <div className={hmvStyle.contentDisplayContainer} onClick={onBackgroundClicked}>
            <div className={hmvStyle.operationsBlock}>
                <div onClick={onDownloadClickedHandler}>&#8615;</div>
                <div onClick={closeHandler}>X</div>
            </div>
            <div
                className={`${hmvStyle.navigationArea} ${hmvStyle.previousContainer}`}
                onClick={previousHandler}>
                    <div>&lt;</div>
            </div>
            <div className={hmvStyle.contentWrapper}>
                {getContentElement(content)}
            </div>
            <div
                className={`${hmvStyle.navigationArea} ${hmvStyle.nextContainer}`}
                onClick={nextHandler}>
                <div>&gt;</div>
            </div>
        </div>
    );
}

export default ContentDisplay;