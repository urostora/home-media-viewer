import { useState } from "react";

export type ContentFilterType = {
    dateFrom?: string;
    dateTo?: string;
}

export type ContentFilterPropsType = {
    onFilterChanged?(filter: ContentFilterType): void,
    currentFilter: ContentFilterType,
}

const ContentFilter = (props: ContentFilterPropsType) => {
    const { currentFilter, onFilterChanged } = props;

    const dateFromChanged = (e: React.FormEvent<HTMLInputElement>) => {
        const value = e.currentTarget.value;

        if (typeof onFilterChanged === 'function') {
            onFilterChanged({ dateFrom: value});
        }

        console.log('DateFrom changed to', value);
    };

    const dateToChanged = (e: React.FormEvent<HTMLInputElement>) => {
        const value = e.currentTarget.value;

        if (typeof onFilterChanged === 'function') {
            onFilterChanged({ dateTo: value});
        }

        console.log('DateTo changed to', value);
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
        <>
            <span>To</span>
            <input
                type="datetime-local"
                onChange={dateToChanged}
                value={currentFilter.dateTo}
            />
        </>
    </>);
}

export default ContentFilter;