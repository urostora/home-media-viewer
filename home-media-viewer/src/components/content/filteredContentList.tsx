import { useAsyncData } from '@/utils/frontend/hooks/useAsyncData';
import { type JSX, useCallback } from 'react';
import { type FileResultType } from '@/types/api/fileTypes';
import { apiLoadFiles } from '@/utils/frontend/dataSource/file';
import ContentList from './contentList';

export interface FilteredContentListPropsType {
    albumId?: string;
    parentFileId?: string | null;
    contentType?: string;
    onContentSelected?: (content: FileResultType) => void;
    displayDetails?: boolean;
}

const FilteredContentList = (props: FilteredContentListPropsType): JSX.Element => {
    const { albumId, parentFileId, onContentSelected, displayDetails = false, contentType = 'all' } = props;

    const loader = useCallback(
        () =>
            apiLoadFiles({
                album: albumId !== undefined ? { id: albumId } : undefined,
                parentFileId,
                contentType,
            }),
        [albumId, parentFileId, contentType],
    );
    const { data: content, isLoading: isFetchInProgress, reload: onFileChanged } = useAsyncData(loader);

    if (isFetchInProgress) {
        return <>Loading content...</>;
    }

    if (!Array.isArray(content)) {
        return <>Error while loading content</>;
    }

    return (
        <ContentList
            data={content}
            fileSelected={onContentSelected}
            displayDetails={displayDetails}
            onFileChanged={onFileChanged}
        />
    );
};

export default FilteredContentList;
