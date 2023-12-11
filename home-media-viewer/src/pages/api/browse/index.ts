import type { NextApiRequest, NextApiResponse } from 'next';

import path from 'path';
import * as fs from 'node:fs';

import { getApiResponseWithData } from '@/utils/apiHelpers';
import { apiOnlyWithAdminUsers } from '@/utils/auth/apiHoc';
import { ALBUM_PATH, getFiles } from '@/utils/fileHelper';
import { getAlbums, getAlbumsContainingPath, getClosestParentAlbum } from '@/utils/albumHelper';
import type { BrowseResult, BrowseResultFile } from '@/types/api/browseTypes';
import type { EntityListResult } from '@/types/api/generalTypes';
import type { FileResultType } from '@/types/api/fileTypes';

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  const { method } = req;

  switch (method) {
    case 'GET': {
      const baseDir: string = ALBUM_PATH;
      const relativePath =
        (Array.isArray(req.query.relativePath) ? req.query.relativePath[0] : req.query.relativePath) ?? '';

      const fullPath = path.join(baseDir, relativePath);

      if (!fs.existsSync(fullPath)) {
        res.status(404).send(`${relativePath} not found`);
        return;
      }

      const fullPathStats = fs.statSync(fullPath);
      if (!fullPathStats.isDirectory()) {
        res.status(404).send(`${relativePath} is not a directory`);
        return;
      }

      // check if current directory is an album root
      const albumsContainingThisDirectory = await getAlbumsContainingPath(fullPath);

      const [albumExactly = null] = albumsContainingThisDirectory.filter((a) => a.basePath === fullPath);
      const albumContains = await getClosestParentAlbum(fullPath, false);

      const album = albumExactly ?? albumContains;

      // console.log(`Browse GET API for path ${fullPath}, Album:`, album);

      const albumBasePath = album?.basePath ?? null;

      // load albums in this directory
      const albumsInCurrentDirectory = (await getAlbums({ basePathContains: fullPath })).data.filter(
        (a) => a.basePath.startsWith(fullPath) && a.basePath.substring(fullPath.length + 1).indexOf('/') <= 0,
      );

      // check if current directory is a file object
      const storedDirectoryObjectResult =
        relativePath.length === 0
          ? null
          : await getFiles({
              pathIsExactly: relativePath,
              isDirectory: true,
              take: 0,
            });

      const storedDirectoryObject =
        storedDirectoryObjectResult === null || storedDirectoryObjectResult.count === 0
          ? null
          : storedDirectoryObjectResult.data[0];

      let storedFilesInDirectory: EntityListResult<FileResultType> | null = null;
      if (storedDirectoryObject !== null) {
        storedFilesInDirectory = await getFiles(
          {
            parentFileId: storedDirectoryObject.id,
          },
          true,
        );
      } else if (albumExactly !== null) {
        storedFilesInDirectory = await getFiles(
          {
            album: { id: albumExactly.id },
            parentFileId: null,
          },
          true,
        );
      }

      // console.log(
      //   'Stored files in directory: ',
      //   storedFilesInDirectory === null ? '-' : storedFilesInDirectory.data.map((f) => `${f.path} (id: ${f.id})`),
      // );

      const directoryContentNames = fs.readdirSync(fullPath);

      const contentList = directoryContentNames.map((name: string): BrowseResultFile => {
        const filePathFull = path.join(fullPath, name);
        const fileStats = fs.statSync(filePathFull);

        const filePathRelativeToAlbum =
          albumBasePath === null ? null : filePathFull.substring(albumBasePath.length + 1);
        const filePathRelativeToContentDir = filePathFull.substring(baseDir.length + 1);

        const storedAlbumList =
          fileStats.isDirectory() && albumsInCurrentDirectory.length > 0
            ? albumsInCurrentDirectory.filter((a) => a.basePath === filePathFull)
            : [];

        const storedAlbum = storedAlbumList === null || storedAlbumList.length === 0 ? null : storedAlbumList[0];

        const storedFilesMatchingName =
          storedFilesInDirectory === null
            ? null
            : storedFilesInDirectory.data.filter(
                (f) => name === `${f.name}${f.extension.length > 0 ? `.${f.extension}` : ''}`,
              );

        const storedFile =
          storedFilesMatchingName === null || storedFilesMatchingName.length === 0 ? null : storedFilesMatchingName[0];

        const album = albumsInCurrentDirectory.find((a) => a.basePath === filePathFull);

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
          exactAlbum: album ?? null,
        };
      });

      const results = {
        relativePath,
        storedDirectory: storedDirectoryObject,
        albumExactly,
        albumContains,
        content: contentList,
      };

      res.status(200).json(getApiResponseWithData<BrowseResult>(results));
      break;
    }
    default:
      res.setHeader('Allow', ['GET']);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
};

export default apiOnlyWithAdminUsers(handler);
