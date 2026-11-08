import fetch from 'node-fetch';
import { fetchDataFromApi, getApiUrl } from './helpers/helper';
import type { GeneralResponseWithData } from '@/types/api/generalTypes';
import type { LoginResponseDataType } from '@/types/loginTypes';
import { SESSION_IDLE_SECONDS } from '@/utils/auth/sessionPolicy';

// Exercise the real session wrapper and request boundary.
describe('web/api/me', () => {
    it('rejects a request without a session', async () => {
        const response = await fetch(getApiUrl('me'));
        expect(response.status).toBe(403);
    });

    it('returns the authenticated user and a finite expiry in the documented units', async () => {
        const before = Date.now();
        const response = await fetchDataFromApi<GeneralResponseWithData<LoginResponseDataType>>('me');
        const durationSeconds = SESSION_IDLE_SECONDS;
        expect(response.ok).toBe(true);
        expect(response.data?.email).toBe(process.env.ADMIN_EMAIL);
        expect(response.data?.sessionExpiresInSeconds).toBeGreaterThan(durationSeconds - 60);
        expect(response.data?.sessionExpiresInSeconds).toBeLessThanOrEqual(durationSeconds);
        expect(response.data?.sessionExpiresOn).toBeGreaterThanOrEqual(before + durationSeconds * 1000);
        expect(response.data?.sessionExpiresOn).toBeLessThanOrEqual(Date.now() + durationSeconds * 1000);
    });
});
