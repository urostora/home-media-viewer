import { BrowseResultFile } from "@/types/api/browseTypes"

import hmvStyle from '@/styles/hmv.module.scss';
import { contentSizeToString } from "@/utils/metaUtils";
import BrowseContentMenu from "./browserContentMenu";
import { AlbumResultType } from "@/types/api/albumTypes";
import { isVideoByExtension } from '@/utils/frontend/contentUtils'

type BrowseContentCardProps = {
    content: BrowseResultFile,
    album?: AlbumResultType,
    contentSelected?(content: BrowseResultFile): void,
}

const BrowseContentCard = (props: BrowseContentCardProps) => {
    const { content, album, contentSelected } = props;

    const name = content.name;
    const path = content.path;
    const details = content.isDirectory ? '' : contentSizeToString(content.size ?? 0);

    const isDirectory = content?.isDirectory === true;
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
        ? <img src="/play.svg" className={hmvStyle.videoIcon} />
        : null;

    const onContentClickedHandler = (event: React.MouseEvent<HTMLDivElement>) => {
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