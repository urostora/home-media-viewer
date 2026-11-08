// Run against a disposable migrated DB; --seed-legacy/--check-legacy also run
// through the old release to exercise existing data and image rollback safety.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
const appRoot = process.env.HMV_APP_ROOT || '/home/node/app';
const app = createRequire(path.join(appRoot, 'package.json'));
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.hostname, 'db');
assert(['/benchmark', '/fresh_prisma', '/legacy_prisma'].includes(url.pathname), 'Refusing non-task database');
app('ts-node').register({ transpileOnly: true, project: path.join(appRoot, 'tsconfig.json') });
app('tsconfig-paths').register({ baseUrl: appRoot, paths: { '@/*': ['src/*'] } });
const legacy = app('@prisma/client/package.json').version.startsWith('5.');
const hooks = !legacy ? require('./prisma-hooks.cjs')(app) : undefined;
const { PrismaClient } = app('@prisma/client');
const prisma = legacy ? new PrismaClient() : app('./src/utils/prisma/clientFactory').createPrismaClient();
const id = 'prisma-upgrade-sentinel';
const mode = process.argv[2];
const fixture = { id, email: 'prisma-upgrade@example.invalid', name: 'preserve old data', password: 'synthetic-hash' };
async function main() {
  if (mode === '--seed-legacy') {
    assert(legacy);
    await prisma.user.create({ data: fixture });
    await prisma.album.create({ data: { id, name: 'legacy relation', sourceType: 'File', connectionString: '', basePath: '/synthetic', users: { connect: { id } } } });
    return;
  }
  if (mode === '--check-legacy' || url.pathname === '/legacy_prisma') {
    const row = await prisma.user.findUniqueOrThrow({ where: { id }, include: { albums: true } });
    for (const [key, value] of Object.entries(fixture)) assert.equal(row[key], value);
    assert.equal(row.albums[0].id, id);
    if (mode === '--check-legacy') return;
  }
  // Create an instrumented client before loading the real application helpers.
  const observed = app('./src/utils/prisma/prismaImporter').default;
  const { getUserData } = app('./src/utils/userHelper');
  let failOperation, attempts = 0;
  hooks.use((params, next) => {
    if (params.action === failOperation) {
      attempts++;
      throw Object.assign(new Error('synthetic connection loss'), { code: 'P1001' });
    }
    return next(params);
  });
  const target = await observed.file.create({ data: { name: 'adapter-types', path: 'synthetic.jpg', extension: 'jpg', size: 42, contentDate: new Date('2001-02-03T04:05:06Z') } });
  const other = await observed.file.create({ data: { name: 'deadlock-peer', path: 'synthetic2.jpg', extension: 'jpg' } });
  try {
    const row = await observed.file.findUniqueOrThrow({ where: { id: target.id } });
    assert.equal(row.size, 42); assert.equal(row.isDirectory, false);
    assert.equal(row.contentDate.toISOString(), '2001-02-03T04:05:06.000Z');
    assert.equal(row.metadataProcessedAt, null);
    const raw = await observed.$queryRaw`SELECT id, size, isDirectory, contentDate FROM File WHERE id = ${target.id}`;
    assert.equal(raw[0].id, target.id); assert.equal(Number(raw[0].size), 42);
    assert(raw[0].contentDate instanceof Date);
    await assert.rejects(observed.file.create({ data: { id: target.id, name: 'duplicate', path: 'x', extension: 'jpg' } }), { code: 'P2002' });
    await assert.rejects(observed.file.findUniqueOrThrow({ where: { id: 'missing-prisma-upgrade' } }), { code: 'P2025' });
    failOperation = 'findFirst'; attempts = 0;
    // The existing helper is an actual standalone read call site.
    await assert.rejects(getUserData('missing-prisma-upgrade')); assert.equal(attempts, 3);
    attempts = 0;
    await assert.rejects(observed.$transaction(tx => tx.user.findFirst())); assert.equal(attempts, 1);
    attempts = 0;
    await assert.rejects(observed.$transaction([observed.user.findFirst()])); assert.equal(attempts, 1);
    failOperation = 'update'; attempts = 0;
    await assert.rejects(observed.file.update({ where: { id: target.id }, data: { size: 7 } })); assert.equal(attempts, 1);
    failOperation = undefined;
    await assert.rejects(observed.$transaction(async tx => {
      await tx.file.update({ where: { id: target.id }, data: { size: 7 } });
      throw new Error('rollback fixture');
    }));
    assert.equal((await observed.file.findUniqueOrThrow({ where: { id: target.id } })).size, 42);
    let firstReady, secondReady;
    const first = new Promise(resolve => { firstReady = resolve; });
    const second = new Promise(resolve => { secondReady = resolve; });
    const contention = await Promise.allSettled([
      observed.$transaction(async tx => {
        await tx.file.update({ where: { id: target.id }, data: { size: 1 } }); firstReady(); await second;
        await tx.file.update({ where: { id: other.id }, data: { size: 1 } });
      }),
      observed.$transaction(async tx => {
        await tx.file.update({ where: { id: other.id }, data: { size: 2 } }); secondReady(); await first;
        await tx.file.update({ where: { id: target.id }, data: { size: 2 } });
      }),
    ]);
    assert.equal(contention.filter(x => x.status === 'rejected').length, 1);
    const rows = await observed.file.findMany({ where: { id: { in: [target.id, other.id] } } });
    assert.equal(rows[0].size, rows[1].size, 'Deadlock victim must not partially commit');
    const { PrismaMariaDb } = app('@prisma/adapter-mariadb');
    const options = app('./src/utils/prisma/clientFactory').connectionOptions();
    const limited = new PrismaClient({ adapter: new PrismaMariaDb({
      ...options, connectionLimit: 1, connectTimeout: 250, acquireTimeout: 500,
    }) });
    try {
      let entered, rejected, release;
      const ready = new Promise((resolve, reject) => { entered = resolve; rejected = reject; });
      const gate = new Promise(resolve => { release = resolve; });
      const held = limited.$transaction(async tx => {
        await tx.$queryRaw`SELECT 1`;
        entered();
        await gate;
      });
      held.catch(rejected);
      try {
        await ready;
        await assert.rejects(limited.file.count(), error =>
          error.code === 'P2039' && error.meta?.driverAdapterError?.cause?.originalCode === '45028');
      } finally {
        release();
        await held;
      }
      assert((await limited.file.count()) >= 0, 'Pool must recover after acquisition timeout');
    } finally { await limited.$disconnect(); }
    console.log('Prisma upgrade: data types, raw SQL, errors, bounded read retries, no write/transaction retries, rollback, deadlock and pool exhaustion/recovery passed');
  } finally {
    failOperation = undefined;
    await observed.file.deleteMany({ where: { id: { in: [target.id, other.id] } } });
    await observed.$disconnect();
  }
}
main().then(() => console.log(legacy ? 'Legacy client fixture compatibility passed' : 'Adapter compatibility passed'))
  .catch(error => { console.error("Prisma upgrade check failed:", error.code ?? error.name); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
