import type { NextApiRequest, NextApiResponse } from 'next';

import { apiOnlyWithAdminUsers } from '@/utils/auth/apiHoc';

import { getRequestBodyObject, getApiResponseWithEntityList, handleApiError } from '@/utils/apiHelpers';
import { UserDataType, UserSearchType } from '@/types/api/userTypes';

import { validateData } from '@/utils/dataValidator';
import { searchUser, userSearchDataSchema } from '@/utils/userHelper';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const { method } = req;

  if (method != 'POST') {
    res.setHeader('Allow', ['POST']).status(405).end(`Method ${method} Not Allowed`);
    return;
  }

  const postData: UserSearchType | null = getRequestBodyObject(req, res);
  if (postData == null) {
    return;
  }

  try {
    validateData(postData, userSearchDataSchema);

    const result = await searchUser(postData);

    res.status(200).json(getApiResponseWithEntityList<UserDataType>(result, { filter: postData }));
  } catch (e) {
    handleApiError(res, 'search user', e, postData);
  }
};

export default apiOnlyWithAdminUsers(handler);
