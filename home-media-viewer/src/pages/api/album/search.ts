import type { NextApiRequest, NextApiResponse } from 'next';

import { albumSearchDataSchema, getAlbums } from '@/utils/albumHelper';
import { HmvError, getApiResponseWithEntityList, getRequestBodyObject, handleApiError } from '@/utils/apiHelpers';
import { withSessionRoute } from '@/utils/sessionRoute';
import { validateData } from '@/utils/dataValidator';
import type { AlbumDataTypeWithFiles, AlbumSearchType } from '@/types/api/albumTypes';

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  const { method, session } = req;

  switch (method) {
    case 'POST': {
      // search albums
      const postData = getRequestBodyObject<AlbumSearchType>(req, res);

      try {
        if (postData == null) {
          throw new HmvError('Empty request', { isPublic: true });
        }

        validateData(postData, albumSearchDataSchema);

        if (session?.user?.admin !== true) {
          postData.user = session?.user?.id ?? '';
        }

        const results = await getAlbums(postData);
        res.status(200).json(getApiResponseWithEntityList<AlbumDataTypeWithFiles>(results, { filter: postData }));
      } catch (e) {
        handleApiError(res, 'search user', e, postData);
      }

      break;
    }
    default:
      res.setHeader('Allow', ['POST']);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
};

export default withSessionRoute(handler);
