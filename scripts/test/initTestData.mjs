// Disposable fixture setup: fail on the first transport, HTTP or API error.
import { setTimeout } from 'node:timers/promises';

const app = process.env.APP_URL;
const background = process.env.BACKGROUND_URL;
if (!app || !background || !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD || !process.env.PROCESS_TOKEN) {
  throw new Error('Fixture configuration is incomplete');
}
let cookie = '';
async function request(base, path, method = 'GET', data) {
  const response = await fetch(new URL(path, base), {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookie, Authorization: `Bearer ${process.env.PROCESS_TOKEN}` },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(300_000),
  });
  if (!response.ok) throw new Error(`Fixture request failed (${response.status})`);
  const result = await response.json();
  if (result.ok !== true || result.error) throw new Error('Fixture API reported an error');
  return response;
}
// Readiness is bounded; fixture mutations below are never retried.
for (const base of [app, background]) {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(new URL('/', base), { signal: AbortSignal.timeout(2000) });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    await setTimeout(1000);
  }
  if (!ready) throw new Error('Fixture service readiness timed out');
}
const login = await request(app, '/api/login', 'POST', {
  email: process.env.ADMIN_EMAIL,
  password: process.env.ADMIN_PASSWORD,
});
cookie = login.headers
  .getSetCookie()
  .map((value) => value.split(';', 1)[0])
  .join('; ');
if (!cookie) throw new Error('Fixture login did not establish a session');
for (const path of ['album01', 'album02']) {
  await request(app, '/api/album', 'PUT', { path });
}
await request(app, '/api/user', 'PUT', {
  name: 'guest',
  email: 'guest@guest.com',
  password: 'Guest+P4ssw0rd+Test',
});
for (let index = 0; index < 3; index++) {
  await request(background, '/api/process/updateMetadata');
}
console.log('Fixture initialization passed');
