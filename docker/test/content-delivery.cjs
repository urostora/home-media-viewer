// Run only via scripts/benchmark/delivery.py against a fresh, isolated database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const { createServer, get } = require('node:http');
const { fork, execFileSync } = require('node:child_process');
const { performance, monitorEventLoopDelay } = require('node:perf_hooks');
const app = process.env.HMV_APP_ROOT;
const reqApp = createRequire(path.join(app, 'package.json'));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const percentile = (values, quantile) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * quantile)];

// Client runs in a separate process so filesystem/server stalls remain visible in TTFB.
if (process.argv[2] === 'client') {
    process.once('message', async ({ base, cookies, sameAccountCookies, ids }) => {
        try {
            const scenarios = [];
            const matrix = [
                ['sequential-open', 1, 6, () => ({ id: ids.video, range: 'bytes=0-' })],
                [
                    'seek-bounded',
                    1,
                    12,
                    (i) => ({
                        id: ids.video,
                        range: `bytes=${i * 100000}-${i * 100000 + 99999}`,
                    }),
                ],
                ['images', 1, 6, () => ({ id: ids.image })],
                ['same-account', 8, 24, () => ({ id: ids.video, range: 'bytes=0-' })],
                ['distinct-accounts', 8, 24, () => ({ id: ids.video, range: 'bytes=0-', distinct: true })],
                ['download', 1, 3, () => ({ id: ids.video })],
                [
                    'same-account-separate-sessions',
                    8,
                    24,
                    () => ({ id: ids.video, range: 'bytes=0-', separateSessions: true }),
                ],
            ];
            for (const [name, concurrency, count, selection] of matrix) {
                const reset = await fetch(base + '/metrics/reset');
                await reset.arrayBuffer();
                const samples = [];
                const started = performance.now();
                let cursor = 0;
                await Promise.all(
                    Array.from({ length: concurrency }, async () => {
                        while (cursor < count) {
                            const i = cursor++;
                            const item = selection(i);
                            const before = performance.now();
                            try {
                                const response = await fetch(base + '/api/file/content/' + item.id, {
                                    headers: {
                                        cookie: item.separateSessions
                                            ? sameAccountCookies[i % sameAccountCookies.length]
                                            : cookies[item.distinct ? i % cookies.length : 0],
                                        ...(item.range ? { range: item.range } : {}),
                                    },
                                    signal: AbortSignal.timeout(10000),
                                });
                                const ttfb = performance.now() - before;
                                const bytes = (await response.arrayBuffer()).byteLength;
                                samples.push({
                                    status: response.status,
                                    bytes,
                                    ttfbMs: ttfb,
                                    totalMs: performance.now() - before,
                                    requestedRange: item.range ?? null,
                                    contentRange: response.headers.get('content-range'),
                                });
                            } catch (error) {
                                samples.push({
                                    status: 'transport-error',
                                    bytes: 0,
                                    ttfbMs: performance.now() - before,
                                    totalMs: performance.now() - before,
                                    requestedRange: item.range ?? null,
                                    errorCode: error.cause?.code ?? error.name,
                                });
                            }
                        }
                    }),
                );
                const elapsedMs = performance.now() - started;
                const metrics = await (await fetch(base + '/metrics')).json();
                scenarios.push({
                    name,
                    concurrency,
                    count,
                    elapsedMs,
                    bytes: samples.reduce((n, s) => n + s.bytes, 0),
                    throughputBytesSec: (samples.reduce((n, s) => n + s.bytes, 0) * 1000) / elapsedMs,
                    ttfbMs: {
                        p50: percentile(
                            samples.map((s) => s.ttfbMs),
                            0.5,
                        ),
                        p95: percentile(
                            samples.map((s) => s.ttfbMs),
                            0.95,
                        ),
                    },
                    totalMs: {
                        p50: percentile(
                            samples.map((s) => s.totalMs),
                            0.5,
                        ),
                        p95: percentile(
                            samples.map((s) => s.totalMs),
                            0.95,
                        ),
                    },
                    samples,
                    metrics,
                });
            }
            process.send({ scenarios });
        } catch (error) {
            process.send({ error: error.message });
        }
        process.disconnect();
    });
} else {
    const url = new URL(process.env.DATABASE_URL);
    assert.equal(url.hostname, 'db');
    assert.equal(url.pathname, '/delivery_fixture');
    assert.equal(process.env.APP_ALBUM_ROOT_PATH, '/fixtures');
    reqApp('ts-node').register({
        project: path.join(app, 'tsconfig.json'),
        transpileOnly: true,
    });
    reqApp('tsconfig-paths').register({
        baseUrl: app,
        paths: { '@/*': ['src/*'] },
    });
    const queryHooks = require('./prisma-hooks.cjs')(reqApp);
    const prisma = reqApp('./src/utils/prisma/prismaImporter.ts').default;
    let server;
    let child;
    let active = 0;
    const openFiles = new Set();
    let statements = {};
    let durations = {};
    let locks = { accountExclusive: 0, accountShared: 0, sessionExclusive: 0 };
    let cpu = process.cpuUsage();
    const delay = monitorEventLoopDelay({ resolution: 10 });
    const originalStream = fs.createReadStream;
    const originalOpen = fsp.open;
    const trackStream = (stream) => {
        active++;
        stream.once('close', () => active--);
        return stream;
    };
    fs.createReadStream = (...args) => {
        return trackStream(originalStream(...args));
    };
    fsp.open = async (...args) => {
        const file = await originalOpen(...args);
        openFiles.add(file);
        file.once('close', () => openFiles.delete(file));
        const create = file.createReadStream.bind(file);
        file.createReadStream = (...options) => trackStream(create(...options));
        return file;
    };
    queryHooks.use(async (params, next) => {
        if (params.action === 'queryRaw') {
            // Prisma middleware receives tagged-template args before the driver maps them to SQL.
            const template = Array.isArray(params.args) ? params.args[0] : params.args;
            const query =
                typeof template === 'string'
                    ? template
                    : Array.isArray(template)
                      ? template.join('?')
                      : (template?.sql ?? template?.query ?? template?.strings?.join('?') ?? '');
            if (/FROM\s+User\b/.test(query)) {
                if (/FOR UPDATE/.test(query)) locks.accountExclusive++;
                if (/LOCK IN SHARE MODE/.test(query)) locks.accountShared++;
            }
            if (/FROM\s+AuthSession\b/.test(query) && /FOR UPDATE/.test(query)) locks.sessionExclusive++;
        }
        const key = (params.model ?? 'raw') + '.' + params.action;
        const start = performance.now();
        try {
            return await next(params);
        } finally {
            statements[key] = (statements[key] ?? 0) + 1;
            durations[key] = (durations[key] ?? 0) + performance.now() - start;
        }
    });
    (async () => {
        if (process.argv[2] === 'fixtures') {
            assert.equal(await prisma.user.count(), 0, 'requires fresh task DB');
            const bcrypt = reqApp('bcrypt');
            const password = await bcrypt.hash('Synthetic-Delivery-Password!', 10);
            for (let i = 0; i < 8; i++)
                await prisma.user.create({
                    data: {
                        email: `delivery-${i}@example.invalid`,
                        name: `Synthetic ${i}`,
                        password,
                        isAdmin: true,
                    },
                });
            execFileSync('ffmpeg', [
                '-v',
                'error',
                '-f',
                'lavfi',
                '-i',
                'testsrc2=size=320x180:rate=10',
                '-t',
                '3',
                '-c:v',
                'mpeg4',
                '-y',
                '/fixtures/video.mp4',
            ]);
            // Neutral trailing bytes make the cap/request-cost measurable; no decoder claim.
            fs.appendFileSync('/fixtures/video.mp4', Buffer.alloc(12000000));
            execFileSync('ffmpeg', [
                '-v',
                'error',
                '-f',
                'lavfi',
                '-i',
                'testsrc2=size=2400x1600',
                '-frames:v',
                '1',
                '-y',
                '/fixtures/image.jpg',
            ]);
            for (const [name, extension] of [
                ['video', 'mp4'],
                ['image', 'jpg'],
            ]) {
                const file = await prisma.file.create({
                    data: {
                        name,
                        extension,
                        path: `${name}.${extension}`,
                        size: fs.statSync(`/fixtures/${name}.${extension}`).size,
                    },
                });
                if (name === 'image') {
                    const { getFileIdThumbnailPath } = reqApp('./src/utils/thumbnailHelper.ts');
                    execFileSync('ffmpeg', [
                        '-v',
                        'error',
                        '-i',
                        '/fixtures/image.jpg',
                        '-vf',
                        'scale=1280:-1',
                        '-frames:v',
                        '1',
                        '-y',
                        getFileIdThumbnailPath(file.id, 1280),
                    ]);
                }
            }
            if (process.env.DELIVERY_BROWSER_CHECK === 'true') {
                execFileSync('ffmpeg', [
                    '-v',
                    'error',
                    '-f',
                    'lavfi',
                    '-i',
                    'testsrc2=size=320x180:rate=24',
                    '-t',
                    '8',
                    '-c:v',
                    'libx264',
                    '-pix_fmt',
                    'yuv420p',
                    '-movflags',
                    '+faststart',
                    '-y',
                    '/fixtures/playback.mp4',
                ]);
                await prisma.file.create({
                    data: {
                        name: 'playback',
                        extension: 'mp4',
                        path: 'playback.mp4',
                        size: fs.statSync('/fixtures/playback.mp4').size,
                    },
                });
            }
            return;
        }
        const { issueSession } = reqApp('./src/utils/auth/serverSession.ts');
        const { getIronSessionOptions } = reqApp('./src/utils/sessionHelper.ts');
        const { sealData } = reqApp('iron-session');
        const cookies = [];
        const sessionTokens = [];
        for (const user of await prisma.user.findMany({
            orderBy: { email: 'asc' },
        })) {
            const session = await issueSession(user);
            assert(session);
            sessionTokens.push(session.token);
            const options = getIronSessionOptions();
            cookies.push(options.cookieName + '=' + (await sealData({ version: 1, token: session.token }, options)));
        }
        assert.equal(cookies.length, 8);
        const sameAccountCookies = [cookies[0]];
        const account = await prisma.user.findUniqueOrThrow({ where: { email: 'delivery-0@example.invalid' } });
        for (let i = 1; i < 8; i++) {
            const session = await issueSession(account);
            const options = getIronSessionOptions();
            sameAccountCookies.push(
                options.cookieName + '=' + (await sealData({ version: 1, token: session.token }, options)),
            );
        }
        const files = await prisma.file.findMany();
        const ids = Object.fromEntries(files.map((file) => [file.name, file.id]));
        const contentRoute = reqApp('./src/pages/api/file/content/[id].ts');
        const thumbnailRoute = reqApp('./src/pages/api/file/thumbnail/[...params].ts');
        const { apiResolver } = reqApp('next/dist/server/api-utils/node/api-resolver');
        delay.enable();
        server = createServer(async (req, res) => {
            if (req.url.startsWith('/metrics')) {
                if (req.url.endsWith('/reset')) {
                    statements = {};
                    durations = {};
                    locks = { accountExclusive: 0, accountShared: 0, sessionExclusive: 0 };
                    cpu = process.cpuUsage();
                    delay.reset();
                }
                res.setHeader('Content-Type', 'application/json');
                res.end(
                    JSON.stringify({
                        statements,
                        statementDurationMs: durations,
                        lockingQueries: locks,
                        activeFileStreams: active,
                        openFileHandles: openFiles.size,
                        fdCount: fs.readdirSync('/proc/self/fd').length,
                        cpuMicros: process.cpuUsage(cpu),
                        rssBytes: process.memoryUsage().rss,
                        eventLoopDelayMs: {
                            p95: delay.percentile(95) / 1e6,
                            max: delay.max / 1e6,
                        },
                        lockWaits: 'Not separately observable: raw.queryRaw duration includes execution and lock waits',
                    }),
                );
                return;
            }
            const thumbnail = req.url.startsWith('/api/file/thumbnail/');
            const query = thumbnail ? { params: req.url.split('/').slice(-2) } : { id: req.url.split('/').pop() };
            await apiResolver(
                req,
                res,
                query,
                thumbnail ? thumbnailRoute : contentRoute,
                {
                    previewModeId: '',
                    previewModeSigningKey: '',
                    previewModeEncryptionKey: '',
                },
                false,
            );
        });
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const base = 'http://127.0.0.1:' + server.address().port;
        // Load modules, establish DB connections and warm the route before samples.
        await (
            await fetch(base + '/api/file/content/' + ids.image, {
                headers: { cookie: cookies[0] },
            })
        ).arrayBuffer();
        const result = await new Promise((resolve, reject) => {
            child = fork(__filename, ['client'], {
                stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
            });
            child.once('message', (message) => (message.error ? reject(new Error(message.error)) : resolve(message)));
            child.once('error', reject);
            child.once('exit', (code) => {
                if (code) reject(new Error('client failed'));
            });
            child.send({ base, cookies, sameAccountCookies, ids });
        });
        await pause(50);
        if (process.env.DELIVERY_VERIFY === 'true') {
            for (const scenario of result.scenarios) {
                assert.equal(
                    scenario.metrics.lockingQueries.accountExclusive,
                    0,
                    'media authorization does not take exclusive account locks',
                );
                assert.equal(
                    scenario.metrics.lockingQueries.accountShared,
                    scenario.count,
                    'one shared account lock per request',
                );
                assert.equal(
                    scenario.metrics.lockingQueries.sessionExclusive,
                    scenario.count,
                    'one session lock per request',
                );
                assert.equal(
                    scenario.metrics.statements['AuthSession.updateMany'],
                    scenario.count,
                    'exact idle timeout retains activity writes',
                );
            }
            for (const scenario of result.scenarios)
                for (const sample of scenario.samples) {
                    assert.equal(sample.status, sample.requestedRange ? 206 : 200, scenario.name);
                    if (scenario.name === 'seek-bounded') assert.equal(sample.bytes, 100000);
                }
            const headers = { cookie: cookies[0] };
            const target = base + '/api/file/content/' + ids.video;
            const probe = async (url, extra, expected, bytes) => {
                const response = await fetch(url, {
                    headers: { ...headers, ...extra },
                });
                assert.equal(response.status, expected);
                const body = await response.arrayBuffer();
                if (bytes !== undefined) assert.equal(body.byteLength, bytes);
                return response;
            };
            await probe(target, { range: 'bytes=0-1' }, 206, 2);
            await probe(target, { range: 'bytes=-5' }, 206, 5);
            await probe(target, { range: 'bytes=999999999999999999999999-' }, 416, 0);
            const thumbnail = await probe(
                base + '/api/file/thumbnail/' + ids.image + '/1280',
                { range: 'bytes=0-1' },
                206,
                2,
            );
            assert.match(thumbnail.headers.get('content-type'), /^image\/jpeg/);
            const etag = thumbnail.headers.get('etag');
            assert(etag?.startsWith('W/"'));
            assert.equal(thumbnail.headers.get('cache-control'), 'private, no-cache');
            assert.match(thumbnail.headers.get('vary'), /Cookie/i);
            await probe(base + '/api/file/thumbnail/' + ids.image + '/1280', { 'if-none-match': etag }, 304, 0);
            await probe(target, { 'if-none-match': '*', range: 'bytes=99999999999-' }, 304, 0);
            const denied = await fetch(target);
            assert.equal(denied.status, 403);
            await denied.arrayBuffer();
            await probe(base + '/api/file/content/00000000-0000-0000-0000-000000000000', {}, 404);

            // Reuse existing sockets before the descriptor baseline, then cancel full and range reads.
            await probe(target, { range: 'bytes=0-1' }, 206, 2);
            await pause(50);
            const beforeFD = fs.readdirSync('/proc/self/fd').length;
            const rssBefore = process.memoryUsage().rss;
            for (let i = 0; i < 40; i++) {
                await new Promise((resolve, reject) => {
                    const req = get(
                        target,
                        {
                            headers: { ...headers, ...(i % 2 ? { range: 'bytes=0-' } : {}) },
                        },
                        (res) => {
                            res.once('data', () => {
                                res.destroy();
                                resolve();
                            });
                            res.once('error', (error) => {
                                if (error.code !== 'ECONNRESET') reject(error);
                            });
                        },
                    );
                    req.once('error', reject);
                });
            }
            await pause(150);
            assert.equal(active, 0, 'cancelled source streams close');
            assert.equal(openFiles.size, 0, 'cancelled file handles close');
            const afterFD = fs.readdirSync('/proc/self/fd').length;
            // The one final client-side cancelled socket may be pending TCP teardown.
            assert(afterFD <= beforeFD + 2, `descriptor growth: ${beforeFD} -> ${afterFD}`);
            result.regression = {
                exactRanges: true,
                thumbnailRange: true,
                authorization: true,
                cancelledRequests: 40,
                activeStreamsAfterSettling: active,
                openFileHandlesAfterSettling: openFiles.size,
                fdBefore: beforeFD,
                fdAfter: afterFD,
                rssBefore,
                rssAfter: process.memoryUsage().rss,
            };
            const stranger = await prisma.user.create({
                data: {
                    email: 'denied@example.invalid',
                    name: 'Synthetic denied reader',
                    password: 'unused',
                },
            });
            const deniedSession = await issueSession(stranger);
            const options = getIronSessionOptions();
            const deniedCookie =
                options.cookieName + '=' + (await sealData({ version: 1, token: deniedSession.token }, options));
            const noMembership = await fetch(base + '/api/file/thumbnail/' + ids.image + '/1280', {
                headers: { cookie: deniedCookie, 'if-none-match': etag },
            });
            assert.equal(noMembership.status, 404, 'matching cache validator does not bypass membership');
            await noMembership.arrayBuffer();
            const { revokeSession } = reqApp('./src/utils/auth/serverSession.ts');
            await revokeSession({ version: 1, token: sessionTokens[0] });
            await probe(target, { 'if-none-match': '*' }, 403);
            await probe(base + '/api/file/thumbnail/' + ids.image + '/1280', { 'if-none-match': etag }, 403);
            result.regression.conditionalCacheAuthorization = true;
        }
        result.fixtures = ['video.mp4', 'image.jpg'].map((name) => ({
            name,
            bytes: fs.statSync('/fixtures/' + name).size,
            sha256: createHash('sha256')
                .update(fs.readFileSync('/fixtures/' + name))
                .digest('hex'),
        }));
        result.runtime = {
            node: process.version,
            prisma: reqApp('@prisma/client/package.json').version,
            next: reqApp('next/package.json').version,
            fileStreamsAfterSettling: active,
            openFileHandlesAfterSettling: openFiles.size,
        };
        console.log(JSON.stringify(result));
    })()
        .catch((error) => {
            console.error('Delivery harness failed:', error.code ?? error.message);
            process.exitCode = 1;
        })
        .finally(async () => {
            delay.disable();
            if (child && child.connected) child.kill();
            if (server) {
                server.closeAllConnections();
                await new Promise((resolve) => server.close(resolve));
            }
            fs.createReadStream = originalStream;
            fsp.open = originalOpen;
            await prisma.$disconnect();
        });
}
