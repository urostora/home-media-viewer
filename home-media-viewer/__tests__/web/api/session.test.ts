import fetch from 'node-fetch';
import { getApiUrl } from './helpers/helper';

const login = async (email: string, password: string, cookie?: string) => {
  return fetch(getApiUrl('login'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ email, password }),
  });
};
const adminLogin = async () => login(process.env.ADMIN_EMAIL ?? '', process.env.ADMIN_PASSWORD ?? '');
const cookieFrom = (response: Awaited<ReturnType<typeof login>>): string => {
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('Login did not return a session cookie');
  return cookie;
};

describe('session lifecycle and authorization', () => {
  it('accepts a saved session, rejects a tampered cookie and clears it on logout', async () => {
    const response = await adminLogin();
    expect(response.status).toBe(200);
    const cookie = cookieFrom(response);
    expect((await fetch(getApiUrl('me'), { headers: { cookie } })).status).toBe(200);
    expect((await fetch(getApiUrl('me'), { headers: { cookie: cookie.slice(0, -8) + 'tampered' } })).status).toBe(403);
    const logout = await fetch(getApiUrl('logout'), { headers: { cookie } });
    expect(logout.status).toBe(200);
    expect(logout.headers.get('set-cookie')).toMatch(/Max-Age=0/i);
    expect((await fetch(getApiUrl('me'))).status).toBe(403);
  });

  it('clears an existing cookie after an incorrect password', async () => {
    const cookie = cookieFrom(await adminLogin());
    const response = await login(process.env.ADMIN_EMAIL ?? '', 'incorrect-password', cookie);
    expect(response.status).toBe(400);
    expect(response.headers.get('set-cookie')).toMatch(/Max-Age=0/i);
  });

  it('retains API-side administrator checks for an authenticated guest', async () => {
    const cookie = cookieFrom(await login('guest@guest.com', 'Guest+P4ssw0rd+Test'));
    expect((await fetch(getApiUrl('me'), { headers: { cookie } })).status).toBe(200);
    expect((await fetch(getApiUrl('user'), { headers: { cookie } })).status).toBe(403);
  });
});
