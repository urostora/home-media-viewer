import type { NextApiRequest, NextApiResponse } from 'next';

import { getRequestBodyObject, getApiResponse, getApiResponseWithData, handleApiError } from '@/utils/apiHelpers';
import { UserDataType, UserEditType, UserExtendedDataType } from '@/types/api/userTypes';
import { deleteUser, getUserData, updateUser, userEditDataSchema } from '@/utils/userHelper';
import { apiOnlyWithAdminUsers } from '@/utils/auth/apiHoc';

import { validateData } from '@/utils/dataValidator';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const { method, query } = req;

  if (typeof query?.id !== 'string' || query.id.length === 0) {
    res.status(400).write(`Invalid identifier ${query?.id}`);
    res.end();
    return;
  }

  const id = query.id as string;

  switch (method) {
    case 'GET': {
      try {
        const result = await getUserData(id);
        // return user data
        res.status(200).json(getApiResponseWithData<UserExtendedDataType | null>(result));
      } catch (e) {
        handleApiError(res, 'get user', e, { id });
      }
      break;
    }
    case 'PATCH':
    case 'PUT': {
      // modify user data
      const patchData: UserEditType | null = getRequestBodyObject<UserEditType>(req, res);
      if (patchData == null) {
        res.status(400).write('Invalid data provided');
        res.end();
        return;
      }

      try {
        validateData(patchData, userEditDataSchema);

        const userData = await updateUser(id, patchData);

        // don't return password hash
        const {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          password,
          ...returnUserData
        } = userData;

        res.status(200).json(getApiResponseWithData<UserDataType>(returnUserData));
      } catch (e) {
        handleApiError(res, 'update user', e, { id, ...patchData });
      }

      break;
    }
    case 'DELETE': {
      try {
        await deleteUser(id);
        res.status(200).json(getApiResponse({ id }));
      } catch (e) {
        handleApiError(res, 'delete user', e, { id });
      }

      break;
    }
    default:
      res.setHeader('Allow', ['GET', 'PATCH', 'PUT', 'DELETE']);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
};

export default apiOnlyWithAdminUsers(handler);
