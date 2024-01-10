import BrowseContentMenu from "./browserContentMenu";
import { MetaType, contentSizeToString, durationInSecToString } from "@/utils/metaUtils";
import { isVideoByExtension } from '@/utils/frontend/contentUtils'

import type { BrowseResultFile } from "@/types/api/browseTypes"

import hmvStyle from '@/styles/hmv.module.scss';

interface BrowseContentCardProps {
    content: BrowseResultFile,
    contentSelected?: (content: BrowseResultFile) => void,
    contentChanged?: (id: string) => void,
}

const BrowseContentCard = (props: BrowseContentCardProps): JSX.Element => {
    const { content, contentSelected, contentChanged } = props;

    const name = content.name;
    const path = content.path;

    const metadataTextList: string[] = [];

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

    const tooltipText = content.path;

    if (!content.isDirectory) {
        if (content.storedFile !== null) {
            const fpsMeta = content.storedFile.metas.find(m => m.metaKey === MetaType.Fps);
            if (fpsMeta !== undefined) {
                metadataTextList.push(`${fpsMeta.intValue}fps`);
            }

            const durationMeta = content.storedFile.metas.find(m => m.metaKey === MetaType.Duration);
            // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
            if (durationMeta !== undefined && durationMeta?.floatValue !== null) {
                metadataTextList.push(durationInSecToString(durationMeta.floatValue));
            }

            const widthMeta = content.storedFile.metas.find(m => m.metaKey === MetaType.ResolutionX);
            const heightMeta = content.storedFile.metas.find(m => m.metaKey === MetaType.ResolutionY);
            if (widthMeta !== undefined && heightMeta !== undefined) {
                metadataTextList.push(`${widthMeta.intValue} x ${heightMeta.intValue}`);
            }
        }

        metadataTextList.push(contentSizeToString(content.size ?? 0));
    }

    const isDisabled = content?.storedFile?.status === 'Disabled';
    if (isDisabled) {
        metadataTextList.push('Disabled');
    }

    const metadataElements = metadataTextList.map((txt, index) => <div key={index}>{txt}</div>);

    return (<div className={`${hmvStyle.browseContentCard} ${isDisabled ? hmvStyle.disabled : ''}`}>
        <div className={hmvStyle.name} title={path} onClick={onContentClickedHandler}>
            <abbr title={tooltipText}>{name}</abbr>
        </div>
        <div
            className={`${hmvStyle.thumbnail} ${hasThumbnailStyle}`}
            style={thumbnailStyle}
            onClick={containerClickedHandler}
        >
            {videoIcon}
        </div>
        <div className={hmvStyle.details}>
            <div className={hmvStyle.metadataContainer}>
                {metadataElements}
            </div>
            <BrowseContentMenu content={content} onFileChanged={contentChanged} />
        </div>
    </div>);
}

export default BrowseContentCard;