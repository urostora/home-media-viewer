import type { NextApiRequest, NextApiResponse } from 'next'
import { PrismaClient } from '@prisma/client'
import { getAlbums } from '@/utils/albumHelper';
import { getApiResponse, getEntityTypeRequestBodyObject, getRequestBodyObject } from '@/utils/apiHelpers';
import { EntityType } from '@/types/api/generalTypes';
import { AlbumSearchType } from '@/types/api/albumTypes';
import { deleteMetadata } from '@/utils/fileHelper';

const prisma = new PrismaClient()

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {

  const { method } = req;

  switch (method) {
        case 'POST':
            // update file metadata
            try {
                const postData: AlbumSearchType | null = getRequestBodyObject(req, res);
                if (postData == null) {
                    return;
                }

                const results = await getAlbums(postData);
                res.status(200).json(getApiResponse({ data: results }));
            } catch (e) {
                res.status(400).end(`${e}`);
            }
        case 'DELETE':
            // delete metadata
            const deleteData: EntityType | null = getEntityTypeRequestBodyObject(req, res);
            if (deleteData == null) {
                return;
            }
        
            const { id: idToDelete } = deleteData;
        
            try {
                const file = prisma.file.findFirst({ where: { id: idToDelete }});
                if (file == null) {
                    res.status(400).end(`File not found with id ${idToDelete}`);
                    return;
                }

                await deleteMetadata(file);
                res.status(200).json(getApiResponse({ idToDelete }));
            } catch (e) {
                res.status(400).end(`${e}`);
            }
        default:
            res.setHeader('Allow', ['POST'])
            res.status(405).end(`Method ${method} Not Allowed`)
    }
}