import { useState } from "react";

export type ContentFilterType = {
    dateFrom?: string;
    dateTo?: string;
}

export type ContentFilterPropsType = {
    onFilterChanged?(filter: ContentFilterType): void,
}

const ContentFilter = (props: ContentFilterPropsType) => {

    const [ currentFilter, setCurrentFilter ] = useState<ContentFilterType>({});

    const dateFromChanged = (e: React.FormEvent<HTMLInputElement>) => {
        const value = e.currentTarget.value;

        const newFilterValue = {
            ...currentFilter,
            dateFrom: value
        };

        if (typeof props?.onFilterChanged === 'function') {
            props.onFilterChanged(newFilterValue);
        }

        console.log('New filter', newFilterValue);

        setCurrentFilter(newFilterValue);
    };

    console.log('Current filter:', currentFilter);

    return (<>
        <>
            <span>From</span>
            <input
                type="datetime-local"
                onChange={dateFromChanged}
                value={currentFilter.dateFrom}
            />
        </>
    </>);
}

export default ContentFilter;