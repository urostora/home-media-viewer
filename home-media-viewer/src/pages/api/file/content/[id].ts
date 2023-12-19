import type { NextApiRequest, NextApiResponse } from 'next';

import { handleFileResponseByPath } from '@/utils/responseHelper';
import { getFullPath } from '@/utils/fileHelper';
import { withSessionRoute } from '@/utils/sessionRoute';

import prisma from '@/utils/prisma/prismaImporter';

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  const { method } = req;

  switch (method) {
    case 'GET':
      // search files
      try {
        const { id } = req.query;

        if (typeof id !== 'string') {
          throw Error('Insufficient parameters provided (missing fileId)');
        }

        const albumsFilter =
          req.session?.user?.admin === true
            ? undefined
            : { some: { users: { some: { id: req.session?.user?.id ?? '' } } } };

        const file = await prisma.file.findFirst({ where: { id, albums: albumsFilter } });

        if (file == null) {
          throw Error('Invalid or not allowed file');
        }

        const filePath = await getFullPath(file);
        handleFileResponseByPath(req, res, filePath);
      } catch (e) {
        res.status(400).end(`${e}`);
      }

      break;
    default:
      res.setHeader('Allow', ['GET']);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
};

export default withSessionRoute(handler);
