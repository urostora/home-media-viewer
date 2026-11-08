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
    const done = new Promise((resolve) => {
        complete = resolve;
    });
    const prisma = {
        user: {
            findFirst: async (args) => {
                calls.push(['find', args]);
                return existing;
            },
            upsert: async (args) => {
                calls.push(['upsert', args]);
            },
        },
        $disconnect: async () => {
            setImmediate(complete);
        },
    };
    load('prisma/seed.ts', {
        require: (name) =>
            name.includes('clientFactory')
                ? { createPrismaClient: () => prisma }
                : name.includes('apiLogger')
                  ? { logApiFailure: (_task, _status, error) => errors.push(error.message) }
                  : {
                        getHashedPassword: async (password) => {
                            calls.push(['hash', password]);
                            return 'hashed';
                        },
                    },
        process: {
            env,
            exit: (code) => {
                exitCode = code;
            },
        },
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
    assert.deepEqual(
        result.calls.map(([action]) => action),
        ['find'],
    );
});

test('bootstrap refuses to promote or reactivate an existing account', async () => {
    for (const user of [
        { isAdmin: false, status: 'Active' },
        { isAdmin: true, status: 'Disabled' },
    ]) {
        const result = await seed(credentials, user);
        assert.equal(result.exitCode, 1);
        assert.deepEqual(
            result.calls.map(([action]) => action),
            ['find'],
        );
    }
});

const { retryRead } = load('src/utils/prisma/retryRead.ts', {
    setTimeout: (resolve) => {
        resolve();
    },
});

test('a transient connection failure recovers on a bounded read retry', async () => {
    let attempts = 0;
    const result = await retryRead(async () => {
        if (++attempts < 3) throw { code: 'P1001' };
        return 'recovered';
    });
    assert.equal(result, 'recovered');
    assert.equal(attempts, 3);
});

test('initialization errors also receive bounded retries', async () => {
    let attempts = 0;
    await assert.rejects(() =>
        retryRead(async () => {
            attempts++;
            throw Object.assign(new Error('unavailable'), { errorCode: 'P1001' });
        }),
    );
    assert.equal(attempts, 3);
});

test('persistent failure stops after three attempts', async () => {
    let attempts = 0;
    await assert.rejects(() =>
        retryRead(async () => {
            attempts++;
            throw new Error('unavailable', { cause: null });
        }),
    );
    assert.equal(attempts, 1);
    attempts = 0;
    await assert.rejects(() =>
        retryRead(async () => {
            attempts++;
            throw Object.assign(new Error('unavailable'), { code: 'P1017' });
        }),
    );
    assert.equal(attempts, 3);
});

test('non-connection errors are never replayed', async () => {
    for (const code of ['P2002', 'P2025', 'P2010', 'ER_LOCK_DEADLOCK']) {
        let attempts = 0;
        await assert.rejects(() =>
            retryRead(async () => {
                attempts++;
                throw Object.assign(new Error('failed'), { code });
            }),
        );
        assert.equal(attempts, 1);
    }
});

test('Prisma 7 adapter connection failures retry without replaying other driver errors', async () => {
    for (const [originalCode, expected] of [
        ['45009', 3],
        ['45012', 3],
        ['45013', 3],
        ['45019', 3],
        ['45026', 3],
        ['45028', 3],
        ['1064', 1],
        ['1045', 1],
        ['1213', 1],
        ['45027', 1],
    ]) {
        let attempts = 0;
        await assert.rejects(
            retryRead(async () => {
                attempts++;
                throw { code: 'P2039', meta: { driverAdapterError: { cause: { kind: 'mysql', originalCode } } } };
            }),
        );
        assert.equal(attempts, expected);
    }
});

const { connectionOptions } = load('src/utils/prisma/clientFactory.ts', { require, process, URL });
test('adapter preserves the bounded pool policy and decodes URL credentials', () => {
    const options = connectionOptions({
        DATABASE_URL: 'mysql://user%40example:p%3Ass%2Fword@db:3307/media%20db?connection_limit=99&socket_timeout=99',
        DB_CONNECTION_LIMIT: '3',
    });
    assert.equal(options.user, 'user@example');
    assert.equal(options.password, 'p:ss/word');
    assert.equal(options.database, 'media db');
    assert.equal(options.port, 3307);
    assert.equal(options.connectionLimit, 3);
    assert.equal(options.acquireTimeout, 5000);
    assert.equal(options.connectTimeout, 5000);
    assert.equal(options.socketTimeout, 10000);
    assert.equal(options.queryTimeout, 10000);
    assert.equal(options.idleTimeout, 300);
});

test('invalid configuration fails without exposing connection strings or private TLS paths', () => {
    for (const env of [
        {},
        { DATABASE_URL: 'postgres://private:secret@db/media' },
        { DATABASE_URL: 'mysql://private:secret@db/media?unknown=secret' },
        { DATABASE_URL: 'mysql://private:secret@db/media?sslaccept=wrong' },
        { DATABASE_URL: 'mysql://private:secret@db/media?sslcert=/private/secret.pem' },
        { DATABASE_URL: 'mysql://private:secret@db/media?sslaccept=strict&sslaccept=accept_invalid_certs' },
        ...['0', '21', 'NaN', '1.5', ''].map((DB_CONNECTION_LIMIT) => ({
            DATABASE_URL: 'mysql://private:secret@db/media',
            DB_CONNECTION_LIMIT,
        })),
    ]) {
        assert.throws(
            () => connectionOptions(env),
            (error) => !/private|secret/.test(error.message),
        );
    }
    assert.equal(
        connectionOptions({ DATABASE_URL: 'mysql://user:password@db/media?sslaccept=strict' }).ssl.rejectUnauthorized,
        true,
    );
    assert.equal(
        connectionOptions({ DATABASE_URL: 'mysql://user:password@db/media?sslaccept=accept_invalid_certs' }).ssl
            .rejectUnauthorized,
        false,
    );
});

const { retryMetadataTransaction } = load('src/utils/processes/retryMetadataTransaction.ts', {
    require: () => ({ isShuttingDownHandler: { isShuttingDown: () => false } }),
    setTimeout: (resolve) => resolve(),
});
test('adapter deadlocks retry the complete transaction, bounded to four attempts', async () => {
    let attempts = 0;
    await assert.rejects(
        retryMetadataTransaction(async () => {
            attempts++;
            throw {
                code: 'P2010',
                meta: { driverAdapterError: { cause: { kind: 'TransactionWriteConflict', originalCode: '1213' } } },
            };
        }),
    );
    assert.equal(attempts, 4);
});

test('adapter lock waits, connection loss and unclassified write failures are never replayed', async () => {
    for (const [code, kind, originalCode] of [
        ['P2010', 'mysql', '1205'],
        ['P2039', 'mysql', '45028'],
        ['P2010', 'TransactionWriteConflict', '1045'],
        ['P2010', 'mysql', '1213'],
    ]) {
        let attempts = 0;
        await assert.rejects(
            retryMetadataTransaction(async () => {
                attempts++;
                throw { code, meta: { driverAdapterError: { cause: { kind, originalCode } } } };
            }),
        );
        assert.equal(attempts, 1);
    }
});
