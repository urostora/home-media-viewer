import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { getFileIdThumbnailPath } from '@/utils/thumbnailHelper';
import { handleFileResponseByPath } from '@/utils/responseHelper';
import { getFullPath } from '@/utils/fileHelper';

const prisma = new PrismaClient();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;

  switch (method) {
    case 'GET':
      // search files
      try {
        const { id } = req.query;

        if (typeof id !== 'string') {
          throw Error('Insufficient parameters provided (missing fileId)');
        }

        const file = await prisma.file.findFirst({ where: { id }, include: { album: true } });

        if (file == null) {
          throw Error('Invalid file id');
        }

        const filePath = await getFullPath(file, file.album);
        handleFileResponseByPath(req, res, filePath);
      } catch (e) {
        res.status(400).end(`${e}`);
      }

      break;
    default:
      res.setHeader('Allow', ['GET']);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
}
