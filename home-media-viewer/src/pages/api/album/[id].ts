import type { NextApiRequest, NextApiResponse } from 'next';
import { getApiResponse } from '@/utils/apiHelpers';
import { withSessionRoute } from '@/utils/sessionRoute';

import prisma from '@/utils/prisma/prismaImporter';

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

  const data: any = await prisma.album.findFirst({
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

  if (data != null) {
    // get file processing informations
    const fileStatus = await prisma.file.groupBy({
      where: {
        albums: {
          some: {
            id: data.id,
          }
        }
      },
      by: ['metadataStatus'],
      _count: {
        id: true,
      },
    });

    data.fileStatus = fileStatus.map(fs => {
      return {
        metadataStatus: fs.metadataStatus,
        fileCount: fs._count.id
      }
    });
  }

  res.status(200).json(getApiResponse({ ok: data !== null, data }));
};

export default withSessionRoute(handler);
