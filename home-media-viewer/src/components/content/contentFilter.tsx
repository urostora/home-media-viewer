import { useState } from "react";
import { type Bounds, Map } from "pigeon-maps"

import hmvStyle from '@/styles/hmv.module.scss';
import type { LocationFilter } from "@/types/api/generalTypes";

export interface ContentFilterType {
    dateFrom?: string;
    dateTo?: string;
    contentType: string;
    location?: LocationFilter;
}

const defaultCenter = {
    latitude: 47.4899,
    longitude: 19.1173,
}

export interface ContentFilterPropsType {
    onFilterChanged?: (filter: ContentFilterType) => void,
    currentFilter?: ContentFilterType
}

const ContentFilter = (props: ContentFilterPropsType): JSX.Element => {
    const { onFilterChanged, currentFilter = null } = props;

    const [ isOpen, setIsOpen ] = useState<boolean>(false);

    const [ isDateFilterEnabled, setIsDateFilterEnabled ] = useState<boolean>(currentFilter?.dateFrom !== undefined);
    const [ dateFrom, setDateFrom] = useState<string | undefined>(currentFilter?.dateFrom ?? '2000-01-01');
    const [ dateTo, setDateTo] = useState<string | undefined>(currentFilter?.dateTo ?? `${new Date().getFullYear() + 1}-01-01`);
    const [ contentType, setContentType] = useState<string>(currentFilter?.contentType ?? 'all');
    const [ isLocationEnabled, setIsLocationEnabled ] = useState<boolean>(currentFilter?.location !== undefined);
    const [ location, setLocation ] = useState<LocationFilter | undefined>(currentFilter?.location);

    const finalFilter = {
        ...currentFilter ?? {},
        dateFrom,
        dateTo,
        contentType,
        location
    };

    const applyFilters = (): void => {
        if (typeof onFilterChanged !== 'function') {
            return;
        }

        const dateFilter = isDateFilterEnabled
            ? {
                dateFrom,
                dateTo
            }
            : undefined;

        onFilterChanged({
            ...dateFilter,
            contentType,
            location: isLocationEnabled ? location : undefined,
        });

        setIsOpen(false);
    };

    const openCloseToggleClickHandler = (): void => {
        setIsOpen(!isOpen);
    };

    const isDateFilterEnabledChanged = (e: React.FormEvent<HTMLInputElement>): void => {
        setIsDateFilterEnabled(e.currentTarget.checked);
    };

    const dateFromChanged = (e: React.FormEvent<HTMLInputElement>): void => {
        setDateFrom(e.currentTarget.value);
    };

    const dateToChanged = (e: React.FormEvent<HTMLInputElement>): void => {
        setDateTo(e.currentTarget.value);
    };

    const handleContentTypeChanged = (e: React.FormEvent<HTMLInputElement>): void => {
        const newContentType=e.currentTarget.value;

        setContentType(newContentType);
    };

    const isLocationEnabledChanged = (e: React.FormEvent<HTMLInputElement>): void => {
        setIsLocationEnabled(e.currentTarget.checked);
    };

    const handleMapBoundsChanged = ({ center, bounds }: {
        center: [number, number];
        bounds: Bounds;
        zoom: number;
        initial: boolean;
    }): void => {
        const treshold = (bounds.sw[0] - bounds.ne[0]) / 4;

        setLocation({
            latitude: center[0],
            longitude: center[1],
            latitudeTreshold: Math.abs(treshold),
            longitudeTreshold: Math.abs(treshold) / Math.cos(center[0] / 180 * Math.PI),
        })
    };

    const filterList = [];
    if (currentFilter?.contentType !== 'all') {
        filterList.push(<div key="contentType">{currentFilter?.contentType}</div>);
    }
    if (isDateFilterEnabled && currentFilter?.dateFrom !== undefined) {
        filterList.push(<div key="dateFrom">{`${currentFilter?.dateFrom}-`}</div>);
    }
    if (isDateFilterEnabled && currentFilter?.dateTo !== undefined) {
        filterList.push(<div key="dateTo">{`-${currentFilter?.dateTo}`}</div>);
    }
    if (currentFilter?.location !== undefined) {
        filterList.push(<div key="location">Location</div>);
    }


    return (<div className={hmvStyle.contentFilterContainer}>
        <div className={`${hmvStyle.filterHeader} ${filterList.length > 0 ? hmvStyle.filtered : ''}`}>
            <span className={hmvStyle.filterOpenToggle} onClick={openCloseToggleClickHandler}>
                {isOpen ? String.fromCodePoint(8743) : String.fromCodePoint(8744)}
            </span>
            <span className={hmvStyle.filterCaption}>Detailed search</span>
            <div className={hmvStyle.filterList}>{filterList}</div>
        </div>
        <div className={`${hmvStyle.filterBody} ${isOpen ? hmvStyle.isOpen : ''}`}>
            <div className={hmvStyle.filterSection}>
                <div className={hmvStyle.filterTitle}>Content date</div>
                <div><label>Filter to content date&nbsp;&nbsp;<input type="checkbox" name="isDateFilterEnabled" onChange={isDateFilterEnabledChanged} /></label></div>
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
            <div className={`${hmvStyle.filterSection} ${hmvStyle.fullWidth}`}>
                <div className={hmvStyle.filterTitle}>Location</div>
                <div>
                    <label>
                        Filter to location&nbsp;&nbsp;<input type="checkbox" name="isLocationFilterEnabled" defaultChecked={isLocationEnabled} onChange={isLocationEnabledChanged} />
                    </label>
                </div>
                <div className={hmvStyle.filterMap}>
                    <Map defaultCenter={[ finalFilter?.location?.latitude ?? defaultCenter.latitude, finalFilter?.location?.longitude ?? defaultCenter.longitude]} defaultZoom={9} onBoundsChanged={handleMapBoundsChanged}>
                        <>
                            <div className={hmvStyle.mapCenter}></div>
                        </>
                    </Map>
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
