import { Album, File } from "@prisma/client";
import { FileProcessor } from "./processorFactory";
import { getFullPath } from "../fileHelper";

import fs from "fs";
import exif from "exif-reader";
import { addFloatMeta, addIntMeta, addStringMeta } from "../metaHelper";

const imageFileProcessor: FileProcessor = async (file: File, fileAlbum?: Album): Promise<boolean> => {
    const path = await getFullPath(file, fileAlbum);

    if (!fs.existsSync(path)) {
        throw new Error(`File not found at path ${path}`);
    }

    const imageContent = fs.readFileSync(path);
    const meta = exif(imageContent);

    if (typeof meta !== 'object') {
        throw new Error('Could not read image metadata');
    }

    if (typeof meta.image === 'object') {
        const { image } = meta;

        if (typeof image.Make === 'string') { await addStringMeta(file, 'make', image.Make); }
        if (typeof image.Model === 'string') { await addStringMeta(file, 'model', image.Model); }
        if (typeof image.Orientation === 'number') { await addIntMeta(file, 'orientation', image.Orientation); }
        if (typeof image.XResolution === 'number') { await addIntMeta(file, 'resolution_x', image.XResolution); }
        if (typeof image.YResolution === 'number') { await addIntMeta(file, 'resolution_y', image.YResolution); }
    }

    if (typeof meta.exif === 'object') {
        const { exif } = meta;

        if (typeof exif.FNumber === 'number') { await addFloatMeta(file, 'fnumber', exif.FNumber); }
        if (typeof exif.ISO === 'number') { await addIntMeta(file, 'fnumber', exif.ISO); }
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