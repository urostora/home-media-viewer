// Run after migration on a fresh isolated hmv_auth_t7_fixture database.
// Three actual Node processes share the limiter DB and encrypted-session key.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { fork } = require('node:child_process');
const { createServer } = require('node:http');
const { randomBytes } = require('node:crypto');
const path = require('node:path');
const app = path.resolve(process.env.HMV_APP_ROOT ?? 'home-media-viewer');
const reqApp = createRequire(path.join(app, 'package.json'));
const url = new URL(process.env.DATABASE_URL ?? '');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.pathname, '/hmv_auth_t7_fixture', 'Refusing non-task DB');
reqApp('ts-node').register({ project: path.join(app, 'tsconfig.json'), transpileOnly: true });
reqApp('tsconfig-paths').register({ baseUrl: app, paths: { '@/*': ['src/*'] } });

async function worker() {
    const queryHooks = require('./prisma-hooks.cjs')(reqApp);
    const prisma = reqApp('./src/utils/prisma/prismaImporter.ts').default;
    const proof = reqApp('./src/utils/auth/loginProof.ts');
    const actual = proof.verifyLoginPassword;
    let release,
        blocked,
        failStorage = false,
        proofCalls = 0;
    proof.verifyLoginPassword = async (...args) => {
        proofCalls++;
        process.send?.({ event: 'proof-start' });
        try {
            if (blocked) await blocked;
            return await actual(...args);
        } finally {
            process.send?.({ event: 'proof-end' });
        }
    };
    queryHooks.use((params, next) => {
        if (
            (failStorage === true && params.action === 'queryRaw') ||
            (failStorage === 'write' &&
                params.model === 'LoginBudget' &&
                params.action === 'upsert' &&
                params.args.where.key !== 'global')
        )
            throw new Error('Synthetic limiter storage outage');
        return next(params);
    });
    const login = reqApp('./src/pages/api/login.ts');
    const { apiResolver } = reqApp('next/dist/server/api-utils/node/api-resolver');
    const server = createServer(async (req, res) => {
        await apiResolver(
            req,
            res,
            {},
            login,
            { previewModeId: '', previewModeSigningKey: '', previewModeEncryptionKey: '' },
            false,
        );
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    process.on('message', async (message) => {
        try {
            if (message.command === 'hold')
                blocked = new Promise((resolve) => {
                    release = resolve;
                });
            if (message.command === 'release') {
                const done = release;
                blocked = undefined;
                release = undefined;
                done?.();
            }
            if (message.command === 'mode') {
                process.env.LOGIN_TRUST_FORWARDED_HEADERS = message.value === 'proxy' ? 'true' : 'false';
                process.env.LOGIN_TRUSTED_PROXY_CIDRS = '127.0.0.1/32';
            }
            if (message.command === 'outage') failStorage = message.value;
            if (message.command === 'shutdown') {
                await new Promise((resolve) => server.close(resolve));
                await prisma.$disconnect();
                process.send?.({ id: message.id });
                process.disconnect();
                return;
            }
            process.send?.({ id: message.id, proofCalls });
        } catch {
            process.send?.({ id: message.id, error: true });
        }
    });
    process.send?.({ ready: true, port: server.address().port });
}

async function main() {
    process.env.APP_SESSION_SECRET = randomBytes(32).toString('hex');
    process.env.SESSION_COOKIE_SECURE = 'false';
    process.env.LOGIN_TRUST_FORWARDED_HEADERS = 'false';
    const prisma = reqApp('./src/utils/prisma/prismaImporter.ts').default;
    const workers = [];
    let checks = 0,
        stage = 'setup',
        sequence = 0,
        active = 0,
        maximum = 0;
    const check = (actual, expected, label) => {
        assert.equal(actual, expected, label);
        checks++;
    };
    const observations = { missing: [], inactive: [], wrongPassword: [] };
    const spawn = async () => {
        const child = fork(__filename, [], {
            env: { ...process.env, HMV_LOGIN_ABUSE_WORKER: '1' },
            stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        });
        const pending = new Map(),
            waiters = [];
        const connection = { child, pending, waiters, port: null, starts: 0 };
        const ready = new Promise((resolve, reject) => {
            child.once('error', reject);
            child.once('exit', (code) => {
                if (connection.port === null) reject(new Error('Worker startup'));
            });
            child.on('message', (message) => {
                if (message.ready) {
                    connection.port = message.port;
                    resolve();
                } else if (message.event === 'proof-start') {
                    active++;
                    maximum = Math.max(maximum, active);
                    connection.starts++;
                    for (const notify of [...waiters]) notify();
                } else if (message.event === 'proof-end') active--;
                else if (message.id) {
                    const callback = pending.get(message.id);
                    pending.delete(message.id);
                    callback?.(message);
                }
            });
        });
        workers.push(connection);
        await ready;
        return connection;
    };
    const rpc = (connection, command, value) =>
        new Promise((resolve, reject) => {
            const id = ++sequence;
            connection.pending.set(id, (message) =>
                message.error ? reject(new Error('Worker RPC')) : resolve(message),
            );
            connection.child.send({ id, command, value });
        });
    const waitStarts = (connection, target) =>
        new Promise((resolve) => {
            const check = () => {
                if (connection.starts >= target) {
                    connection.waiters.splice(connection.waiters.indexOf(check), 1);
                    resolve();
                }
            };
            connection.waiters.push(check);
            check();
        });
    const post = async (connection, email, password = 'wrong', client, headers = {}) => {
        const started = performance.now();
        const response = await fetch(`http://127.0.0.1:${connection.port}/api/login`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                ...(client ? { 'x-forwarded-for': client } : {}),
                ...headers,
            },
            body: JSON.stringify({ email, password }),
            signal: AbortSignal.timeout(30000),
        });
        const text = await response.text();
        return {
            status: response.status,
            text,
            retry: response.headers.get('retry-after'),
            cookie: response.headers.get('set-cookie'),
            duration: performance.now() - started,
        };
    };
    const reset = async () => {
        check(
            await prisma.loginPermit.count({ where: { owner: { not: null } } }),
            0,
            'no leaked live permit between cases',
        );
        await prisma.loginBudget.deleteMany({ where: { key: { not: 'global' } } });
        await prisma.loginBudget.update({ where: { key: 'global' }, data: { used: 0, resetAt: new Date(0) } });
    };
    try {
        check(await prisma.user.count(), 0, 'fresh task DB');
        check(await prisma.loginPermit.count(), 2, 'exactly two work slots seeded');
        const bcrypt = reqApp('bcrypt');
        const password = 'Synthetic-T7-P4ssword!';
        const hash = await bcrypt.hash(password, 10);
        const account = await prisma.user.create({
            data: { email: 'reader@example.invalid', name: 'T7 reader', password: hash },
        });
        await prisma.user.create({
            data: { email: 'inactive@example.invalid', name: 'T7 inactive', password: hash, status: 'Disabled' },
        });
        await prisma.user.create({
            data: { email: 'admin@example.invalid', name: 'T7 administrator', password: hash, isAdmin: true },
        });
        const [a, b, c] = await Promise.all([spawn(), spawn(), spawn()]);
        stage = 'account/collation';
        await reset();
        const aliases = [
            'reader@example.invalid',
            'READER@EXAMPLE.INVALID',
            'réader@example.invalid',
            'reader@example.invalid   ',
            'Reader@example.invalid',
        ];
        for (let index = 0; index < aliases.length; index++)
            check(
                (await post(index % 2 ? a : b, aliases[index])).status,
                400,
                'account alias admitted with generic credential error',
            );
        let blocked = await post(c, account.email);
        check(blocked.status, 429, 'account limit shared by DB-equivalent aliases and processes');
        check(Number(blocked.retry) >= 1 && Number(blocked.retry) <= 300, true, 'bounded retry header');
        const beforeRejected = await prisma.loginBudget.findMany({ orderBy: { key: 'asc' } });
        await post(c, account.email);
        const afterRejected = await prisma.loginBudget.findMany({ orderBy: { key: 'asc' } });
        // A rejection can consume IP/global admission, but never extends the existing
        // account window. All reset timestamps must remain fixed while windows live.
        check(
            afterRejected.every(
                (row) => row.resetAt.getTime() === beforeRejected.find((old) => old.key === row.key)?.resetAt.getTime(),
            ),
            true,
            'rejections never extend windows',
        );
        await prisma.loginBudget.updateMany({ where: { key: { not: 'global' } }, data: { resetAt: new Date(0) } });
        check((await post(a, account.email, password)).status, 200, 'account automatically recovers after window');
        stage = 'direct/header spoof';
        await reset();
        for (let index = 0; index < 10; index++)
            check(
                (await post(index % 2 ? a : b, `missing${index}@example.invalid`, 'wrong', `192.0.2.${index + 1}`))
                    .status,
                400,
                'direct-mode spoof does not alter admission',
            );
        check(
            (await post(c, 'another@example.invalid', 'wrong', '198.51.100.1')).status,
            429,
            'IP budget survives forged forwarding rotation',
        );
        stage = 'trusted proxy';
        await reset();
        await Promise.all(workers.map((worker) => rpc(worker, 'mode', 'proxy')));
        for (let index = 0; index < 10; index++)
            check(
                (await post(a, `proxy${index}@example.invalid`, 'wrong', `203.0.113.${index + 1}, 192.0.2.8`)).status,
                400,
                'trusted-side chain selects real client',
            );
        check(
            (await post(b, 'proxy-more@example.invalid', 'wrong', '203.0.113.200, 192.0.2.8')).status,
            429,
            'leftmost spoof cannot evade proxy budget',
        );
        check(
            (await post(c, 'proxy-other@example.invalid', 'wrong', '192.0.2.9')).status,
            400,
            'different trusted client has separate budget',
        );
        stage = 'global budget';
        await reset();
        for (let index = 0; index < 60; index++)
            check(
                (await post(index % 2 ? a : b, `global${index}@example.invalid`, 'wrong', `198.51.100.${index + 1}`))
                    .status,
                400,
                'global admitted work bounded',
            );
        check(
            (await post(c, 'global-over@example.invalid', 'wrong', '198.51.100.200')).status,
            429,
            'global cost budget across identities/replicas',
        );
        check(
            (await prisma.loginBudget.findUniqueOrThrow({ where: { key: 'global' } })).used,
            60,
            'global budget stops at exact bound',
        );
        stage = 'concurrency/load';
        await reset();
        await rpc(a, 'hold');
        const starts = a.starts;
        const first = post(a, 'held1@example.invalid', 'wrong', '192.0.2.1');
        const second = post(a, 'held2@example.invalid', 'wrong', '192.0.2.2');
        await waitStarts(a, starts + 2);
        check(await prisma.loginPermit.count({ where: { owner: { not: null } } }), 2, 'two reserved work permits');
        const load = await Promise.all(
            Array.from({ length: 16 }, (_, index) =>
                post(index % 2 ? b : c, `burst${index}@example.invalid`, 'wrong', `203.0.113.${index + 1}`),
            ),
        );
        check(
            load.every((result) => result.status === 429),
            true,
            'bounded synthetic burst never queues bcrypt',
        );
        check(
            (await post(a, 'local-burst@example.invalid', 'wrong', '192.0.2.3')).status,
            429,
            'local queue has zero capacity',
        );
        check(maximum <= 2, true, 'observed global proof concurrency never exceeds two');
        await rpc(a, 'release');
        check((await first).status, 400, 'released work completes');
        check((await second).status, 400, 'second work completes');
        await reset();
        stage = 'generic failure/work distributions';
        for (const [kind, email] of [
            ['missing', 'missing@example.invalid'],
            ['inactive', 'inactive@example.invalid'],
            ['wrongPassword', account.email],
        ]) {
            for (let index = 0; index < 4; index++) {
                const before = (await rpc(a, 'stats')).proofCalls;
                const result = await post(a, email, 'wrong', `192.0.2.${20 + index}`);
                check(result.status, 400, 'generic credential failure status');
                check(result.text, 'Error in login: Invalid email or password', 'identical credential message');
                check(
                    (await rpc(a, 'stats')).proofCalls - before,
                    1,
                    'one actual bcrypt comparison per admitted failure',
                );
                observations[kind].push(Math.round(result.duration));
            }
        }
        stage = 'request limits';
        const proofBeforeSize = (await rpc(a, 'stats')).proofCalls;
        const oversized = await post(a, account.email, 'x'.repeat(1048577), '192.0.2.1');
        check(oversized.status, 413, 'Pages parser enforces existing 1 MiB request bound');
        check((await rpc(a, 'stats')).proofCalls, proofBeforeSize, 'oversized request never reaches bcrypt');
        stage = 'storage outage';
        await reset();
        await rpc(a, 'outage', true);
        const unavailable = await post(a, account.email, password, '192.0.2.1');
        check(unavailable.status, 503, 'DB failure is retryable and closed');
        check(unavailable.cookie, null, 'DB failure creates no session');
        const beforeFailedReservation = (await prisma.loginBudget.findUniqueOrThrow({ where: { key: 'global' } })).used;
        await rpc(a, 'outage', 'write');
        const failedReservation = await post(a, 'rollback@example.invalid', 'wrong', '192.0.2.88');
        check(failedReservation.status, 503, 'reservation failure is closed');
        check(
            await prisma.loginPermit.count({ where: { owner: { not: null } } }),
            0,
            'failed reservation rolls back its work slot',
        );
        check(
            (await prisma.loginBudget.findUniqueOrThrow({ where: { key: 'global' } })).used,
            beforeFailedReservation,
            'failed reservation rolls back counters',
        );
        await rpc(a, 'outage', false);
        check((await post(a, account.email, password, '192.0.2.1')).status, 200, 'storage recovery');
        stage = 'crash recovery';
        await reset();
        await rpc(c, 'hold');
        const crashStart = c.starts;
        const interrupted = post(c, 'crash@example.invalid', 'wrong', '192.0.2.33').catch(() => undefined);
        await waitStarts(c, crashStart + 1);
        const held = await prisma.loginPermit.findFirstOrThrow({ where: { owner: { not: null } } });
        const exited = new Promise((resolve) => c.child.once('exit', resolve));
        c.child.kill('SIGKILL');
        await exited;
        await interrupted;
        active--; // The deliberately killed test worker cannot emit its final event.
        await prisma.loginPermit.update({ where: { slot: held.slot }, data: { acquiredAt: new Date(0) } });
        check(
            (await prisma.loginPermit.findUniqueOrThrow({ where: { slot: held.slot } })).owner,
            held.owner,
            'no timer silently reuses potentially live permit',
        );
        const recovery = await prisma.loginPermit.updateMany({
            where: { slot: held.slot, owner: held.owner },
            data: { owner: null, acquiredAt: null },
        });
        check(recovery.count, 1, 'operator-style exact-owner recovery after verified process death');
        check(
            (await post(b, account.email, password, '192.0.2.55')).status,
            200,
            'login works after verified crash recovery',
        );
        stage = 'long-password compatibility';
        const proof = reqApp('./src/utils/auth/loginProof.ts');
        for (const legacy of ['a'.repeat(72) + 'long-suffix'.repeat(1000), 'a'.repeat(71) + 'é'.repeat(1000)]) {
            const legacyHash = await bcrypt.hash(legacy, 10);
            check(
                await proof.verifyLoginPassword(legacy, legacyHash),
                true,
                'legacy long/multibyte bcrypt verification preserved',
            );
        }
        stage = 'permit ownership';
        const limiter = reqApp('./src/utils/auth/loginLimiter.ts');
        const oldAdmission = await limiter.admitLogin('192.0.2.100');
        check(oldAdmission.allowed, true, 'first ownership admission');
        await limiter.releaseLogin(oldAdmission.permit);
        const newAdmission = await limiter.admitLogin('192.0.2.100');
        check(newAdmission.allowed, true, 'reused slot admission');
        check(newAdmission.permit.owner !== oldAdmission.permit.owner, true, 'claims are unique even within a process');
        await assert.rejects(limiter.releaseLogin(oldAdmission.permit));
        checks++;
        check(
            (await prisma.loginPermit.findUniqueOrThrow({ where: { slot: newAdmission.permit.slot } })).owner,
            newAdmission.permit.owner,
            'stale release cannot clear current work',
        );
        await limiter.releaseLogin(newAdmission.permit);
        stage = 'cleanup';
        await prisma.loginBudget.createMany({
            data: Array.from({ length: 25 }, () => ({
                key: randomBytes(32).toString('hex'),
                used: 1,
                startedAt: new Date(0),
                resetAt: new Date(0),
            })),
        });
        const count = await prisma.loginBudget.count();
        await reqApp('./src/utils/auth/loginLimiter.ts').cleanupLoginBudgets();
        check(count - (await prisma.loginBudget.count()), 20, 'cleanup bounded to 20');
        check(await prisma.loginPermit.count({ where: { owner: { not: null } } }), 0, 'no leaked task work permits');
        const rows = await prisma.loginBudget.findMany();
        check(
            rows.every((row) => row.key === 'global' || /^[a-f0-9]{64}$/.test(row.key)),
            true,
            'keys contain no raw email/client identifiers',
        );
        console.log(
            JSON.stringify({
                result: 'passed',
                checks,
                processes: 3,
                burstRequests: 16,
                maxProofConcurrency: maximum,
                timingMilliseconds: observations,
            }),
        );
    } catch (error) {
        console.error(`T7 login-abuse integration failed at ${stage} after ${checks} checks (${error?.name}).`);
        process.exitCode = 1;
    } finally {
        for (const connection of workers) {
            if (connection.child.exitCode !== null || connection.child.signalCode !== null) continue;
            try {
                await rpc(connection, 'release');
                await rpc(connection, 'shutdown');
            } catch {
                connection.child.kill('SIGKILL');
            }
        }
        await prisma.$disconnect();
    }
}
(process.env.HMV_LOGIN_ABUSE_WORKER === '1' ? worker() : main()).catch(() => {
    console.error('T7 worker setup failed.');
    process.exitCode = 1;
});
