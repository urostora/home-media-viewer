import type { AlbumExtendedResultType } from "@/types/api/albumTypes";

import hmvStyle from '@/styles/hmv.module.scss';

interface AlbumThumbnailProps {
    contentSelected?: (content: AlbumExtendedResultType) => void,
    content: AlbumExtendedResultType,
}

const AlbumThumbnail = (props: AlbumThumbnailProps): JSX.Element => {
    const { content, contentSelected } = props;

    const onCardClicked = (): void => {
      if (typeof contentSelected === 'function') {
        contentSelected(content);
      }
    }

    const imageContent = Array.isArray(content.files) && content.files.length > 0 && typeof content.files[0].thumbnailImage === 'string'
        ? <img alt={content.name} src={`data:image/jpeg;base64,${content.files[0].thumbnailImage}`} />
        : <></>;

    return (
        <div className={`${hmvStyle.contentCardContainer} ${hmvStyle.albumCardContainer} ${hmvStyle.noDetails}`} onClick={onCardClicked} >
            <div className={hmvStyle.contentName}>
                <span dangerouslySetInnerHTML={{ __html: content.name.replaceAll('_', '_<wbr>')}}></span>
            </div>
            <div className={hmvStyle.contentDataContainer}>
                <div className={hmvStyle.imageContainer}>
                    {imageContent}
                </div>
            </div>
        </div>
    );
}

export default AlbumThumbnail;