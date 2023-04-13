import type { NextApiRequest, NextApiResponse } from 'next';
import { Prisma, PrismaClient } from '@prisma/client';
import { syncAlbums } from '@/utils/albumHelper';
import { getApiResponse } from '@/utils/apiHelpers';

const prisma = new PrismaClient();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;

  switch (method) {
    case 'POST':
      try {
        const result = await syncAlbums();
        res.status(200).json(getApiResponse({ data: result }));
      } catch (e) {
        res.status(400).end(`${e}`);
      }
    default:
      res.setHeader('Allow', ['POST']);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
}
