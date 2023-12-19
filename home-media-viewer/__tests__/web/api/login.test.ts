import { GeneralResponseWithData } from '@/types/api/generalTypes';
import { fetchDataFromApi, fetchResultFromApi } from './helpers/helper';
import { LoginResponseDataType } from '@/types/loginTypes';

describe('web/api/login', () => {
  const path = 'login';

  it('not existing user', async () => {
    const email = 'NonexistingUser';
    const password = 'Password4NonexistingUser';

    const result = await fetchResultFromApi(path, { email, password }, 'POST');

    expect(result.status).toBe(400);
  });

  it('existing user', async () => {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;

    const response = await fetchDataFromApi<GeneralResponseWithData<LoginResponseDataType>>(
      path,
      { email, password },
      'POST',
    );

    expect(response.ok).toBe(true);
    expect(response?.data?.email).toBe(email);
    expect(response?.data?.isAdmin).toBe(true);
  });
});
