import { Album, File, PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path"

const prisma = new PrismaClient();

export const addFile = async (filePath: string, album: Album, parentFile?: File) => {
    const stats = fs.statSync(filePath);
    const { name, ext } = path.parse(filePath);
    const isDirectory = stats.isDirectory();

    const relativePath = filePath.substring(album.basePath.length + 1);

    const fileData = {
        path: relativePath,
        extension: isDirectory ? '' : getPureExtension(ext),
        name: name,
        size: isDirectory ? null : stats.size,
        isDirectory: isDirectory,
        albumId: album.id,
        createdAt: stats.ctime,
        modifiedAt: stats.mtime,
        parentFileId: parentFile?.id
    };

    await prisma.file.create({
        data: fileData,
    });
}

const getPureExtension = (extension?: string): string => {
    if (typeof extension !== 'string') {
        return '';
    }

    return extension.startsWith('.')
        ? extension.substring(1)
        : extension;
}
