import type { NextApiRequest, NextApiResponse } from 'next';

import { HmvError, getApiResponseWithEntityList, getRequestBodyObject, handleApiError } from '@/utils/apiHelpers';
import { type FileResultType, type FileSearchType } from '@/types/api/fileTypes';
import { getFiles } from '@/utils/fileHelper';
import { withAuthenticatedRoute } from '@/utils/auth/authenticatedRoute';

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  const { method } = req;

  switch (method) {
    case 'POST': {
      // search files

      const postData = getRequestBodyObject<FileSearchType>(req, res);

      try {
        if (postData == null) {
          throw new HmvError('No search parameters specified');
        }

        if (req.authenticatedUser?.isAdmin !== true) {
          postData.user = req.authenticatedUser?.id ?? '';
        }

        const results = await getFiles(postData);
        res.status(200).json(getApiResponseWithEntityList<FileResultType>(results));
      } catch (e) {
        handleApiError(res, 'search files', e, { filter: postData });
      }

      break;
    }
    default:
      res.setHeader('Allow', ['POST']);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
};

export default withAuthenticatedRoute(handler);
