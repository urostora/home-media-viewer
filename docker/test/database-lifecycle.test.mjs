// Run with the application dependencies installed; see README.md.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';

const appRoot = new URL('../../home-media-viewer/', import.meta.url);
const require = createRequire(new URL('package.json', appRoot));
const ts = require('typescript');

function load(relativePath, globals) {
  const source = ts.transpileModule(readFileSync(new URL(relativePath, appRoot), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, ...globals });
  return exports;
}

async function seed(env, existing = null) {
  const calls = [];
  const errors = [];
  let exitCode;
  let complete;
  const done = new Promise((resolve) => { complete = resolve; });
  const prisma = {
    user: {
      findFirst: async (args) => { calls.push(['find', args]); return existing; },
      upsert: async (args) => { calls.push(['upsert', args]); },
    },
    $disconnect: async () => { setImmediate(complete); },
  };
  load('prisma/seed.ts', {
    require: (name) => name === '@prisma/client'
      ? { PrismaClient: function () { return prisma; } }
      : { getHashedPassword: async (password) => { calls.push(['hash', password]); return 'hashed'; } },
    process: { env, exit: (code) => { exitCode = code; } },
    console: { error: (error) => errors.push(error.message) },
  });
  await done;
  return { calls, errors, exitCode };
}

const credentials = { ADMIN_EMAIL: 'owner@example.test', ADMIN_PASSWORD: 'Custom+Password42' };

test('bootstrap uses the configured email and hashes its password', async () => {
  const result = await seed(credentials);
  assert.equal(result.exitCode, undefined);
  const upsert = result.calls.find(([action]) => action === 'upsert')[1];
  assert.equal(upsert.where.email, credentials.ADMIN_EMAIL);
  assert.equal(upsert.create.email, credentials.ADMIN_EMAIL);
  assert.equal(upsert.create.password, 'hashed');
  assert.equal(upsert.create.isAdmin, true);
  assert.deepEqual(Object.keys(upsert.update), []);
});

test('bootstrap refuses missing or blank credentials before querying the database', async () => {
  for (const env of [{}, { ...credentials, ADMIN_EMAIL: ' ' }, { ...credentials, ADMIN_PASSWORD: '' }]) {
    const result = await seed(env);
    assert.equal(result.exitCode, 1);
    assert.equal(result.calls.length, 0);
    assert.match(result.errors[0], /requires ADMIN_EMAIL and ADMIN_PASSWORD/);
  }
});

test('rerunning bootstrap preserves an existing active administrator', async () => {
  const result = await seed(credentials, { isAdmin: true, status: 'Active' });
  assert.equal(result.exitCode, undefined);
  assert.deepEqual(result.calls.map(([action]) => action), ['find']);
});

test('bootstrap refuses to promote or reactivate an existing account', async () => {
  for (const user of [{ isAdmin: false, status: 'Active' }, { isAdmin: true, status: 'Disabled' }]) {
    const result = await seed(credentials, user);
    assert.equal(result.exitCode, 1);
    assert.deepEqual(result.calls.map(([action]) => action), ['find']);
  }
});

const { retryRead } = load('src/utils/prisma/retryRead.ts', {
  setTimeout: (resolve) => { resolve(); },
});

test('a transient connection failure recovers on a bounded read retry', async () => {
  let attempts = 0;
  const result = await retryRead({ action: 'findMany' }, async () => {
    if (++attempts < 3) throw { code: 'P1001' };
    return 'recovered';
  });
  assert.equal(result, 'recovered');
  assert.equal(attempts, 3);
});

test('initialization errors also receive bounded retries', async () => {
  let attempts = 0;
  await assert.rejects(() => retryRead({ action: 'findFirst' }, async () => {
    attempts++;
    throw Object.assign(new Error('unavailable'), { errorCode: 'P1001' });
  }));
  assert.equal(attempts, 3);
});

test('persistent failure stops after three attempts', async () => {
  let attempts = 0;
  await assert.rejects(() => retryRead({ action: 'count' }, async () => {
    attempts++;
    throw new Error('unavailable', { cause: null });
  }));
  assert.equal(attempts, 1);
  attempts = 0;
  await assert.rejects(() => retryRead({ action: 'count' }, async () => {
    attempts++;
    throw Object.assign(new Error('unavailable'), { code: 'P1017' });
  }));
  assert.equal(attempts, 3);
});

test('writes, transactions and non-connection errors are never replayed', async () => {
  for (const [params, code] of [
    [{ action: 'create' }, 'P1001'],
    [{ action: 'findMany', runInTransaction: true }, 'P1001'],
    [{ action: 'findMany' }, 'P2002'],
    [{ action: 'queryRaw' }, 'P1001'],
  ]) {
    let attempts = 0;
    await assert.rejects(() => retryRead(params, async () => {
      attempts++;
      throw Object.assign(new Error('failed'), { code });
    }));
    assert.equal(attempts, 1);
  }
});
