import { fetchDataFromApi } from './helpers/helper';
import { checkUserData, getTestUserData } from './helpers/user.helper';

import type { GeneralResponseWithData } from '@/types/api/generalTypes';
import type { UserDataType } from '@/types/api/userTypes';

describe('web/api/user', () => {
  const path = 'user';

  const userIdsAdded: string[] = [];

  afterAll(async () => {
    // delete created users
    for (const userId of userIdsAdded) {
      try {
        await fetchDataFromApi<GeneralResponseWithData<UserDataType>>(`${path}/${userId}`, undefined, 'DELETE');
      } catch {
        // eslint-disable-next-line no-empty
      }
    }
  });

  it('create guest user', async () => {
    const { email, name, password, isAdmin } = getTestUserData('guest');

    const result = await fetchDataFromApi<GeneralResponseWithData<UserDataType>>(
      path,
      { email, password, name, isAdmin },
      'POST',
    );

    expect(result?.ok).toBe(true);
    expect(typeof result?.data).toBe('object');
    expect(typeof result?.data?.id).toBe('string');

    const createdId = result?.data?.id;

    expect(typeof createdId === 'string').toBe('string');
    if (typeof createdId !== 'string') {
      return;
    }

    await checkUserData(createdId, { email, name, isAdmin });
  });

  it('create admin user', async () => {
    const { email, name, password, isAdmin } = getTestUserData('admin', true);

    const result = await fetchDataFromApi<GeneralResponseWithData<UserDataType>>(
      path,
      { email, password, name, isAdmin },
      'POST',
    );

    expect(result?.ok).toBe(true);
    expect(typeof result?.data).toBe('object');
    expect(typeof result?.data?.id).toBe('string');

    const createdId = result?.data?.id;

    expect(typeof createdId === 'string').toBe('string');
    if (typeof createdId !== 'string') {
      return;
    }

    await checkUserData(createdId, { email, name, isAdmin });
  });
});
