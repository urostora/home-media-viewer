import type { NextApiRequest, NextApiResponse } from 'next';

import { getApiResponse, getRequestBodyObject } from '@/utils/apiHelpers';
import { apiOnlyWithAdminUsers } from '@/utils/auth/apiHoc';
import updateMetadataProcess from '@/utils/processes/updateMetadataProcess';

import { type EntityType } from '@/types/api/generalTypes';

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  const { method } = req;

  switch (method) {
    case 'POST':
      try {
        const postData = getRequestBodyObject<EntityType>(req, res);
        if (postData == null) {
          throw Error('Request body not found');
        }

        if (typeof postData?.id !== 'string') {
          throw Error('Album id not found');
        }

        await updateMetadataProcess.update(undefined, undefined, postData.id);
        res.status(200).json(getApiResponse());
      } catch (e) {
        res.status(400).end(`${e}`);
      }
      break;
    default:
      res.setHeader('Allow', ['POST']);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
};

export default apiOnlyWithAdminUsers(handler);
