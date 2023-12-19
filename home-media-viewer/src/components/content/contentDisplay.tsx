import { type FileResultType } from "@/types/api/fileTypes"
import hmvStyle from '@/styles/hmv.module.scss';
import { type ReactElement } from "react";
import { getContentUrl, getThumbnailUrl, isImageByExtension, isVideoByExtension } from "@/utils/frontend/contentUtils";

interface ContentDisplayProps {
    content?: FileResultType,
    closeHandler?: () => void,
    previousHandler?: () => void,
    nextHandler?: () => void,
}

const ContentDisplay = (props: ContentDisplayProps): JSX.Element => {
    const { content, closeHandler, previousHandler, nextHandler } = props;
    
    if (content === undefined) {
        return <></>;
    }

    const getContentElement = (content: FileResultType): ReactElement => {
        if (isImageByExtension(content.extension)) {
            const thumbnailLink = getThumbnailUrl(content.id, 1280);
            // eslint-disable-next-line @next/next/no-img-element
            return (<img src={thumbnailLink} alt={content.path} />);
        } else if (isVideoByExtension(content.extension)) {
            const contentLink = getContentUrl(content.id);
            // eslint-disable-next-line @next/next/no-img-element
            return (<video controls><source src={contentLink} /></video>);
        }

        return <></>;
    }

    return (
        <div className={hmvStyle.contentDisplayContainer}>
            <div className={hmvStyle.closeButton} onClick={closeHandler}>X</div>
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