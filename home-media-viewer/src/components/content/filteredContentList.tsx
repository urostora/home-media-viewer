import { useState, useEffect } from 'react';
import { type FileResultType, type FileSearchType } from "@/types/api/fileTypes";
import { apiLoadFiles } from '@/utils/frontend/dataSource/file';
import ContentList from './contentList';

export interface FilteredContentListPropsType {
    albumId?: string,
    parentFileId?: string | null,
    contentType?: string,
    onContentSelected?: (content: FileResultType) => void,
    displayDetails?: boolean,
}

const FilteredContentList = (props: FilteredContentListPropsType): JSX.Element => {
    const { albumId, parentFileId, onContentSelected, displayDetails = false, contentType = 'all' } = props;

    const [ isFetchInProgress, setIsFetchInProgress ] = useState<boolean>(false);
    const [ content, setContent ] = useState<FileResultType[] | null>(null);

    const reloadFiles = (albumId?: string, parentFileId?: string | null, contentType?: string): void => {
        setContent(null);
        setIsFetchInProgress(true);

        const filter: FileSearchType = {
            album: (albumId !== undefined ? { id: albumId } : undefined),
            parentFileId,
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
    }

    useEffect(() => {
        reloadFiles(albumId, parentFileId, contentType);
    }, [ albumId, parentFileId, contentType ]);

    const onFileChanged = (): void => {
        reloadFiles(albumId, parentFileId, contentType);
    };

    if (isFetchInProgress) {
        return <>Loading content...</>;
    }

    if (!Array.isArray(content)) {
        return <>Error while loading content</>;
    }

    return <ContentList data={content} fileSelected={onContentSelected} displayDetails={displayDetails} onFileChanged={onFileChanged} />;
}

export default FilteredContentList;