import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { getApiResponse, getEntityTypeRequestBodyObject, getRequestBodyObject } from '@/utils/apiHelpers';
import { EntityType } from '@/types/api/generalTypes';
import { deleteMetadata, loadMetadata } from '@/utils/fileHelper';
import { apiOnlyWithAdminUsers } from '@/utils/auth/apiHoc';

const prisma = new PrismaClient();

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const { method } = req;

  switch (method) {
    case 'POST':
      // update file metadata
      try {
        const fileData: EntityType | null = getEntityTypeRequestBodyObject(req, res);
        if (fileData == null) {
          return;
        }

        const { id: idToUpdate } = fileData;

        const file = await prisma.file.findFirst({
          where: {
            id: idToUpdate,
            status: { in: ['Active', 'Disabled'] },
          },
        });

        if (file === null) {
          throw new Error(`File not exists with id ${idToUpdate}`);
        }

        const ok = await loadMetadata(file);

        res.status(200).json(getApiResponse({ ok, id: idToUpdate }));
      } catch (e) {
        res.status(400).end(`${e}`);
      }
      break;
    case 'DELETE':
      // delete metadata
      try {
        const updateData: EntityType | null = getEntityTypeRequestBodyObject(req, res);
        if (updateData == null) {
          throw new Error('Parameter "id" not specified');
        }

        const { id: idToUpdate } = updateData;

        const file = await prisma.file.findFirst({
          where: {
            id: idToUpdate,
            status: { in: ['Active', 'Disabled'] },
          },
        });

        if (file == null) {
          throw new Error(`File not exists with id ${idToUpdate}`);
        }

        await deleteMetadata(file);
        res.status(200).json(getApiResponse({ id: idToUpdate }));
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
