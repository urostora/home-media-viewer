import type { NextApiRequest, NextApiResponse } from 'next';
import { Prisma, PrismaClient } from '@prisma/client';
import { deleteAlbum, getAlbums, updateAlbum } from '@/utils/albumHelper';
import { getApiResponse, getEntityTypeRequestBodyObject, getRequestBodyObject } from '@/utils/apiHelpers';
import { EntityType } from '@/types/api/generalTypes';
import { AlbumSearchType, AlbumUpdateType } from '@/types/api/albumTypes';

const prisma = new PrismaClient();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;

  switch (method) {
    case 'POST':
      // search albums
      try {
        const postData: AlbumSearchType | null = getRequestBodyObject(req, res);
        if (postData == null) {
          return;
        }

        const results = await getAlbums(postData);
        res.status(200).json(getApiResponse(results));
      } catch (e) {
        res.status(400).end(`${e}`);
      }

      break;
    case 'PUT':
      // Update or create data in your database
      const putData: AlbumUpdateType | null = getRequestBodyObject(req, res);
      if (putData == null) {
        res.status(400).end('Parameter Id is not specified');
        return;
      }

      const { id = null } = putData;
      if (id == null) {
        // cannot add album (albums are created wit sync command)
        res.status(400).end('Parameter Id is not specified');
      } else {
        // edit album
        try {
          await updateAlbum(putData);
          res.status(200).json(getApiResponse({ id }));
        } catch (e) {
          res.status(400).end(`${e}`);
        }
      }

      break;
    case 'DELETE':
      // Update or create data in your database
      const deleteData: EntityType | null = getEntityTypeRequestBodyObject(req, res);
      if (deleteData == null) {
        return;
      }

      const { id: idToDelete } = deleteData;

      try {
        await deleteAlbum(idToDelete);
        res.status(200).json(getApiResponse({ idToDelete }));
      } catch (e) {
        res.status(400).end(`${e}`);
      }

      break;
    default:
      res.setHeader('Allow', ['POST']);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
}
