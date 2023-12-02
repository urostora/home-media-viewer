import type { NextApiRequest, NextApiResponse } from 'next';
import { getApiResponseWithData, getRequestBodyObject, handleApiError } from '@/utils/apiHelpers';
import { withSessionRoute } from '@/utils/sessionRoute';

import { AlbumDataType, AlbumExtendedDataType, AlbumUpdateType } from '@/types/api/albumTypes';
import { validateData } from '@/utils/dataValidator';
import { albumUpdateDataSchema, deleteAlbum, getAlbum, updateAlbum } from '@/utils/albumHelper';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const { query, method } = req;

  const id = query.id as string;

  if (typeof id !== 'string') {
    res.status(400).write('Invalid identifier');
    res.end();
    return;
  }

  const isAdmin = req.session?.user?.admin ?? false;

  const album = await getAlbum(id, false);
  if (album === null) {
    res.status(404).send(`No album found with id ${id}`);
    return;
  }

  switch (method) {
    case 'GET': {
      // get album data

      // check user rights
      const userId = req.session.user?.id;
      if (!isAdmin && album.users?.filter((u) => u.id === userId)?.length === 0) {
        // forbidden
        res.status(404).send(`User has no album with id ${id}`);
        return;
      }

      let returnValue = album;
      if (!isAdmin) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { users, ...albumWithoutUsers } = album;
        returnValue = albumWithoutUsers;
      }

      try {
        res.status(200).json(getApiResponseWithData<AlbumExtendedDataType>(returnValue));
      } catch (e) {
        handleApiError(res, 'get album', e);
      }

      break;
    }
    case 'PATCH': {
      // update album data - administrator

      if (!isAdmin) {
        // forbidden
        res.status(404).send(`User has no album with id ${id}`);
        return;
      }

      try {
        const putData: AlbumUpdateType = getRequestBodyObject(req, res);
        validateData(putData, albumUpdateDataSchema);

        const updateResult = await updateAlbum(id, putData);

        res.status(200).json(getApiResponseWithData<AlbumDataType>(updateResult));
      } catch (e) {
        handleApiError(res, 'update album', e);
      }

      break;
    }
    case 'DELETE': {
      // delete album - administrator

      if (!isAdmin) {
        // forbidden
        res.status(404).send(`User has no album with id ${id}`);
        return;
      }

      try {
        const deleteResult = await deleteAlbum(id);
        res.status(200).json(getApiResponseWithData<AlbumDataType>(deleteResult));
      } catch (e) {
        handleApiError(res, 'delete album', e);
      }
      break;
    }
    default:
      res.setHeader('Allow', ['GET', 'PATCH', 'DELETE']);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
};

export default withSessionRoute(handler);
