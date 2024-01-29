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

    const imageContent = content.thumbnailFile === null || content.thumbnailFile === undefined
        ? null
        : (typeof content.thumbnailFile.thumbnailImage === 'string'
            ? <img className={hmvStyle.thumbnailImage} alt={content.name} src={`data:image/jpeg;base64,${content.thumbnailFile.thumbnailImage}`} />
            : <img className={hmvStyle.thumbnailImage} alt={content.name} src={`/api/file/thumbnail/${content.thumbnailFile.id}/200`} />);

    return (
        <div className={`${hmvStyle.contentCardContainer} ${hmvStyle.albumCardContainer} ${hmvStyle.noDetails}`} onClick={onCardClicked} data-id={content.id} >
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