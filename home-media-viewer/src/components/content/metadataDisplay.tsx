import React from "react";
import Image from "next/image";

import Popup from "../layout/popup";
import LocationMetadataDisplay from "./locationMetadataDisplay";
import { MetaType, contentSizeToString, durationInSecToString, getMetaStringValue, getMetaTitle } from "@/utils/metaUtils";

import type { FileResultType } from "@/types/api/fileTypes";

import style from '@/styles/hmv.module.scss';

interface MetadataDisplayProps {
    file: FileResultType;
    onClose: () => void;
    onFileChanged?: (file: FileResultType) => void;
}

const MetadataDisplay: React.FC<MetadataDisplayProps> = (props: MetadataDisplayProps): React.ReactElement => {
    const { file, onClose } = props;

    const metaElementList = file.metas.map(m => {
        const value = getMetaStringValue(m);

        if (value !== null) {
            const valueElement = m.metaKey === MetaType.GpsCoordinates
                ? <a target="__blank" href={`https://www.google.com/maps/search/?api=1&query=${m.latitude}%2C${m.longitude}`}>{value}</a>
                : value;

            return <li key={m.metaKey}><b>{getMetaTitle(m)}</b>: {valueElement}</li>;
        }

        return null;
    });

    const title = `${file.name}${file.extension.length > 0 ? `.${file.extension}` : ''}`;
    const path = file.path;

    const thumbnailElement = file.thumbnailStatus !== 'Processed'
        ? null
        : (<div key="thumbnail" className={style.thumbnailContainer}>
                <div className={style.imageWrapper}>
                    <Image alt={file.name} src={`/api/file/thumbnail/${file.id}/200`} width={200} height={200} />
                </div>
            </div>);

    // getting highlighted metadata
    const highlightedMetadataElements: string[] = [];
    
    if (file.contentDate !== null) {
        const ts = Date.parse(file.contentDate);
        if (!Number.isNaN(ts)) {
            highlightedMetadataElements.push((new Date(ts)).toLocaleString());
        }
    }

    if (typeof file.size === 'number') {
        highlightedMetadataElements.push(contentSizeToString(file.size));
    }

    const durationMeta = file.metas.find(m => m.metaKey === MetaType.Duration);
    if (typeof durationMeta?.floatValue === 'number') {
        highlightedMetadataElements.push(durationInSecToString(durationMeta.floatValue));
    }

    const fpsMeta = file.metas.find(m => m.metaKey === MetaType.Fps);
    if (fpsMeta !== undefined) {
        const value = getMetaStringValue(fpsMeta);
        if (value !== null) {
            highlightedMetadataElements.push(value);
        }
    }

    const resXMeta = file.metas.find(m => m.metaKey === MetaType.ResolutionX);
    const resYMeta = file.metas.find(m => m.metaKey === MetaType.ResolutionY);
    if (resXMeta !== undefined && resYMeta !== undefined) {
        highlightedMetadataElements.push(`${resXMeta.intValue} x ${resYMeta.intValue}`);
    }

    let highlightedMetadataSection: React.ReactElement | null = null;
    if (highlightedMetadataElements.length > 0) {
        highlightedMetadataSection = (<div className={style.highlightedMetadataContainer}>
            { highlightedMetadataElements.map((text, index) =>
                <div key={index} className={style.roundBorderedElement}>{text}</div>) }
        </div>);
    }

    return (<Popup onClose={onClose}>
        <div className={`${style.metadataDisplay}`}>
            <div className={style.title}>
                <abbr title={path}>{title}</abbr>
            </div>
            {thumbnailElement}
            {highlightedMetadataSection}
            <div className={style.locationContainer}>
                <LocationMetadataDisplay file={file} />
            </div>
            <ul>
                {metaElementList}
            </ul>
        </div>
    </Popup>);
}

export default MetadataDisplay;