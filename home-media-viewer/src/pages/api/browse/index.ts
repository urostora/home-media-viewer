import type { NextApiRequest, NextApiResponse } from 'next';

import { getApiResponseWithData, handleApiError } from '@/utils/apiHelpers';
import { apiOnlyWithAdminUsers } from '@/utils/auth/apiHoc';
import { getBrowseResult } from '@/utils/fileHelper';
import type { BrowseResult } from '@/types/api/browseTypes';

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  const { method } = req;

  switch (method) {
    case 'GET': {
      try {
        const results = await getBrowseResult('');
        res.status(200).json(getApiResponseWithData<BrowseResult>(results));
      } catch (e) {
        handleApiError(res, 'get broswe result', e);
      }

      break;
    }
    default:
      res.setHeader('Allow', ['GET']);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
};

export default apiOnlyWithAdminUsers(handler);
