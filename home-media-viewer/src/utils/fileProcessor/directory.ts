import { Album, File, PrismaClient } from "@prisma/client";
import { FileProcessor } from "./processorFactory";
import { syncFilesInAlbumAndFile } from "../fileHelper";

const prisma = new PrismaClient();

export const directoryFileProcessor: FileProcessor = async (file: File, fileAlbum?: Album) => {
    if (!file.isDirectory) {
        throw Error(`File ${file.name} is not directory`);
    }

    const album = (fileAlbum ?? await prisma.album.findFirst({ where: { id: file.albumId }})) as Album;

    if (album == null) {
        throw Error('Album not found');
    }

    await syncFilesInAlbumAndFile(album, file);

    return true;
}