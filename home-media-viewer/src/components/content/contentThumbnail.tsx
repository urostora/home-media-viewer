import { FileMetadataType, FileResultType } from "@/types/api/fileTypes";
import Image from "next/image";
import hmvStyle from '@/styles/hmv.module.scss';
import { MetaType, contentSizeToString, durationInSecToString } from "@/utils/metaUtils";
import { ReactElement } from "react";

export type ContentThumbnailPropsType = {
    contentSelected?(content: FileResultType): void,
    content: FileResultType,
}

const getMetaMap = (metaList?: FileMetadataType[] | undefined) => {
  return (metaList ?? []).reduce((carry: Map<String, String | Number | Date | object>, meta: FileMetadataType) => {
    const key = meta.metaKey;
    let value = undefined;

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
  }, new Map<String, String | Number | Date | object>());
};

const ContentThumbnail = (props: ContentThumbnailPropsType) => {
    const { content, contentSelected } = props;

    const onCardClicked = () => {
      if (typeof contentSelected === 'function') {
        contentSelected(content);
      }
    }

    const imageContent = content.isDirectory
      ? <Image sizes='200' width={200} height={200} alt={content.name} style={{objectFit: 'contain'}} src="/directory.png" />
      : (content.thumbnail == null
        ? null
        : (<Image sizes='200' width={200} height={200} alt={content.name} style={{objectFit: 'contain'}} src={`data:image/jpeg;base64,${content.thumbnail}`} />));

    const metaMap = getMetaMap(content.metas);

    // console.log('metaMap: ', metaMap);

    const metaListElements: Array<{ name: string, value: string | ReactElement}> = [];

    metaListElements.push({name: 'Size', value: contentSizeToString(content.size ?? 0)});
    metaListElements.push({name: 'Path', value: content.path});

    if (typeof content.contentDate === 'string' && content.contentDate.length > 0) {
      const cd = new Date(content.contentDate);
      metaListElements.push({name: 'Date', value: `${cd.toLocaleDateString()} ${cd.toLocaleTimeString()}`});
    }
    if (typeof metaMap.get(MetaType.ResolutionX) === 'number') {
        metaListElements.push({name: 'Resolution', value: `${metaMap.get(MetaType.ResolutionX)} x ${metaMap.get(MetaType.ResolutionY)}`});
    }
    if (typeof metaMap.get(MetaType.Duration) === 'number') {
        metaListElements.push({name: 'Duration', value: durationInSecToString(metaMap.get(MetaType.Duration) as number ?? 0)});
    }
    if (typeof metaMap.get(MetaType.GpsCoordinates) === 'object') {
      const coord = metaMap.get(MetaType.GpsCoordinates) as { latitude?: number, longitude?: number};
      if (coord) {
        const link = `https://www.google.com/maps/search/?api=1&query=${coord?.latitude}%2C${coord?.longitude}`;
        metaListElements.push({ name: 'Location', value: (<a href={link} target="__blank">View in Google Maps</a>)});
      }
    }

    const contentName = content.name + (content.extension.length > 0 ? `.${content.extension}` : '');

    return (
        <div className={hmvStyle.contentCardContainer} onClick={onCardClicked} >
            <div className={hmvStyle.contentName}>
                <>{contentName}</>
            </div>
            <div className={hmvStyle.contentDataContainer}>
                <div className={hmvStyle.contentDetails}>
                    <ul>
                        {metaListElements.map((mle, index) => (<li key={index}>{mle.name}: {mle.value}</li>))}
                    </ul>
                </div>
                <div className={hmvStyle.imageContainer}>
                    {imageContent}
                </div>
            </div>
        </div>
    );
};

export default ContentThumbnail;