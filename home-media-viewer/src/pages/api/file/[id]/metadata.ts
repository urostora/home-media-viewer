import type { NextApiRequest, NextApiResponse } from 'next';

import { getApiResponse, getApiResponseWithData, getRequestBodyObject, handleApiError } from '@/utils/apiHelpers';
import { fileMetadataUpdateDataSchema, getFileById, updateFileMetaEntry } from '@/utils/fileHelper';
import { getFileThumbnailInBase64 } from '@/utils/thumbnailHelper';
import { withSessionRoute } from '@/utils/sessionRoute';

import type { FileMeta } from '@prisma/client';
import { validateData } from '@/utils/dataValidator';

import type { FileMetaUpdateType } from '@/types/api/fileTypes';

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
          ...file.metas,
          thumbnail: getFileThumbnailInBase64(file),
        };

        // return user data
        res.status(200).json(getApiResponseWithData<FileMeta[] | null>(result));
      } catch (e) {
        handleApiError(res, 'get user', e, { id });
      }
      break;
    }
    case 'PATCH': {
      if (req.session.user?.admin !== true) {
        // forbidden
        res.status(403).send('Only administrators allowed');
      }

      try {
        const updateData: FileMetaUpdateType = getRequestBodyObject(req, res);
        validateData(updateData, fileMetadataUpdateDataSchema);

        await updateFileMetaEntry(file, updateData);

        res.status(200).json(getApiResponse());
      } catch (e) {
        handleApiError(res, 'get user', e, { id });
      }

      break;
    }
    default:
      res.setHeader('Allow', ['GET', 'PATCH']);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
};

export default withSessionRoute(handler);
