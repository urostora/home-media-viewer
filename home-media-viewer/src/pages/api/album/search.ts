import type { NextApiRequest, NextApiResponse } from 'next';
import { albumSearchDataSchema, getAlbums } from '@/utils/albumHelper';
import { HmvError, getApiResponseWithEntityList, getRequestBodyObject, handleApiError } from '@/utils/apiHelpers';
import { AlbumResultType, AlbumSearchType } from '@/types/api/albumTypes';
import { withSessionRoute } from '@/utils/sessionRoute';
import { validateData } from '@/utils/dataValidator';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const { method } = req;

  switch (method) {
    case 'POST': {
      // search albums
      const postData = getRequestBodyObject<AlbumSearchType>(req, res);

      try {
        if (postData == null) {
          throw new HmvError('Empty request', { isPublic: true });
        }

        validateData(postData, albumSearchDataSchema);

        if (req.session?.user?.admin !== true) {
          postData.user = req.session?.user?.id ?? '';
        }

        const results = await getAlbums(postData);
        res.status(200).json(getApiResponseWithEntityList<AlbumResultType>(results, { filter: postData }));
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
