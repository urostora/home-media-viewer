const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const Jimp = require('/home/node/app/node_modules/jimp');

const root = '/fixtures';
async function main() {
  const action = process.argv[2];
  const changed = path.join(root, 'mixed/change.jpg');
  if (action === 'size-change' || action === 'same-size-change') {
    if (action === 'size-change') await fs.appendFile(changed, 'x');
    else {
      const data = await fs.readFile(changed);
      data[data.length - 1] = data[data.length - 1] === 65 ? 66 : 65;
      await fs.writeFile(changed, data);
    }
    // Ensure mtime differs even on filesystems with coarse timestamp resolution.
    const stat = await fs.stat(changed);
    await fs.utimes(changed, stat.atime, new Date(stat.mtimeMs + 2000));
    return;
  }
  if (action !== 'create') throw new Error('Unknown fixture action');
  const small = await new Jimp(96, 64, 0x6594aaff).getBufferAsync(Jimp.MIME_JPEG);
  const large = await new Jimp(3000, 2000, 0x887755ff).getBufferAsync(Jimp.MIME_JPEG);
  async function put(relative, data) {
    const target = path.join(root, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, data);
  }
  for (let i = 0; i < 60; i++) await put(`mixed/small-${i}.jpg`, small);
  for (let i = 0; i < 4; i++) await put(`mixed/large-${i}.jpg`, large);
  await put('mixed/change.jpg', Buffer.concat([small, Buffer.from('A')]));
  for (let i = 0; i < 500; i++) await put(`wide/entry-${i}.txt`, 'benchmark unsupported content\n');
  for (let i = 1; i <= 12; i++) await put(`deep/${'level/'.repeat(i)}image.jpg`, small);
  for (let i = 0; i < 20; i++) await put(`branches/branch-${i}/image.jpg`, small);
  // Exercise existing test media without changing it or retaining copies after cleanup.
  const references = [
    ['album01/IMG_20230711_203240.jpg', 'reference-image-1.jpg'],
    ['album02/IMG_20180624_105421.jpg', 'reference-image-2.jpg'],
    ['album01/Vid 20180731 180643.mp4', 'reference-video-1.mp4'],
    ['album02/Vid 20180501 163728.mp4', 'reference-video-2.mp4'],
  ];
  for (const [source, name] of references) await put(`mixed/${name}`, await fs.readFile(`/reference/${source}`));
  execFileSync('/usr/bin/ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i',
    'testsrc2=size=960x540:rate=24', '-t', '3', '-threads', '1', '-c:v', 'mpeg4',
    path.join(root, 'mixed/synthetic-video.mp4')]);
  const entries = [];
  async function walk(directory) {
    for (const name of (await fs.readdir(directory)).sort()) {
      const target = path.join(directory, name);
      const stat = await fs.stat(target);
      if (stat.isDirectory()) await walk(target);
      else {
        const data = await fs.readFile(target);
        entries.push({ path: path.relative(root, target), bytes: data.length,
          sha256: createHash('sha256').update(data).digest('hex') });
      }
    }
  }
  await walk(root);
  console.log(JSON.stringify({ files: entries.length, bytes: entries.reduce((sum, e) => sum + e.bytes, 0),
    sha256: createHash('sha256').update(JSON.stringify(entries)).digest('hex'), entries }));
}
main().catch(() => { console.error('Fixture operation failed'); process.exitCode = 1; });
