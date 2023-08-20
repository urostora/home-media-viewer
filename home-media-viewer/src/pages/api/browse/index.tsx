import type { NextApiRequest, NextApiResponse } from 'next';
import { Prisma, PrismaClient } from '@prisma/client';

import path from 'path';
import * as fs from 'node:fs';

import {
  getRequestBodyObject,
  getEntityTypeRequestBodyObject,
  getApiResponse,
  getApiResponseEntityList,
} from '@/utils/apiHelpers';
import { UserEditType, UserSearchType } from '@/types/api/userTypes';
import { addUser, deleteUser, updateUser } from '@/utils/userHelper';
import { EntityType } from '@/types/api/generalTypes';
import { apiOnlyWithAdminUsers } from '@/utils/auth/apiHoc';
import { getFiles } from '@/utils/fileHelper';
import { getAlbums } from '@/utils/albumHelper';

const prisma = new PrismaClient();

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const { method } = req;

  switch (method) {
    case 'GET':

        const baseDir: string = process.env.APP_ALBUM_ROOT_PATH as string;
        const relativePath = (Array.isArray(req.query['relativePath'])
            ? req.query['relativePath'][0]
            : req.query['relativePath']) ?? '';

        const fullPath = path.join(baseDir, relativePath);

        if (!fs.existsSync(fullPath)) {
            res.status(404).json(getApiResponse(`${relativePath} not found`));
            return;
        }

        const fullPathStats = fs.statSync(fullPath);
        if (!fullPathStats.isDirectory()) {
            res.status(404).json(getApiResponse(`${relativePath} is not a directory`));
            return;
        }

        // check if current directory is an album root
        const allAlbums = await getAlbums({ });
        const albumExactlyResult = allAlbums.data.filter(a => a.basePath === fullPath);
        const albumContainsResult = albumExactlyResult.length === 0
            ? allAlbums.data.filter(a => fullPath.startsWith(a.basePath))
            : [];

        const albumContains = albumContainsResult.length > 0 ? albumContainsResult[0] : null;
        const albumExactly = albumExactlyResult.length > 0 ? albumExactlyResult[0] : null;

        const album = (albumExactly ?? albumContains);

        const albumBasePath = album?.basePath ?? null;

        // check if current directory is a file object
        const storedDirectoryObjectResult = relativePath.length === 0 || albumContains === null
            ? null
            : await getFiles({
                album: albumContains,
                pathIsExactly: fullPath.substring(albumContains.basePath.length + 1),
                isDirectory: true
            });

        const storedDirectoryObject = storedDirectoryObjectResult === null || storedDirectoryObjectResult.count === 0
            ? null
            : storedDirectoryObjectResult.data[0];

        const storedFilesInDirectory = album === null
            ? null
            : await getFiles({ album, parentFileId: storedDirectoryObject?.id }, true);

        const directoryContentNames = fs.readdirSync(fullPath);

        const contentList = directoryContentNames.map(name => {
            const filePathFull = path.join(fullPath, name);
            const fileStats = fs.statSync(filePathFull);

            const filePathRelativeToAlbum = albumBasePath === null ? null : filePathFull.substring(albumBasePath.length + 1);
            const filePathRelativeToContentDir = filePathFull.substring(baseDir.length + 1);

            const storedAlbumList = fileStats.isDirectory() && allAlbums && allAlbums?.count > 0
                ? allAlbums.data.filter(a => a.basePath === filePathFull)
                : [];

            const storedAlbum = storedAlbumList === null || storedAlbumList.length === 0
                ? null
                : storedAlbumList[0];

            const storedFilesMatchingName = storedFilesInDirectory === null
                ? null
                : storedFilesInDirectory.data.filter(f =>  name === `${f.name}${f.extension.length > 0 ? `.${f.extension}` : ''}`);
            
            const storedFile = storedFilesMatchingName === null || storedFilesMatchingName.length === 0
                ? null
                : storedFilesMatchingName[0];

            return {
                name,
                path: filePathRelativeToContentDir,
                pathRelativeToAlbum: filePathRelativeToAlbum,
                isDirectory: fileStats.isDirectory(),
                size: fileStats.size,
                dateCreatedOn: fileStats.ctime,
                dateModifiedOn: fileStats.mtime,
                storedFile,
                storedAlbum,
            };
        });

        const results = {
            data: {
                relativePath: relativePath,
                storedDirectory: storedDirectoryObject,
                albumExactly,
                albumContains,
                content: contentList,
            },
        }

        res.status(200).json(getApiResponse(results));
        break;
    default:
      res.setHeader('Allow', [ 'GET' ]);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
}

export default apiOnlyWithAdminUsers(handler);