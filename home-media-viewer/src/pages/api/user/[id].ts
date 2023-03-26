import type { NextApiRequest, NextApiResponse } from 'next'
import { PrismaClient } from '@prisma/client'
import { STATUS_CODES } from 'http';

const prisma = new PrismaClient()

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
    const { query, method } = req;

    if (method !== 'GET') {
        res.setHeader('Allow', ['GET'])
        res.status(405).end(`Method ${method} Not Allowed`)
        return;
    }

    const id = query.id as string;

    if(typeof id !== 'string') {
        res.status(400).write('Invalid identifier');
        res.end();
        return;
    }

    const data = await prisma.user.findMany({ where: { id: id }});
    res.status(200).json(data)
}