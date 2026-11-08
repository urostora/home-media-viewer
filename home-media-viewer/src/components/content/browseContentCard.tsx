import { getThumbnailUrl } from '@/utils/frontend/contentUtils';
import type { JSX } from 'react';
import Image from 'next/image';

import BrowseContentMenu from './browserContentMenu';
import { MetaType, contentSizeToString, durationInSecToString } from '@/utils/metaUtils';
import { isVideoByExtension } from '@/utils/frontend/contentUtils';

import type { BrowseResultFile } from '@/types/api/browseTypes';

import hmvStyle from '@/styles/gallery.module.scss';
import globus from 'public/globus.png';

interface BrowseContentCardProps {
    content: BrowseResultFile;
    contentSelected?: (content: BrowseResultFile) => void;
    contentChanged?: (id: string) => void;
}

const BrowseContentCard = (props: BrowseContentCardProps): JSX.Element => {
    const { content, contentSelected, contentChanged } = props;

    const name = content.name;
    const path = content.path;

    const metadataTextList: string[] = [];

    const isDirectory = content?.isDirectory;
    const isVideo =
        typeof content?.storedFile?.extension === 'string' ? isVideoByExtension(content.storedFile.extension) : false;

    const thumbnailContent = content?.storedFile?.thumbnail;
    const thumbnailStyle = {
        backgroundImage: isDirectory
            ? "url('/directory.png')"
            : typeof thumbnailContent === 'string'
              ? `url(data:image/jpeg;base64,${thumbnailContent})`
              : content?.storedFile?.thumbnailStatus === 'Processed'
                ? `url('${getThumbnailUrl(content.storedFile.id, 200, content.storedFile.thumbnailProcessedAt)}')`
                : 'inherit',
    };
    const videoIcon = isVideo ? <img alt="play icon" src="/play.svg" className={hmvStyle.videoIcon} /> : null;

    const onContentClickedHandler = (): void => {
        if (typeof contentSelected === 'function') {
            contentSelected(content);
        }
    };

    const containerClickedHandler =
        !content.isDirectory && content.storedFile === null ? undefined : onContentClickedHandler;

    const onLocationClicked = (e: React.SyntheticEvent): void => {
        e.preventDefault();
        e.stopPropagation();

        const locationMeta = content?.storedFile?.metas.find((m) => m.metaKey === MetaType.GpsCoordinates);
        if (locationMeta === undefined) {
            return;
        }

        const url = `https://www.google.com/maps/search/?api=1&query=${locationMeta.latitude}%2C${locationMeta.longitude}`;
        window.open(url, '__blank');
    };

    const tooltipText = content.path;

    let coordinates: { latitude?: number; longitude?: number } | undefined;

    if (!content.isDirectory) {
        if (content.storedFile !== null) {
            const fpsMeta = content.storedFile.metas.find((m) => m.metaKey === MetaType.Fps);
            if (fpsMeta !== undefined) {
                metadataTextList.push(`${fpsMeta.intValue}fps`);
            }

            const durationMeta = content.storedFile.metas.find((m) => m.metaKey === MetaType.Duration);
            if (durationMeta !== undefined && durationMeta?.floatValue !== null) {
                metadataTextList.push(durationInSecToString(durationMeta.floatValue));
            }

            const widthMeta = content.storedFile.metas.find((m) => m.metaKey === MetaType.ResolutionX);
            const heightMeta = content.storedFile.metas.find((m) => m.metaKey === MetaType.ResolutionY);
            if (widthMeta !== undefined && heightMeta !== undefined) {
                metadataTextList.push(`${widthMeta.intValue} x ${heightMeta.intValue}`);
            }

            const locationMeta = content.storedFile.metas.find((m) => m.metaKey === MetaType.GpsCoordinates);
            if (
                locationMeta !== undefined &&
                typeof locationMeta.latitude === 'number' &&
                typeof locationMeta.longitude === 'number'
            ) {
                coordinates = { latitude: locationMeta.latitude, longitude: locationMeta.longitude };
            }
        }

        metadataTextList.push(contentSizeToString(content.size ?? 0));
    }

    const isDisabled = content?.storedFile?.status === 'Disabled';
    if (isDisabled) {
        metadataTextList.push('Disabled');
    }

    const metadataElements = metadataTextList.map((txt, index) => <div key={index}>{txt}</div>);

    if (coordinates !== undefined) {
        metadataElements.push(
            <button
                type="button"
                aria-label={`View location of ${name}`}
                key="location"
                onClick={onLocationClicked}
                className={hmvStyle.locationIcon}
            >
                <Image src={globus} alt="" />
            </button>,
        );
    }

    return (
        <div className={`${hmvStyle.browseContentCard} ${isDisabled ? hmvStyle.disabled : ''}`}>
            <button
                type="button"
                className={hmvStyle.name}
                title={path}
                onClick={containerClickedHandler}
                disabled={containerClickedHandler === undefined}
            >
                <abbr title={tooltipText}>{name}</abbr>
            </button>
            <button
                type="button"
                aria-label={`Open ${name}`}
                disabled={containerClickedHandler === undefined}
                className={hmvStyle.thumbnail}
                style={thumbnailStyle}
                onClick={containerClickedHandler}
            >
                {videoIcon}
            </button>
            <div className={hmvStyle.details}>
                <div className={hmvStyle.metadataContainer}>{metadataElements}</div>
                <BrowseContentMenu content={content} onFileChanged={contentChanged} />
            </div>
        </div>
    );
};

export default BrowseContentCard;
