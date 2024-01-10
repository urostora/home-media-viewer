import { type FileMetadataType, type FileResultType } from "@/types/api/fileTypes";
import hmvStyle from '@/styles/hmv.module.scss';
import { MetaType, contentSizeToString, durationInSecToString } from "@/utils/metaUtils";
import { type ReactElement } from "react";
import { isVideoByExtension } from "@/utils/frontend/contentUtils";

export interface ContentThumbnailPropsType {
    contentSelected?: (content: FileResultType) => void,
    content: FileResultType,
    displayDetails?: boolean,
}

const getMetaMap = (metaList?: FileMetadataType[] | undefined): Map<string, string | number | Date | object> => {
  return (metaList ?? []).reduce((carry: Map<string, string | number | Date | object>, meta: FileMetadataType) => {
    const key = meta.metaKey;
    let value;

    switch (meta.type) {
      case 'Int':
        value = meta.intValue;
        break;
      case 'Float':
        value = meta.floatValue;
        break;
      case 'String':
        value = meta.stringValue;
        break;
      case 'DateTime':
        value = meta.dateValue;
        break;
      case 'Location':
        value = {
          latitude: meta.latitude,
          longitude: meta.longitude,
        };
        break;
      default:
        break;
    }

    if (typeof value !== 'undefined' && value != null) {
        carry.set(key, value);
    }
    
    return carry;
  }, new Map<string, string | number | Date | object>());
};

const ContentThumbnail = (props: ContentThumbnailPropsType): JSX.Element => {
    const { content, contentSelected, displayDetails = false } = props;

    const onCardClicked = (): void => {
      if (typeof contentSelected === 'function') {
        contentSelected(content);
      }
    }

    const isVideo = typeof content?.extension === 'string'
        ? isVideoByExtension(content.extension)
        : false;

    const imageContent = content.isDirectory
      ? <img alt={content.name} src="/directory.png" />
      : (content.thumbnail == null
        ? null
        : (<img alt={content.name} src={`data:image/jpeg;base64,${content.thumbnail}`} />));

    const videoIcon = isVideo
      ? <img alt="play" src="/play.svg" className={hmvStyle.videoIcon} />
      : null;

    let contentDetails = null;

    const metaMap = getMetaMap(content.metas);

    const metaListElements: Array<{ name: string, value: string | ReactElement}> = [];
    const highlightedMetaValues: string[] = [];

    metaListElements.push({name: 'Size', value: contentSizeToString(content.size ?? 0)});
    metaListElements.push({name: 'Path', value: content.path.replace('_', '_ ').replace('/', '/ ')});

    if (typeof content.contentDate === 'string' && content.contentDate.length > 0) {
      const cd = new Date(content.contentDate);
      metaListElements.push({name: 'Date', value: `${cd.toLocaleDateString()} ${cd.toLocaleTimeString()}`});
    }
    if (typeof metaMap.get(MetaType.ResolutionX) === 'number') {
      const size = `${metaMap.get(MetaType.ResolutionX)} x ${metaMap.get(MetaType.ResolutionY)}`;
      metaListElements.push({name: 'Resolution', value: size});
      highlightedMetaValues.push(size);
    }
    if (typeof metaMap.get(MetaType.Duration) === 'number') {
      const durationValue = durationInSecToString(metaMap.get(MetaType.Duration) as number ?? 0);
      metaListElements.push({name: 'Duration', value: durationValue});
      highlightedMetaValues.push(durationValue);
    }
    if (typeof metaMap.get(MetaType.Fps) === 'number') {
      const fpsValue = `${metaMap.get(MetaType.Fps) as number}fps`;
      metaListElements.push({name: 'FPS', value: fpsValue});
      highlightedMetaValues.push(fpsValue);
    }
    if (typeof metaMap.get(MetaType.GpsCoordinates) === 'object') {
      const coord = metaMap.get(MetaType.GpsCoordinates) as { latitude?: number, longitude?: number};

      if (typeof coord?.latitude === 'number' && typeof coord?.longitude === 'number') {
        const link = `https://www.google.com/maps/search/?api=1&query=${coord?.latitude}%2C${coord?.longitude}`;
        metaListElements.push({ name: 'Location', value: (<a href={link} target="__blank">View in Google Maps</a>)});
      }
    }

    if ((content?.size ?? 0) > 0) {
      highlightedMetaValues.push(contentSizeToString(content.size ?? 0));
    }

    contentDetails = displayDetails
      ? (
        <div className={hmvStyle.contentDetails}>
          <ul>
              {metaListElements.map((mle, index) => (<li key={index}>{mle.name}: {mle.value}</li>))}
          </ul>
        </div>)
      : null;

    const contentName = content.name + (content.extension.length > 0 ? `.${content.extension}` : '');

    const highlightedMeta = highlightedMetaValues.map((text, index) => (<div key={index}>{text}</div>));

    return (
        <div className={`${hmvStyle.contentCardContainer} ${displayDetails ? '' : hmvStyle.noDetails}`} onClick={onCardClicked} >
            <div className={hmvStyle.contentName}>
                <span dangerouslySetInnerHTML={{ __html: contentName.replaceAll('_', '_<wbr>')}}></span>
            </div>
            <div className={hmvStyle.contentDataContainer}>
                {contentDetails}
                <div className={hmvStyle.imageContainer}>
                    {imageContent}
                    {videoIcon}
                    <div className={hmvStyle.metadataContainer}>
                      {highlightedMeta}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ContentThumbnail;
