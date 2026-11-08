import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(new URL('../../home-media-viewer/package.json', import.meta.url));
const prettier = require('prettier');
const path = (relative) => fileURLToPath(new URL(`../../${relative}`, import.meta.url));

test('editors find the same formatting settings for application and repository code', async () => {
    const application = await prettier.resolveConfig(path('home-media-viewer/src/pages/index.tsx'));
    const tooling = await prettier.resolveConfig(path('scripts/benchmark/probe.cjs'));
    assert.deepEqual(tooling, application);
    assert.equal(application.tabWidth, 4);
    assert.equal(application.useTabs, false);
    const production = await prettier.resolveConfig(path('home-media-viewer/next.config.js.prod'));
    assert.equal(production.parser, 'babel');
});

test('formatters protect generated files and immutable inputs in both working directories', async () => {
    for (const [prefix, ignored, included] of [
        [
            '',
            [
                'home-media-viewer/.next/probe.js',
                'home-media-viewer/next-env.d.ts',
                'home-media-viewer/package-lock.json',
                'releases/example/result.json',
            ],
            ['scripts/build/probe.mjs', 'home-media-viewer/src/pages/index.tsx'],
        ],
        [
            'home-media-viewer/',
            ['.next/probe.js', 'next-env.d.ts', 'package-lock.json', 'coverage/probe.js'],
            ['src/pages/index.tsx', 'next.config.js.prod'],
        ],
    ]) {
        for (const filename of ignored) {
            assert.equal(
                (await prettier.getFileInfo(path(prefix + filename), { ignorePath: path(prefix + '.prettierignore') }))
                    .ignored,
                true,
                prefix + filename,
            );
        }
        for (const filename of included) {
            assert.equal(
                (await prettier.getFileInfo(path(prefix + filename), { ignorePath: path(prefix + '.prettierignore') }))
                    .ignored,
                false,
                prefix + filename,
            );
        }
    }
});
