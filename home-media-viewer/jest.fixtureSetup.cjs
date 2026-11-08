const { beforeAll, expect } = require('@jest/globals');
const { spawnSync } = require('node:child_process');

beforeAll(() => {
    if (process.env.HMV_RESET_TEST_LOGIN_BUDGETS !== 'true' || !expect.getState().testPath.includes('/__tests__/web/'))
        return;

    // The disposable build workflow opts in explicitly. Run outside jsdom so
    // Prisma uses its Node entrypoint, and never expose driver diagnostics/secrets.
    const result = spawnSync(
        process.execPath,
        [
            '-r',
            'ts-node/register/transpile-only',
            '-e',
            `
    const assert = require('node:assert/strict');
    const url = new URL(process.env.DATABASE_URL);
    assert.equal(url.hostname, 'db');
    assert(process.env.HMV_TEST_DATABASE);
    assert.equal(decodeURIComponent(url.pathname.slice(1)), process.env.HMV_TEST_DATABASE);
    const prisma = require('./src/utils/prisma/clientFactory').createPrismaClient();
    (async () => {
      assert.equal(await prisma.loginPermit.count({ where: { owner: { not: null } } }), 0);
      await prisma.loginBudget.deleteMany({ where: { key: { not: 'global' } } });
      await prisma.loginBudget.update({ where: { key: 'global' }, data: { used: 0, resetAt: new Date(0) } });
    })().catch(() => { process.exitCode = 1; }).finally(() => prisma.$disconnect());
  `,
        ],
        { cwd: __dirname, env: process.env, stdio: 'pipe', timeout: 30_000 },
    );
    if (result.status !== 0) throw new Error('Disposable test login-budget isolation failed');
}, 35_000);
