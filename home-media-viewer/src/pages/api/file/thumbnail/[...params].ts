import type { NextApiRequest, NextApiResponse } from 'next';
import { getFileIdThumbnailPath } from '@/utils/thumbnailHelper';
import { handleFileResponseByPath } from '@/utils/responseHelper';

const handler = (req: NextApiRequest, res: NextApiResponse): void => {
  const { method } = req;

  switch (method) {
    case 'GET':
      // search files
      try {
        const { params } = req.query;

        if (params === undefined || !Array.isArray(params) || params.length !== 2) {
          throw Error('Insufficient parameters provided (../fileId/size)');
        }

        const [fileId, sizeString] = params;
        let size = 200;
        try {
          size = Number.parseInt(sizeString);
        } catch (e) {
          throw Error('Invalid thumbnail size');
        }

        const thumbnailPath = getFileIdThumbnailPath(fileId, size ?? 200);
        handleFileResponseByPath(req, res, thumbnailPath);
      } catch (e) {
        res.status(400).end(`${e}`);
      }

      break;
    default:
      res.setHeader('Allow', ['GET']);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
};

export default handler;
