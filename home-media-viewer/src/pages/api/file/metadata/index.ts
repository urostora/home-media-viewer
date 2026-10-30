import type { NextApiRequest, NextApiResponse } from 'next';
import { getApiResponse, getEntityTypeRequestBodyObject } from '@/utils/apiHelpers';
import { type EntityType } from '@/types/api/generalTypes';
import { deleteMetadata, loadMetadata } from '@/utils/fileHelper';
import { apiOnlyWithAdminUsers } from '@/utils/auth/apiHoc';

import prisma from '@/utils/prisma/prismaImporter';
import { respondToProcessing } from '@/utils/processes/processingResponse';
import { IndexingBusyError } from '@/utils/processes/indexingState';

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
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

        if (file.isDirectory) {
          const ok = await loadMetadata(file);
          res.status(ok ? 200 : 500).json(getApiResponse({ ok, id: idToUpdate }));
        } else {
          await respondToProcessing(res, { fileId: idToUpdate, stages: ['metadata', 'thumbnails'], mode: 'refresh' });
        }
      } catch (e) {
        res.status(e instanceof IndexingBusyError ? 409 : 400).json({ ok: false, error: 'Metadata request failed' });
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
        res.status(e instanceof IndexingBusyError ? 409 : 400).json({ ok: false, error: 'Metadata request failed' });
      }
      break;
    default:
      res.setHeader('Allow', ['POST', 'DELETE']);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
};

export default apiOnlyWithAdminUsers(handler);
