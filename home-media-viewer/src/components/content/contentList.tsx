import { FileResultType } from "@/types/api/fileTypes";
import ContentThumbnail from "./contentThumbnail";
import hmvStyle from '@/styles/hmv.module.scss';

export type ContentListPropsType = {
    contentSelected?(content: FileResultType): void,
    data: FileResultType[],
}

const ContentList = (props: ContentListPropsType) => {
    const { data } = props;

    const fileElements = data.map(data => {
        return <ContentThumbnail key={data.id} data-id={data.id} content={data} />;
    });

    return (<div className={hmvStyle.contentsContainer}>
            {fileElements}
        </div>);
};

export default ContentList;