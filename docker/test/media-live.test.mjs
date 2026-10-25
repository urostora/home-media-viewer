import assert from 'node:assert/strict';

const base = process.env.APP_URL;
const login = await fetch(new URL('/api/login', base), {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
});
assert.equal(login.status, 200);
const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
const browse = await fetch(new URL('/api/browse/album01/album01dir01', base), { headers: { cookie } });
assert.equal(browse.status, 200);
const directory = await browse.json();
assert.equal(directory.data.relativePath, 'album01/album01dir01');
assert(directory.data.content.some(file => file.name === 'IMG_20220709_111415.jpg'));

const search = await fetch(new URL('/api/file/search', base), {
  method: 'POST',
  headers: { cookie, 'content-type': 'application/json' },
  body: JSON.stringify({ take: 0, contentType: 'video', metadataStatus: 'Processed' }),
});
assert.equal(search.status, 200);
const files = await search.json();
const video = files.data?.find(file => file.extension === 'mp4' && file.thumbnailStatus === 'Processed');
assert(video, 'A processed video fixture is required');
assert(video.metas.some(meta => meta.metaKey === 'duration' && meta.floatValue > 0));
const content = new URL('/api/file/content/' + video.id, base);
assert.equal((await fetch(content)).status, 403);
const stream = await fetch(content, { headers: { cookie, range: 'bytes=0-' } });
assert.equal(stream.status, 206);
assert.match(stream.headers.get('content-type'), /^video\/mp4/);
assert.match(stream.headers.get('content-range'), /^bytes 0-\d+\/\d+$/);
assert.equal(stream.headers.get('accept-ranges'), 'bytes');
assert((await stream.arrayBuffer()).byteLength > 0);
console.log('Catch-all browsing, processed video metadata and authenticated range playback passed');
