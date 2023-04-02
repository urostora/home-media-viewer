import { Album, File, PrismaClient } from "@prisma/client";
import { FileProcessor } from "./processorFactory";
import fs, { stat } from "fs";
import { default as fspath } from "path"

const prisma = new PrismaClient();

export const directoryFileProcessor: FileProcessor = async (file: File, fileAlbum: Album | null = null) => {
    if (!file.isDirectory) {
        throw Error(`File ${file.name} is not directory`);
    }

    const album = (fileAlbum ?? prisma.album.findFirst({ where: { id: file.albumId }})) as Album;

    if (album == null) {
        throw Error('Album not found');
    }

    const path = `${album.basePath}/${file.path}`;
    if (!fs.existsSync(path)) {
        throw new Error(`Directory not exists at path ${path}`);
    }

    const dirStat = fs.statSync(path);
    if (!dirStat.isDirectory()) {
        throw new Error(`Element at path ${path} is not a directory`);
    }

    const dbFiles = await prisma.file.findMany({ where: { parentFile: file }});
    const dbFileNames = dbFiles.map((f: File) => f.name + (f.extension.length > 0 ? `.${f.extension}` : ''));
    const dirFiles = fs.readdirSync(path);

    const filesToDelete = dbFiles.filter((f: File) => {
        const fullName = f.name + (f.extension.length > 0 ? `.${f.extension}` : '');
        return !dirFiles.includes(fullName);
    });

    const filesToAdd = dirFiles.filter(name => !dbFileNames.includes(name));

    filesToDelete.forEach(async (f: File) => {
        await prisma.file.update({ where: { id: f.id }, data: { status: 'Deleted' }});
    });

    filesToAdd.forEach(async (fileName: string) => {
        const fullPath = `${album.basePath}/${file.path}/${fileName}`;
        const stats = fs.statSync(fullPath);

        const fileData = {
            path: `${file.path}/${fileName}`,
            extension: fspath.extname(fileName),
            name: fspath.basename(fileName),
            size: stats.isDirectory() ? null : stats.size,
            isDirectory: stats.isDirectory(),
            albumId: album.id,
            createdAt: stats.ctime,
            modifiedAt: stats.mtime,
        };

        await prisma.file.create({
            data: fileData,
        });
    });

    return true;
}