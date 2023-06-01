import { UserAlbumConnectType } from '@/types/api/userTypes';
import { addUserToAlbum, removeUserFromAlbum } from '@/utils/albumHelper';
import { getApiResponse, getRequestBodyObject } from '@/utils/apiHelpers';
import { apiOnlyWithAdminUsers } from '@/utils/auth/apiHoc';
import { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const { method } = req;

  if (!['PUT', 'DELETE'].includes(req?.method ?? '')) {
    res.setHeader('Allow', ['DELETE', 'PUT']);
    res.status(405).end(`Method ${method} Not Allowed`);
  }

  const postData: UserAlbumConnectType | null = getRequestBodyObject(req, res);
  if (postData == null) {
    return;
  }

  if (typeof postData?.albumId !== 'string' || typeof postData?.userId !== 'string') {
    res.status(400).json(getApiResponse({ error: 'Missing albumId or userId' }));
    return;
  }

  try {
    if (req.method === 'PUT') {
      await addUserToAlbum(postData.albumId, postData.userId);
    } else if (req.method === 'DELETE') {
      await removeUserFromAlbum(postData.albumId, postData.userId);
    }

    res.status(200).json(getApiResponse({ ok: true }));
  } catch (e) {
    res.status(200).json(getApiResponse({ error: `Error while attaching album to user: ${e}` }));
  }
};

export default apiOnlyWithAdminUsers(handler);
