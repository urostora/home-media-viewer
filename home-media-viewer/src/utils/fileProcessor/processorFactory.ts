import { Album, File } from "@prisma/client";
import { noneFileProcessor } from "./none";
import { directoryFileProcessor } from "./directory";

export type FileProcessor = (file: File, fileAlbum?: Album) => Promise<boolean>;

const defaultFileProcessor: FileProcessor = noneFileProcessor;
const processors = {};

export const getFileProcessor = (file: File): FileProcessor => {
    if (file.isDirectory) {
        return directoryFileProcessor;
    }

    return defaultFileProcessor;
}