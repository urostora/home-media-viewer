import { Album, File } from "@prisma/client";
import { FileProcessor } from "./processorFactory";
import { getFullPath } from "../fileHelper";

import fs from "fs";
import * as ExifReader from 'exifreader';
import { addFloatMeta, addIntMeta, addPositionMeta, addStringMeta } from "../metaHelper";

const imageFileProcessor: FileProcessor = async (file: File, fileAlbum?: Album): Promise<boolean> => {
    const path = await getFullPath(file, fileAlbum);

    if (!fs.existsSync(path)) {
        throw new Error(`File not found at path ${path}`);
    }

    const tags = await ExifReader.load(path);

    if (typeof tags !== 'object') {
        throw new Error(`Could not read image metadata at path ${path}`);
    }

    if (typeof tags?.Orientation?.value === 'number') { await addIntMeta(file, 'orientation', Math.round(tags.Orientation.value)); }
    if (typeof tags?.Model?.description === 'string') { await addStringMeta(file, 'model', tags.Model.description); }
    if (typeof tags?.Make?.description === 'string') { await addStringMeta(file, 'make', tags.Make.description); }
    if (typeof tags?.ImageWidth?.value === 'number') { await addIntMeta(file, 'resolution_x', Math.round(tags.ImageWidth.value)); }
    if (typeof tags?.ImageLength?.value === 'number') { await addIntMeta(file, 'resolution_y', Math.round(tags.ImageLength.value)); }

    if (
        typeof tags?.GPSLatitude?.description === 'number'
        &&  typeof tags?.GPSLongitude?.description === 'number'
    ) {
        await addPositionMeta(file, 'coordinates', tags.GPSLatitude.description, tags.GPSLongitude.description);
    }
    
    if (
        Array.isArray(tags?.GPSAltitude?.value)
        && typeof tags?.GPSAltitude?.value[0] === 'number'
    ) {
        await addFloatMeta(file, 'altitude', tags.GPSAltitude.value[0]);
    }

    return true;
}

const supportedExtensions: string[] = [
    'bmp',
    'jpg',
    'jpeg',
    'gif',
    'png',
    'tiff',
]

export const fillProcessorList = (processors: { [key: string]: FileProcessor }) => {
    supportedExtensions.forEach(ext => {
        processors[ext] = imageFileProcessor;
    });
}