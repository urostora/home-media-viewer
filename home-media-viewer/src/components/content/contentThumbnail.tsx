import { FileResultType } from "@/types/api/fileTypes";
import Image from "next/image";

export type ContentThumbnailPropsType = {
    contentSelected?(content: FileResultType): void,
    content: FileResultType,
}

const ContentThumbnail = (props: ContentThumbnailPropsType) => {
    const { content } = props;


    const imageContent = content.thumbnail == null
        ? null
        : <Image sizes='200' width={200} height={200} alt={content.name} style={{objectFit: 'contain'}} src={`data:image/jpeg;base64,${content.thumbnail}`} />

    return (
        <div>
            <>
                <>{content.name}</>
            </>
            <>
                {imageContent}
            </>
        </div>
    );
};

export default ContentThumbnail;