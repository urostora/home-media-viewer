import { FileResultType } from "@/types/api/fileTypes"
import hmvStyle from '@/styles/hmv.module.scss';
import { ReactElement } from "react";
import Image from "next/image";
import { getThumbnailUrl } from "@/utils/frontend/contentUtils";

type ContentDisplayProps = {
    content?: FileResultType,
    closeHandler?(): void,
    previousHandler?(): void,
    nextHandler?(): void,
}

const isImage = (extension: string): boolean => {
    return ['jpg', 'jpeg', 'gif', 'png']
        .includes(extension.toLowerCase());
}

const isVideo = (extension: string): boolean => {
    return ['mp4', 'avi', 'mov', 'mkv', 'mpg', 'mpeg']
        .includes(extension.toLowerCase());
}

const ContentDisplay = (props: ContentDisplayProps) => {
    if (!props.content) {
        return null;
    }

    const getContentElement = (content: FileResultType): ReactElement => {
        // if (isImage(content.extension)) {
            const thumbnailLink = getThumbnailUrl(content.id, 1280);
            // eslint-disable-next-line @next/next/no-img-element
            return (<img src={thumbnailLink} alt={content.path} />)
        // }
    }

    const onCloseClicked = () => {
        if (typeof props.closeHandler === 'function') {
            props.closeHandler();
        }
    };

    return (
        <div className={hmvStyle.contentDisplayContainer}>
            <div className={hmvStyle.closeButton} onClick={onCloseClicked}></div>
            <div className={hmvStyle.contentWrapper}>
                {getContentElement(props.content)}
            </div>
        </div>
    );
}

export default ContentDisplay;