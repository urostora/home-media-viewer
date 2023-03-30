import { PrismaClient } from "@prisma/client";
import fs from "fs";

const prisma = new PrismaClient();

export const syncAlbums = async () => {
    const baseDirectory = process.env.APP_ALBUM_ROOT_PATH;
    if (typeof baseDirectory !== 'string') {
        throw new Error('Base directory is not set in env variable "APP_ALBUM_ROOT_PATH"');
    };

    if (!fs.existsSync(baseDirectory)) {
        throw new Error(`Base directory not exists at path ${baseDirectory}`);
    }

    const activeAlbums = await prisma.album.findMany({ where: { status: { in: [ 'Active', 'Disabled' ]}}});
    const directories = fs.readdirSync(baseDirectory)
        .filter(path => {
            const stat = fs.statSync(`${baseDirectory}/${path}`);
            return stat.isDirectory();
        });
    const directoriesWithFullPath = directories.map(dir => `${baseDirectory}/${dir}`);

    const directoriesWithoutAlbum = directories.filter(path => activeAlbums.filter(a => a.basePath === `${baseDirectory}/${path}`).length === 0);
    const albumsWithoutDirectory = activeAlbums.filter(a => !directoriesWithFullPath.includes(a.basePath));

    directoriesWithoutAlbum.forEach(async path => {
        await prisma.album.create({
            data: {
                basePath: `${baseDirectory}/${path}`,
                name: path,
                sourceType: 'Ftp',
                connectionString: `file://${baseDirectory}/${path}`,
            }
        });
    });

    albumsWithoutDirectory.forEach(async a => {
        await prisma.album.update({
            data: {
                status: 'Deleted',
            },
            where: {
                id: a.id,
            }
        });
    });

    return {
        baseDirectory,
        allDirectories: directories,
        allDirectoriesWithFullPath: directoriesWithFullPath,
        allDirectoriesCount: directories.length,
        activeAlbumsCount: activeAlbums.length,
        albumsAdded: directoriesWithoutAlbum.length,
        albumsDeleted: albumsWithoutDirectory.length,
    };
}
