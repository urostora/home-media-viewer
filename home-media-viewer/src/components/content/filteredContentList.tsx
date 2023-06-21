import { useState, useEffect } from 'react';
import { FileResultType, FileSearchType } from "@/types/api/fileTypes";
import { apiLoadFiles } from '@/utils/frontend/dataSource/file';
import ContentList from './contentList';

export type FilteredContentListPropsType = {
    albumId?: string,
    parentFileId?: string,
    onContentSelected?(content: FileResultType): void,
}

const FilteredContentList = (props: FilteredContentListPropsType) => {
    const { albumId, parentFileId, onContentSelected } = props;

    const [ isFetchInProgress, setIsFetchInProgress ] = useState<boolean>(false);
    const [ content, setContent ] = useState<FileResultType[] | null>(null);

    useEffect(() => {
        if (isFetchInProgress) {
            return;
        }

        setContent(null);
        setIsFetchInProgress(true);

        const filter: FileSearchType = {
            album: (albumId ? { id: albumId } : undefined),
            parentFileId: parentFileId
        }

        apiLoadFiles(filter)
            .then((result: FileResultType[]) => {
                setContent(result);
                setIsFetchInProgress(false);
            })
            .catch(() => {
                setContent([]);
                setIsFetchInProgress(false);
            });
    }, [ albumId, parentFileId ]);

    if (!Array.isArray(content)) {
        return <>Loading content...</>;
    }

    return <ContentList data={content} contentSelected={onContentSelected} />;
}

export default FilteredContentList;