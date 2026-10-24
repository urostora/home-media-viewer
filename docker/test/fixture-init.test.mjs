import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (await readFile(new URL('../../scripts/test/initTestData.mjs', import.meta.url), 'utf8')).replace(
  "import { setTimeout } from 'node:timers/promises';",
  '',
);
const execute = new (Object.getPrototypeOf(async function () {}).constructor)('fetch', 'process', 'setTimeout', source);
const env = {
  APP_URL: 'http://app:3000',
  BACKGROUND_URL: 'http://background:3000',
  ADMIN_EMAIL: 'test@example.invalid',
  ADMIN_PASSWORD: 'private',
  PROCESS_TOKEN: 'token',
};

for (const failure of ['http', 'api', 'cookie']) {
  test(`fixture setup stops after ${failure} login failure`, async () => {
    const paths = [];
    const fetch = async (url) => {
      paths.push(url.pathname);
      return {
        ok: failure !== 'http' || url.pathname === '/',
        status: 403,
        json: async () => ({ ok: failure !== 'api' }),
        headers: { getSetCookie: () => (failure === 'cookie' ? [] : ['session=test; HttpOnly']) },
      };
    };
    await assert.rejects(execute(fetch, { env }, async () => {}));
    assert.deepEqual(paths, ['/', '/', '/api/login']);
  });
}
test('fixture readiness times out before mutations', async () => {
  let calls = 0;
  await assert.rejects(
    execute(
      async () => {
        calls++;
        throw new Error('not ready');
      },
      { env },
      async () => {},
    ),
    /readiness/,
  );
  assert.equal(calls, 60);
});
