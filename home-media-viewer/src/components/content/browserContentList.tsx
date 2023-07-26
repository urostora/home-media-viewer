import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';

import hmvStyle from '@/styles/hmv.module.scss';
import { BrowseResult } from '@/types/api/browseTypes';
import { apiBrowse } from '@/utils/frontend/dataSource/browse';
import { contentSizeToString } from '@/utils/metaUtils';

type BrowserContentListProps = {
    path: string;
}

const BrowserContentList = (props: BrowserContentListProps) => {
    const { path } = props;

    const [ isLoading, setIsLoading ] = useState<boolean>(false);
    const [ error, setError ] = useState<string | Error | null>(null);
    const [ content, setContent ] = useState<BrowseResult | null>(null);

    useEffect(() => {
        apiBrowse(path)
        .then((loadedContent) => {
            setIsLoading(false);
            setContent(loadedContent);
        })
        .catch(e => {
            setIsLoading(false);
            setError(e);
        });
    }, [ path ]);

    if (
        isLoading
        || (content === null && error === null)
    ) {
        return <>Loading content...</>
    }

    if (error !== null) {
        return <>Error while loading content: {error.toString()}</>
    }

    const contentElements = content?.content.map(c => {
        return <li key={c.name}>{`${c.name} (${c.isDirectory ? 'dir' : contentSizeToString(c?.size ?? 0)})`}</li>
    });

    return <div className={hmvStyle.browserContent}>
            {Array.isArray(contentElements) && contentElements.length > 0
                ? (<ul>{contentElements}</ul>)
                : <>Directory is empty</>}
    </div>;
};

export default BrowserContentList;