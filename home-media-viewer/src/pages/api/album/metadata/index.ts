import type { NextApiRequest, NextApiResponse } from 'next'
import { PrismaClient } from '@prisma/client'
import { getAlbums, processAlbumFilesMetadata } from '@/utils/albumHelper';
import { getApiResponse, getEntityTypeRequestBodyObject, getRequestBodyObject } from '@/utils/apiHelpers';
import { EntityType } from '@/types/api/generalTypes';
import { AlbumSearchType } from '@/types/api/albumTypes';
import { deleteMetadata, loadMetadata } from '@/utils/fileHelper';

const prisma = new PrismaClient()

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {

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
                        status: { in: [ 'Active', 'Disabled'],
                    }
                }});

                if (album === null) {
                    throw new Error(`Album not exists with id ${idToUpdate}`);
                }

                await processAlbumFilesMetadata(album.id);

                res.status(200).json(getApiResponse({ ok: true, id: idToUpdate}));
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
                        status: { in: [ 'Active', 'Disabled'],
                    }
                }});

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
            res.setHeader('Allow', ['POST'])
            res.status(405).end(`Method ${method} Not Allowed`)
    }
}