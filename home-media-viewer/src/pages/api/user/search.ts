import type { NextApiRequest, NextApiResponse } from 'next';
import { $Enums, Prisma } from '@prisma/client';

import { getRequestBodyObject, getApiResponseWithEntityList, handleApiError } from '@/utils/apiHelpers';
import { UserDataType, UserSearchType } from '@/types/api/userTypes';

import { apiOnlyWithAdminUsers } from '@/utils/auth/apiHoc';

import prisma from '@/utils/prisma/prismaImporter';
import { getSimpleValueOrInFilter, getStringContainOrInFilter } from '@/utils/api/searchParameterHelper';
import { validateData } from '@/utils/dataValidator';
import { userSearchDataSchema } from '@/utils/userHelper';

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

    const filter: Prisma.UserWhereInput = {
      id: getSimpleValueOrInFilter<string>(postData?.id),
      name: getStringContainOrInFilter(postData?.name),
      email: getStringContainOrInFilter(postData?.email),
      status: getSimpleValueOrInFilter<$Enums.Status>(postData?.status) ?? { in: ['Active', 'Disabled'] },
      isAdmin: postData.isAdmin,
    };

    const { take = 10, skip = 0 } = postData;

    const results = await prisma.$transaction([
      prisma.user.count({ where: filter }),
      prisma.user.findMany({
        where: filter,
        take,
        skip,
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          isAdmin: true,
        },
      }),
    ]);

    res.status(200).json(getApiResponseWithEntityList<UserDataType>(results[1], results[0]));
  } catch (e) {
    handleApiError(res, 'search user', e, postData);
  }
};

export default apiOnlyWithAdminUsers(handler);
