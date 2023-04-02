import { File } from "@prisma/client";
import { FileProcessor } from "./processorFactory";


export const ImageFileProcessor: FileProcessor = async (file: File): Promise<boolean> => {
    return true;
}

export const supportedExtensions: string[] = [
    'bmp',
    'jpg',
    'jpeg',
    'gif',
    'png',
    'tiff',
]