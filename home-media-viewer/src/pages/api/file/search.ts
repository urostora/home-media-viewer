import type { NextApiRequest, NextApiResponse } from 'next';
import { HmvError, getApiResponseWithEntityList, getRequestBodyObject, handleApiError } from '@/utils/apiHelpers';
import { FileResultType, FileSearchType } from '@/types/api/fileTypes';
import { getFiles } from '@/utils/fileHelper';
import { withSessionRoute } from '@/utils/sessionRoute';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const { method } = req;

  switch (method) {
    case 'POST': {
      // search files

      const postData = getRequestBodyObject<FileSearchType>(req, res);

      try {
        if (postData == null) {
          throw new HmvError('No search parameters specified');
        }

        if (req.session?.user?.admin !== true) {
          postData.user = req.session?.user?.id ?? '';
        }

        const results = await getFiles(postData, true);
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

export default withSessionRoute(handler);
