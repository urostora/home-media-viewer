// Run inside the final application image, from its application directory.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(resolve('package.json'));
assert.equal(process.getuid(), 1000);
assert.equal(process.versions.node.split('.')[0], '26');
assert(existsSync('.next/BUILD_ID'));
assert(statSync('public').isDirectory());
assert(!existsSync('.next/standalone'), 'Packaging must use the documented next start layout');
assert(!existsSync('node_modules/prisma'), 'Prisma CLI must not be in the web runtime');
assert(!existsSync('node_modules/typescript'), 'Development dependencies must be pruned');
const bcrypt = require('bcrypt');
const hashed = await bcrypt.hash('native-runtime-probe', 4);
assert(await bcrypt.compare('native-runtime-probe', hashed));
const { PrismaClient, Prisma } = require('@prisma/client');
assert.equal(Prisma.prismaVersion.client, '5.8.1');
const prisma = new PrismaClient();
for (const binary of ['/usr/bin/ffmpeg', '/usr/bin/ffprobe']) {
  assert.equal(typeof binary, 'string');
  assert(existsSync(binary));
  const result = spawnSync(binary, ['-version'], { encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 0, `Native media executable failed: ${result.error?.message || result.stderr}`);
}
if (process.env.HMV_CHECK_FIXTURES === 'true') {
  try {
    const video = await prisma.file.findFirst({
      where: { extension: 'mp4', metadataStatus: 'Processed', thumbnailStatus: 'Processed' },
      include: { metas: true },
    });
    assert(video, 'A real video fixture must have completed metadata and thumbnails');
    assert(video.metas.some((meta) => meta.metaKey === 'duration' && meta.floatValue > 0));
    const thumbnails = [];
    const scan = (directory) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) scan(path);
        else if (entry.name.startsWith(video.id + '_')) thumbnails.push(path);
      }
    };
    scan('/mnt/storage');
    assert.equal(thumbnails.length, 3);
    assert(thumbnails.every((path) => statSync(path).size > 0));
    console.log('Live Prisma query, video duration metadata and all three video thumbnails passed');
  } finally {
    await prisma.$disconnect();
  }
} else {
  await prisma.$disconnect();
}
console.log('Final image native dependencies, generated Prisma client, assets, packaging and UID passed');
