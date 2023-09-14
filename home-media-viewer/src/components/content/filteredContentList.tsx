import { useState, useEffect } from 'react';
import { FileResultType, FileSearchType } from "@/types/api/fileTypes";
import { apiLoadFiles } from '@/utils/frontend/dataSource/file';
import ContentList from './contentList';

export type FilteredContentListPropsType = {
    albumId?: string,
    parentFileId?: string | null,
    contentType?: string,
    onContentSelected?(content: FileResultType): void,
    displayDetails?: boolean,
}

const FilteredContentList = (props: FilteredContentListPropsType) => {
    const { albumId, parentFileId, onContentSelected, displayDetails = false, contentType = 'all' } = props;

    const [ isFetchInProgress, setIsFetchInProgress ] = useState<boolean>(false);
    const [ content, setContent ] = useState<FileResultType[] | null>(null);

    useEffect(() => {
        setContent(null);
        setIsFetchInProgress(true);

        const filter: FileSearchType = {
            album: (albumId ? { id: albumId } : undefined),
            parentFileId: parentFileId,
            contentType
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
    }, [ albumId, parentFileId, contentType ]);

    if (isFetchInProgress) {
        return <>Loading content...</>;
    }

    if (!Array.isArray(content)) {
        return <>Error while loading content</>;
    }

    return <ContentList data={content} contentSelected={onContentSelected} displayDetails={displayDetails} />;
}

export default FilteredContentList;