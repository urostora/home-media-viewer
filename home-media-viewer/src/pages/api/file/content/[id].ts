import type { NextApiRequest, NextApiResponse } from 'next';

import { handleFileResponseByPath } from '@/utils/responseHelper';
import { getFullPath } from '@/utils/fileHelper';
import { withAuthenticatedRoute } from '@/utils/auth/authenticatedRoute';

import { isFileIdentifier, resolveReadableFile } from '@/utils/auth/readableFile';
import { logApiFailure } from '@/utils/apiLogger';

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  const { method } = req;

  switch (method) {
    case 'GET':
      // search files
      try {
        const { id } = req.query;

        if (!isFileIdentifier(id)) {
          res.status(400).end('Invalid file identifier');
          return;
        }

        const file = await resolveReadableFile(id, req.authenticatedUser);

        if (file == null) {
          res.status(404).end('File not found');
          return;
        }

        const filePath = getFullPath(file);
        handleFileResponseByPath(req, res, filePath);
      } catch (e) {
        logApiFailure('read file content', 500, e);
        res.status(500).end('File content unavailable');
      }

      break;
    default:
      res.setHeader('Allow', ['GET']);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
};

export default withAuthenticatedRoute(handler);
