import type { NextApiRequest, NextApiResponse } from 'next';

import { getApiResponse, getApiResponseWithData, handleApiError } from '@/utils/apiHelpers';
import { deleteFile, getFileById } from '@/utils/fileHelper';
import { getFileThumbnailInBase64 } from '@/utils/thumbnailHelper';
import { withSessionRoute } from '@/utils/sessionRoute';

import type { File } from '@prisma/client';

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  const { method, query } = req;

  if (typeof query?.id !== 'string' || query.id.length === 0) {
    res.status(400).write(`Invalid identifier ${query?.id}`);
    res.end();
    return;
  }

  const id = query.id;
  const userId = req.session?.user?.admin === true ? undefined : req?.session?.user?.id ?? '';

  const file = await getFileById(id, userId);

  if (file === null) {
    res.status(404).send('File not found');
    return;
  }

  switch (method) {
    case 'GET': {
      try {
        const result = {
          ...file,
          thumbnail: getFileThumbnailInBase64(file),
        };

        // return user data
        res.status(200).json(getApiResponseWithData<File | null>(result));
      } catch (e) {
        handleApiError(res, 'get user', e, { id });
      }
      break;
    }
    case 'DELETE': {
      if (req.session.user?.admin !== true) {
        // forbidden
        res.status(403).send('Only administrators allowed');
      }

      try {
        await deleteFile(file);
        res.status(200).json(getApiResponse({ id }));
      } catch (e) {
        handleApiError(res, 'delete user', e, { id });
      }

      break;
    }
    default:
      res.setHeader('Allow', ['GET', 'DELETE']);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
};

export default withSessionRoute(handler);
