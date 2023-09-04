import type { NextApiRequest, NextApiResponse } from 'next';
import { syncAlbums } from '@/utils/albumHelper';
import { getApiResponse } from '@/utils/apiHelpers';
import { apiOnlyWithAdminUsers } from '@/utils/auth/apiHoc';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const { method } = req;

  res.status(403).write('function deprecated');
  return;

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
};

export default apiOnlyWithAdminUsers(handler);
