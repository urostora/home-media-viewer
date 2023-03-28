import type { NextApiRequest, NextApiResponse } from 'next'
import { Prisma, PrismaClient } from '@prisma/client'

import { getRequestBodyObject, getEntityTypeRequestBodyObject, getApiResponse, getApiResponseEntityList } from '@/utils/apiHelpers'
import { UserEditType, UserSearchType } from '@/types/api/userTypes';
import { addUser, deleteUser, updateUser } from '@/utils/userHelper';
import { EntityType } from '@/types/api/generalTypes';

const prisma = new PrismaClient()

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {

  const { method } = req;

  switch (method) {
    case 'POST':
      // search User
      const postData: UserSearchType | null = getRequestBodyObject(req, res);
      if (postData == null) {
        return;
      }

      const filter: Prisma.UserWhereInput = {
        id: postData.id ?? undefined,
        name: postData.name ?? undefined,
        email: postData.email ?? undefined,
        status: postData.status ?? undefined,
      };

      const results = await prisma.$transaction([
        prisma.user.count({ where: filter }),
        prisma.user.findMany({
          where: filter,
          take: postData.take ?? 10,
          skip: postData.skip ?? 0,
          select: {
            id: true,
            name: true,
            email: true,
            status: true,
          }
        })
      ]);

      res.status(200).json(getApiResponseEntityList({}, results[1], results[0]) );
      break
    case 'PUT':
      // Update or create data in your database
      const putData: UserEditType | null = getRequestBodyObject(req, res);
      if (putData == null) {
        return;
      }

      const { id = null } = putData;
      if (id == null) {
        // add user
        try {
          const userAdded = await addUser(putData);

          res.status(200).json(getApiResponse({ id: userAdded.id }));
        } catch (e) {
          res.status(400).end(`${e}`);
        }

      } else {
        // edit user
        try {
          await updateUser(putData);
          res.status(200).json(getApiResponse({ id }));
        } catch (e) {
          res.status(400).end(`${e}`);
        }
      }

      break
    case 'DELETE':
      // Update or create data in your database
      const deleteData: EntityType | null = getEntityTypeRequestBodyObject(req, res);
      if (deleteData == null) {
        return;
      }

      const { id: idToDelete } = deleteData;

      try {
        await deleteUser(idToDelete);
        res.status(200).json(getApiResponse({ idToDelete }));
      } catch (e) {
        res.status(400).end(`${e}`);
      }
    default:
      res.setHeader('Allow', ['POST', 'PUT'])
      res.status(405).end(`Method ${method} Not Allowed`)
  }
}
