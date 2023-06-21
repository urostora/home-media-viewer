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

    return (
        <div className={hmvStyle.contentCardContainer} onClick={onCardClicked} >
            <div className={hmvStyle.contentName}>
                <>{content.name}</>
            </div>
        </div>
    );
}

export default AlbumThumbnail;