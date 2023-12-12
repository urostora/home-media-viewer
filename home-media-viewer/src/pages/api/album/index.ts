import type { NextApiRequest, NextApiResponse } from 'next';
import { addAlbum, albumAddDataSchema } from '@/utils/albumHelper';
import { getApiResponseWithData, getRequestBodyObject, handleApiError } from '@/utils/apiHelpers';
import { type AlbumAddType, type AlbumDataType } from '@/types/api/albumTypes';
import { apiOnlyWithAdminUsers } from '@/utils/auth/apiHoc';
import { validateData } from '@/utils/dataValidator';

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  const { method } = req;

  switch (method) {
    case 'POST':
    case 'PUT': {
      // Create album

      try {
        const putData: AlbumAddType = getRequestBodyObject(req, res);
        validateData(putData, albumAddDataSchema);

        const album = await addAlbum(putData);

        res.status(200).json(getApiResponseWithData<AlbumDataType>(album));
      } catch (e) {
        handleApiError(res, 'add album', e);
      }

      break;
    }
    default:
      res.setHeader('Allow', ['POST', 'PUT']);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
};

export default apiOnlyWithAdminUsers(handler);
