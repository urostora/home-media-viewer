import type { NextApiRequest, NextApiResponse } from 'next'
import { Prisma, PrismaClient } from '@prisma/client'

import { getRequestBodyObject } from '../../../utils/apiHelpers'
import { UserSearchType } from '@/types/api/userTypes';

const prisma = new PrismaClient()

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {

  const { method } = req;

  switch (method) {
    case 'POST':
      // search User
      const requestData: UserSearchType | null = getRequestBodyObject(req, res);
      if (requestData == null) {
        return;
      }

      const filter: Prisma.UserWhereInput = {
        id: requestData.id ?? undefined,
        name: requestData.name ?? undefined,
        email: requestData.email ?? undefined,
      };

      res.status(200).json(await prisma.user.findMany({
        where: filter,
        take: requestData.take ?? 10,
        skip: requestData.skip ?? 0,
      }));
      break
    // case 'PUT':
    //   // Update or create data in your database
    //   res.status(200).json({ id, name: name || `User ${id}` })
    //   break
    // case 'DELETE':

    default:
      res.setHeader('Allow', ['POST', 'PUT'])
      res.status(405).end(`Method ${method} Not Allowed`)
  }
}
