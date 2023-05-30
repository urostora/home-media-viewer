import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { getApiResponse, getApiResponseEntityList } from '@/utils/apiHelpers';
import { apiOnlyWithAdminUsers } from '@/utils/auth/apiHoc';
import { withSessionRoute } from '@/utils/sessionRoute';

const prisma = new PrismaClient();

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const { query, method } = req;

  if (method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${method} Not Allowed`);
    return;
  }

  const id = query.id as string;

  if (typeof id !== 'string') {
    res.status(400).write('Invalid identifier');
    res.end();
    return;
  }

  const usersQuery = req.session?.user?.admin
    ? undefined
    : {
        some: {
          id: req.session?.user?.id,
        },
      };

  const data = await prisma.album.findFirst({
    where: {
      id: id,
      users: usersQuery,
    },
    select: {
      id: true,
      status: true,
      name: true,
      sourceType: true,
      basePath: true,
      connectionString: true,
    },
  });

  res.status(200).json(getApiResponse({ ok: data !== null, data }));
};

export default withSessionRoute(handler);
