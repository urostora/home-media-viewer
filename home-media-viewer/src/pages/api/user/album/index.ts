import { UserAlbumConnectType } from '@/types/api/userTypes';
import { addUserToAlbum, removeUserFromAlbum } from '@/utils/albumHelper';
import { getApiResponse, getRequestBodyObject, handleApiError } from '@/utils/apiHelpers';
import { apiOnlyWithAdminUsers } from '@/utils/auth/apiHoc';
import { DataValidatorSchema, validateData } from '@/utils/dataValidator';
import { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const { method } = req;

  if (!['PUT', 'DELETE'].includes(req?.method ?? '')) {
    res.setHeader('Allow', ['DELETE', 'PUT']);
    res.status(405).end(`Method ${method} Not Allowed`);
    return;
  }

  const postData = getRequestBodyObject<UserAlbumConnectType>(req, res);

  const schema: DataValidatorSchema = [
    { field: 'albumId', isRequired: true },
    { field: 'userId', isRequired: true },
  ];

  try {
    validateData(postData, schema);

    if (req.method === 'PUT') {
      await addUserToAlbum(postData.albumId, postData.userId);
    } else if (req.method === 'DELETE') {
      await removeUserFromAlbum(postData.albumId, postData.userId);
    }

    res.status(200).json(getApiResponse({ ok: true }));
  } catch (e) {
    handleApiError(res, `${req.method === 'DELETE' ? 'dis' : ''}connect user and album`, e, postData);
  }
};

export default apiOnlyWithAdminUsers(handler);
