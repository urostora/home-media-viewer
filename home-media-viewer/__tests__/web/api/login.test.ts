import { fetchDataFromApi, fetchResultFromApi } from './helpers/helper';

import type { GeneralResponseWithData } from '@/types/api/generalTypes';
import type { LoginResponseDataType } from '@/types/loginTypes';
import { SESSION_IDLE_SECONDS } from '@/utils/auth/sessionPolicy';

describe('web/api/login', () => {
    const path = 'login';

    it('not existing user', async () => {
        const email = 'NonexistingUser';
        const password = 'Password4NonexistingUser';

        const result = await fetchResultFromApi(path, { email, password }, 'POST');

        expect(result.status).toBe(400);
    });

    it('existing user', async () => {
        const before = Date.now();
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
        expect(response.data?.sessionExpiresInSeconds).toBeGreaterThan(SESSION_IDLE_SECONDS - 60);
        expect(response.data?.sessionExpiresInSeconds).toBeLessThanOrEqual(SESSION_IDLE_SECONDS);
        expect(response.data?.sessionExpiresOn).toBeGreaterThanOrEqual(before + SESSION_IDLE_SECONDS * 1000);
        expect(response.data?.sessionExpiresOn).toBeLessThanOrEqual(Date.now() + SESSION_IDLE_SECONDS * 1000);
    });
});
