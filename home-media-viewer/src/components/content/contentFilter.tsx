import { useState } from "react";
import hmvStyle from '@/styles/hmv.module.scss';

export type ContentFilterType = {
    dateFrom?: string;
    dateTo?: string;
    contentType: string;
}

export type ContentFilterPropsType = {
    onFilterChanged?(filter: ContentFilterType): void,
    currentFilter?: ContentFilterType
}

const ContentFilter = (props: ContentFilterPropsType) => {
    const { onFilterChanged, currentFilter = null } = props;

    const [ isOpen, setIsOpen ] = useState<boolean>(false);

    const [ dateFrom, setDateFrom] = useState<string | undefined>(currentFilter?.dateFrom ?? undefined);
    const [ dateTo, setDateTo] = useState<string | undefined>(currentFilter?.dateTo ?? undefined);
    const [ contentType, setContentType] = useState<string>(currentFilter?.contentType ?? 'all');


    const finalFilter = {
        ...currentFilter ?? {},
        dateFrom,
        dateTo,
        contentType,
    };

    const applyFilters = () => {
        if (typeof onFilterChanged !== 'function') {
            return;
        }

        onFilterChanged({
            dateFrom,
            dateTo,
            contentType
        });
    };

    const openCloseToggleClickHandler = () => {
        setIsOpen(!isOpen);
    };

    const dateFromChanged = (e: React.FormEvent<HTMLInputElement>) => {
        setDateFrom(e.currentTarget.value);
    };

    const dateToChanged = (e: React.FormEvent<HTMLInputElement>) => {
        setDateTo(e.currentTarget.value);
    };

    const handleContentTypeChanged = (e: React.FormEvent<HTMLInputElement>) => {
        const newContentType=e.currentTarget.value;

        setContentType(newContentType);
    };

    console.log('Current filter:', currentFilter);

    return (<div className={hmvStyle.contentFilterContainer}>
        <div className={hmvStyle.filterHeader}>
            <span className={hmvStyle.filterOpenToggle} onClick={openCloseToggleClickHandler}>
                {isOpen ? String.fromCodePoint(8743) : String.fromCodePoint(8744)}
            </span>
            <span>Detailed search</span>
        </div>
        <div className={`${hmvStyle.filterBody} ${isOpen ? hmvStyle.isOpen : ''}`}>
            <div className={hmvStyle.filterSection}>
                <div className={hmvStyle.filterTitle}>Content date</div>
                <div className={hmvStyle.intervalContainer}>
                    <input
                        type="date"
                        value={finalFilter?.dateFrom ?? ''}
                        onChange={dateFromChanged}
                    />
                    &nbsp;-&nbsp;
                    <input
                        type="date"
                        value={finalFilter?.dateTo ?? ''}
                        onChange={dateToChanged}
                    />
                </div>
            </div>
            <div className={hmvStyle.filterSection}>
                <div className={hmvStyle.filterTitle}>Content type</div>
                <div>
                    <div>
                        <input type="radio" radioGroup="contentType" id="contentTypeAll" value="all" onChange={handleContentTypeChanged} checked={finalFilter?.contentType === 'all'}></input>
                        <label htmlFor="contentTypeAll">All</label>
                    </div>
                    <div>
                        <input type="radio" radioGroup="contentType" id="contentTypeImage" value="image" onChange={handleContentTypeChanged} checked={finalFilter?.contentType === 'image'}></input>
                        <label htmlFor="contentTypeImage">Image</label>
                    </div>
                    <div>
                        <input type="radio" radioGroup="contentType" id="contentTypeVideo" value="video" onChange={handleContentTypeChanged} checked={finalFilter?.contentType === 'video'}></input>
                        <label htmlFor="contentTypeVideo">Video</label>
                    </div>
                </div>
            </div>
            <div className={hmvStyle.commandContainer}>
                <input
                    type="button"
                    className={hmvStyle.roundBorderedButtonElement}
                    onClick={applyFilters} value="Apply filters"
                />
            </div>
        </div>
    </div>);
}

export default ContentFilter;