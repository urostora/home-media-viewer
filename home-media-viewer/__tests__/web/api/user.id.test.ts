import { fetchDataFromApi } from './helpers/helper';
import { checkUserData, getTestUserData } from './helpers/user.helper';

import type { UserDataType, UserEditType } from '@/types/api/userTypes';
import type { GeneralResponse, GeneralResponseWithData } from '@/types/api/generalTypes';

describe('web/api/user', () => {
  const getPath = (id: string): string => `user/${id}`;

  const userIdsAdded: string[] = [];
  let userDataToModify: UserDataType | undefined;
  let userDataToDelete: UserDataType | undefined;

  beforeAll(async () => {
    // create modify test user
    const userToModifyData = getTestUserData('userToModify');
    const userToModifyCreateResult = await fetchDataFromApi<GeneralResponseWithData<UserDataType>>(
      'user',
      userToModifyData,
      'POST',
    );

    if (typeof userToModifyCreateResult?.data?.id !== 'string') {
      throw Error('Could not create modify test user');
    }

    userIdsAdded.push(userToModifyCreateResult.data.id);
    userDataToModify = userToModifyCreateResult.data;

    // create delete test user
    const userToDeleteData = getTestUserData('userToDelete');
    const userToDeleteCreateResult = await fetchDataFromApi<GeneralResponseWithData<UserDataType>>(
      'user',
      userToDeleteData,
      'POST',
    );

    if (typeof userToDeleteCreateResult?.data?.id !== 'string') {
      throw Error('Could not create modify test user');
    }

    userIdsAdded.push(userToDeleteCreateResult.data.id);
    userDataToDelete = userToDeleteCreateResult.data;
  });

  afterAll(async () => {
    // delete created users
    for (const userId of userIdsAdded) {
      try {
        await fetchDataFromApi<GeneralResponseWithData<UserDataType>>(getPath(userId), undefined, 'DELETE');
      } catch {
        // eslint-disable-next-line no-empty
      }
    }
  });

  it('modify data', async () => {
    if (userDataToModify === undefined) {
      throw Error('Test user not found');
    }

    const modifiedValues: UserEditType = {
      email: userDataToModify.email + '_mod',
      name: userDataToModify.name + '_mod',
      isAdmin: !userDataToModify.isAdmin,
      status: 'Disabled',
    };

    const result = await fetchDataFromApi<GeneralResponseWithData<UserDataType>>(
      getPath(userDataToModify.id),
      modifiedValues,
      'PATCH',
    );

    expect(result?.ok).toBe(true);
    expect(typeof result?.data).toBe('object');
    expect(typeof result?.data?.id).toBe('string');

    await checkUserData(userDataToModify.id, modifiedValues);
  });

  it('delete user', async () => {
    if (userDataToDelete === undefined) {
      throw Error('Test user not found');
    }

    const result = await fetchDataFromApi<GeneralResponse>(getPath(userDataToDelete.id), undefined, 'DELETE');

    expect(result?.ok).toBe(true);
    expect(result?.id).toBe(userDataToDelete.id);

    await checkUserData(userDataToDelete.id, { status: 'Deleted' });
  });
});
