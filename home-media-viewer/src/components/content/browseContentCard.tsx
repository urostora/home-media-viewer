import BrowseContentMenu from "./browserContentMenu";
import { contentSizeToString } from "@/utils/metaUtils";
import { isVideoByExtension } from '@/utils/frontend/contentUtils'

import type { BrowseResultFile } from "@/types/api/browseTypes"
import type { AlbumResultType } from "@/types/api/albumTypes";

import hmvStyle from '@/styles/hmv.module.scss';

interface BrowseContentCardProps {
    content: BrowseResultFile,
    album?: AlbumResultType,
    contentSelected?: (content: BrowseResultFile) => void,
}

const BrowseContentCard = (props: BrowseContentCardProps): JSX.Element => {
    const { content, album, contentSelected } = props;

    const name = content.name;
    const path = content.path;
    const details = content.isDirectory ? '' : contentSizeToString(content.size ?? 0);

    const isDirectory = content?.isDirectory;
    const isVideo = typeof content?.storedFile?.extension === 'string'
        ? isVideoByExtension(content.storedFile.extension)
        : false;
    const thumbnailContent = content?.storedFile?.thumbnail;
    const thumbnailStyle = {
        backgroundImage: isDirectory
            ? "url('/directory.png')"
            : (typeof thumbnailContent === 'string'
                ? `url(data:image/jpeg;base64,${thumbnailContent})`
                : 'inherit'),
    }
    const hasThumbnailStyle = typeof thumbnailContent === 'string' || isDirectory ? hmvStyle.hasThumbnail : '';

    const videoIcon = isVideo
        ? <img alt="play icon" src="/play.svg" className={hmvStyle.videoIcon} />
        : null;

    const onContentClickedHandler = (): void => {
        if (typeof contentSelected === 'function') {
            contentSelected(content);
        }
    };

    const containerClickedHandler = !content.isDirectory && content.storedFile === null
        ? undefined
        : onContentClickedHandler;

    return (<div className={hmvStyle.browseContentCard}>
        <div className={hmvStyle.name} title={path} onClick={onContentClickedHandler}>{name}</div>
        <div
            className={`${hmvStyle.thumbnail} ${hasThumbnailStyle}`}
            style={thumbnailStyle}
            onClick={containerClickedHandler}
        >
            {videoIcon}
        </div>
        <div className={hmvStyle.details}>
            <span>{details}</span>
            <BrowseContentMenu content={content} album={album} />
        </div>
    </div>);
}

export default BrowseContentCard;