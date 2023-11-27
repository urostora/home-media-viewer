import type { NextApiRequest, NextApiResponse } from 'next';
import { updateAlbum } from '@/utils/albumHelper';
import { deleteFile } from '@/utils/fileHelper';
import { getApiResponse, getEntityTypeRequestBodyObject, getRequestBodyObject } from '@/utils/apiHelpers';
import { EntityType } from '@/types/api/generalTypes';
import { AlbumUpdateType } from '@/types/api/albumTypes';
import { FileSearchType } from '@/types/api/fileTypes';
import { getFiles } from '@/utils/fileHelper';
import { withSessionRoute } from '@/utils/sessionRoute';

import prisma from '@/utils/prisma/prismaImporter';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const { method } = req;

  switch (method) {
    case 'POST': {
      // search files
      try {
        const postData = getRequestBodyObject<FileSearchType>(req, res);
        if (postData == null) {
          throw Error('No search parameters specified');
        }

        if (req.session?.user?.admin !== true) {
          postData.user = req.session?.user?.id ?? '';
        }

        const results = await getFiles(postData, true);
        res.status(200).json(getApiResponse(results));
      } catch (e) {
        res.status(400).end(`${e}`);
      }

      break;
    }
    case 'PUT': {
      if (req.session?.user?.admin !== true) {
        res.status(403).end('Only administrators allowed');
        return;
      }

      // Update or create data in your database
      const putData = getRequestBodyObject<AlbumUpdateType>(req, res);
      if (putData == null) {
        res.status(400).end('Parameter Id is not specified');
        return;
      }

      const { id = null } = putData;
      if (id == null) {
        // cannot add album (albums are created wit sync command)
        res.status(400).end('Parameter Id is not specified');
      } else {
        // edit album
        try {
          await updateAlbum(putData);
          res.status(200).json(getApiResponse({ id }));
        } catch (e) {
          res.status(400).end(`${e}`);
        }
      }

      break;
    }
    case 'DELETE': {
      if (req.session?.user?.admin !== true) {
        res.status(403).end('Only administrators allowed');
        return;
      }

      // Update or create data in your database
      const deleteData: EntityType | null = getEntityTypeRequestBodyObject(req, res);
      if (deleteData == null) {
        return;
      }

      const { id: idToDelete } = deleteData;

      try {
        const file = await prisma.file.findFirst({
          where: {
            id: idToDelete,
            status: { in: ['Active', 'Disabled'] },
          },
        });

        if (file === null) {
          throw new Error(`File not exists with id ${idToDelete}`);
        }

        await deleteFile(file);
        res.status(200).json(getApiResponse({ idToDelete }));
      } catch (e) {
        res.status(400).end(`${e}`);
      }

      break;
    }
    default:
      res.setHeader('Allow', ['POST', 'PUT', 'DELETE']);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
};

export default withSessionRoute(handler);
