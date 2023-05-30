import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { processAlbumFilesMetadata } from '@/utils/albumHelper';
import { getApiResponse, getEntityTypeRequestBodyObject } from '@/utils/apiHelpers';
import { EntityType } from '@/types/api/generalTypes';
import { apiOnlyWithAdminUsers } from '@/utils/auth/apiHoc';

const prisma = new PrismaClient();

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const { method } = req;

  switch (method) {
    case 'POST':
      // update album files metadata
      try {
        const albumData: EntityType | null = getEntityTypeRequestBodyObject(req, res);
        if (albumData == null) {
          return;
        }

        const { id: idToUpdate } = albumData;

        const album = await prisma.album.findFirst({
          where: {
            id: idToUpdate,
            status: { in: ['Active', 'Disabled'] },
          },
        });

        if (album === null) {
          throw new Error(`Album not exists with id ${idToUpdate}`);
        }

        await processAlbumFilesMetadata(album.id);

        res.status(200).json(getApiResponse({ ok: true, id: idToUpdate }));
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
