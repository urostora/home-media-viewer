import type { NextApiRequest, NextApiResponse } from 'next';

import { getRequestBodyObject, handleApiError, getApiResponseWithData } from '@/utils/apiHelpers';
import { type UserAddType, type UserDataType } from '@/types/api/userTypes';
import { addUser, userAddDataSchema } from '@/utils/userHelper';
import { apiOnlyWithAdminUsers } from '@/utils/auth/apiHoc';

import { validateData } from '@/utils/dataValidator';

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  const { method } = req;

  switch (method) {
    case 'POST':
    case 'PUT': {
      // Update or create data in your database
      const putData: UserAddType | null = getRequestBodyObject(req, res);
      if (putData == null) {
        return;
      }

      // add user
      try {
        validateData(putData, userAddDataSchema);

        const userAdded = await addUser(putData);

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password, ...userData } = userAdded;

        res.status(200).json(getApiResponseWithData<UserDataType>(userData));
      } catch (e) {
        handleApiError(res, 'add user', e, putData);
      }

      break;
    }
    default:
      res.setHeader('Allow', ['POST', 'PUT']);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
};

export default apiOnlyWithAdminUsers(handler);
