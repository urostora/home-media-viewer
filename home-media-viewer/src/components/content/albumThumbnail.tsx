import { AlbumResultType } from "@/types/api/albumTypes";

import hmvStyle from '@/styles/hmv.module.scss';

interface AlbumThumbnailProps {
    contentSelected?(content: AlbumResultType): void,
    content: AlbumResultType,
}

const AlbumThumbnail = (props: AlbumThumbnailProps) => {
    const { content, contentSelected } = props;

    const onCardClicked = () => {
      if (typeof contentSelected === 'function') {
        contentSelected(content);
      }
    }

    const imageContent = Array.isArray(content.files) && content.files.length > 0 && typeof content.files[0].thumbnailImage === 'string'
        ? <img src={`data:image/jpeg;base64,${content.files[0].thumbnailImage}`} />
        : <></>;

    return (
        <div className={`${hmvStyle.contentCardContainer} ${hmvStyle.albumCardContainer}`} onClick={onCardClicked} >
            <div className={hmvStyle.contentName}>
                <>{content.name}</>
            </div>
            <div className={hmvStyle.imageContainer}>
                {imageContent}
            </div>
        </div>
    );
}

export default AlbumThumbnail;