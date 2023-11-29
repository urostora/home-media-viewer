import { GeneralResponseWithData } from '@/types/api/generalTypes';
import { fetchDataFromApi } from './helpers/helper';
import { UserDataType } from '@/types/api/userTypes';
import { checkUserData, getTestUserData } from './helpers/user.helper';

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

    await checkUserData(createdId as string, { email, name, isAdmin });
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

    await checkUserData(createdId as string, { email, name, isAdmin });
  });
});
