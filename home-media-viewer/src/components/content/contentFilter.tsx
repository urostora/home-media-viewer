import { useState, useRef } from "react";
import hmvStyle from '@/styles/hmv.module.scss';

export type ContentFilterType = {
    dateFrom?: string;
    dateTo?: string;
}

export type ContentFilterPropsType = {
    onFilterChanged?(filter: ContentFilterType): void,
    currentFilter?: ContentFilterType
}

const ContentFilter = (props: ContentFilterPropsType) => {
    const { onFilterChanged, currentFilter = null } = props;

    const [ dateFrom, setDateFrom] = useState<string | undefined>(currentFilter?.dateFrom ?? undefined);
    const [ dateTo, setDateTo] = useState<string | undefined>(currentFilter?.dateTo ?? undefined);

    const finalFilter = {
        ...currentFilter ?? {},
        dateFrom,
        dateTo,
    };

    const applyFilters = () => {
        if (typeof onFilterChanged !== 'function') {
            return;
        }

        onFilterChanged({
            dateFrom,
            dateTo,
        });
    };

    const dateFromChanged = (e: React.FormEvent<HTMLInputElement>) => {
        setDateFrom(e.currentTarget.value);
    };

    const dateToChanged = (e: React.FormEvent<HTMLInputElement>) => {
        setDateTo(e.currentTarget.value);
    };

    console.log('Current filter:', currentFilter);

    return (<div className={hmvStyle.contentFilterContainer}>
        <div>
            <span>Content date</span>
            <div className={hmvStyle.intervalContainer}>
                <input
                    type="datetime-local"
                    value={finalFilter?.dateFrom ?? ''}
                    onChange={dateFromChanged}
                />
                &nbsp;-&nbsp;
                <input
                    type="datetime-local"
                    value={finalFilter?.dateTo ?? ''}
                    onChange={dateToChanged}
                />
            </div>
        </div>
        <div className={hmvStyle.commandContainer}>
            <input type="button" onClick={applyFilters} value="Apply filters" />
        </div>
    </div>);
}

export default ContentFilter;