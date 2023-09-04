import type { NextApiRequest, NextApiResponse } from 'next';
import { addAlbum, deleteAlbum, getAlbums } from '@/utils/albumHelper';
import { getApiResponse, getEntityTypeRequestBodyObject, getRequestBodyObject } from '@/utils/apiHelpers';
import { EntityType } from '@/types/api/generalTypes';
import { AlbumAddType, AlbumSearchType } from '@/types/api/albumTypes';
import { withSessionRoute } from '@/utils/sessionRoute';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const { method } = req;

  switch (method) {
    case 'POST':
      // search albums
      try {
        const postData: AlbumSearchType | null = getRequestBodyObject(req, res);
        if (postData == null) {
          return;
        }

        if (req.session?.user?.admin !== true) {
          postData.user = req.session?.user?.id ?? '';
        }

        const results = await getAlbums(postData);
        res.status(200).json(getApiResponse(results));
      } catch (e) {
        res.status(400).end(`${e}`);
      }

      break;
    case 'PUT':
      if (req.session?.user?.admin !== true) {
        res.status(403).end('Only administrators allowed');
        return;
      }

      // Update or create data in your database
      const putData: AlbumAddType | null = getRequestBodyObject(req, res);
      if (putData == null) {
        res.status(400).end('Parameter Id is not specified');
        return;
      }

      const { path = null } = putData;
      if (path == null) {
        // cannot add album (albums are created wit sync command)
        res.status(400).end('Parameter path is not specified');
      } else {
        // edit album
        try {
          const id = await addAlbum(putData);
          res.status(200).json(getApiResponse({ id }));
        } catch (e) {
          res.status(400).end(`${e}`);
        }
      }

      break;
    case 'DELETE':
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
        await deleteAlbum(idToDelete);
        res.status(200).json(getApiResponse({ idToDelete }));
      } catch (e) {
        res.status(400).end(`${e}`);
      }

      break;
    default:
      res.setHeader('Allow', ['POST']);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
};

export default withSessionRoute(handler);
