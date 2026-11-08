/** @jest-environment node */
import { createServer, type Server } from 'node:http';
import { mkdtemp, writeFile, rm, utimes } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { NextApiRequest, NextApiResponse } from 'next';
import fetch from 'node-fetch';
import { handleFileResponseByPath } from '@/utils/responseHelper';

let temporary: string;
let server: Server;
let base: string;
const body = Buffer.from('0123456789');

beforeAll(async () => {
  temporary = await mkdtemp(path.join(os.tmpdir(), 'hmv-response-'));
  await Promise.all([
    writeFile(path.join(temporary, 'sample.mov'), body),
    writeFile(path.join(temporary, 'empty.mp4'), ''),
    writeFile(path.join(temporary, 'sample.jpg'), body),
    writeFile(path.join(temporary, 'sample.unknown'), body),
    writeFile(path.join(temporary, 'large.mp4'), Buffer.alloc(5_000_000, 42)),
  ]);
  server = createServer((req, res) => {
    res.setHeader('Vary', 'Accept-Encoding');
    const nextResponse = res as NextApiResponse;
    nextResponse.status = (status) => {
      res.statusCode = status;
      return nextResponse;
    };
    void handleFileResponseByPath(req as NextApiRequest, nextResponse, path.join(temporary, req.url!.slice(1))).catch(
      () => {
        if (!res.headersSent) res.statusCode = 500;
        res.destroy();
      },
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(temporary, { recursive: true, force: true });
});

it.each([
  ['bytes=0-1', 0, 1],
  ['bytes=0-0', 0, 0],
  ['bytes=3-6', 3, 6],
  ['bytes=5-', 5, 9],
  ['bytes=9-', 9, 9],
  ['bytes=0-', 0, 9],
  ['bytes=5-99', 5, 9],
  ['bytes=-3', 7, 9],
  ['bytes=-99', 0, 9],
  ['bytes=-999999999999999999999999999999', 0, 9],
  ['bytes=1-999999999999999999999999999999', 1, 9],
  ['BYTES=0001-0002', 1, 2],
])('serves exact bytes for %s', async (range, start, end) => {
  const response = await fetch(base + '/sample.mov', { headers: { range } });
  expect(response.status).toBe(206);
  expect(response.headers.get('content-range')).toBe(`bytes ${start}-${end}/10`);
  expect(response.headers.get('content-length')).toBe(String(end - start + 1));
  expect(response.headers.get('content-type')).toBe('video/quicktime');
  expect(response.headers.get('accept-ranges')).toBe('bytes');
  expect(Buffer.from(await response.arrayBuffer())).toEqual(body.subarray(start, end + 1));
});

it.each(['bytes=10-', 'bytes=99-100', 'bytes=-0', 'bytes=999999999999999999999999999999-'])(
  'rejects an unsatisfiable range %s',
  async (range) => {
    const response = await fetch(base + '/sample.mov', { headers: { range } });
    expect(response.status).toBe(416);
    expect(response.headers.get('content-range')).toBe('bytes */10');
    expect((await response.arrayBuffer()).byteLength).toBe(0);
  },
);

it.each(['bytes=8-2', 'bytes=invalid', 'bytes=-', 'items=0-1', 'bytes=0-1,4-5', 'bytes=1.5-2', 'bytes=+1-2'])(
  'ignores an invalid or unsupported range %s',
  async (range) => {
    const response = await fetch(base + '/sample.mov', { headers: { range } });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-range')).toBeNull();
    expect(Buffer.from(await response.arrayBuffer())).toEqual(body);
  },
);

it('returns the full representation for an unvalidated If-Range', async () => {
  const response = await fetch(base + '/sample.mov', { headers: { range: 'bytes=0-1', 'if-range': '"old"' } });
  expect(response.status).toBe(200);
  expect(Buffer.from(await response.arrayBuffer())).toEqual(body);
});

it.each([undefined, 'bytes=0-', 'bytes=-1'])('handles empty files with range %s', async (range) => {
  const response = await fetch(base + '/empty.mp4', { headers: range ? { range } : {} });
  expect(response.status).toBe(range ? 416 : 200);
  expect((await response.arrayBuffer()).byteLength).toBe(0);
});

it.each([
  ['sample.jpg', 'image/jpeg'],
  ['sample.unknown', 'application/octet-stream'],
])('uses the file MIME type for %s', async (filename, mime) => {
  for (const range of [undefined, 'bytes=0-1']) {
    const response = await fetch(base + '/' + filename, { headers: range ? { range } : {} });
    expect(response.headers.get('content-type')).toBe(mime);
    await response.arrayBuffer();
  }
});

it('does not cap open-ended ranges or full downloads at 4 MB', async () => {
  for (const range of [undefined, 'bytes=0-']) {
    const response = await fetch(base + '/large.mp4', { headers: range ? { range } : {} });
    expect(response.status).toBe(range ? 206 : 200);
    expect(response.headers.get('content-length')).toBe('5000000');
    expect((await response.arrayBuffer()).byteLength).toBe(5_000_000);
  }
});

it.each(['missing.mp4', 'sample.mov/child'])('returns 404 for %s', async (name) => {
  const response = await fetch(base + '/' + name);
  expect(response.status).toBe(404);
  expect(await response.text()).toBe('File not found');
});

it('requires private revalidation and preserves other Vary fields', async () => {
  const response = await fetch(base + '/sample.mov');
  expect(response.headers.get('etag')).toMatch(/^W\/"[^" ]+"$/);
  expect(response.headers.get('last-modified')).not.toBeNull();
  expect(response.headers.get('cache-control')).toBe('private, no-cache');
  expect(response.headers.get('vary')).toBe('Accept-Encoding, Cookie');
  await response.arrayBuffer();
});

it.each(['weak', 'strong', 'list', 'wildcard'])(
  'returns a bodyless 304 for %s If-None-Match before Range',
  async (kind) => {
    const initial = await fetch(base + '/sample.mov');
    const etag = initial.headers.get('etag')!;
    await initial.arrayBuffer();
    const token =
      kind === 'strong' ? etag.slice(2) : kind === 'list' ? `"other,tag", ${etag}` : kind === 'wildcard' ? '*' : etag;
    const response = await fetch(base + '/sample.mov', { headers: { 'if-none-match': token, range: 'bytes=999-' } });
    expect(response.status).toBe(304);
    expect(response.headers.get('etag')).toBe(etag);
    expect(response.headers.get('content-length')).toBeNull();
    expect(response.headers.get('content-range')).toBeNull();
    expect((await response.arrayBuffer()).byteLength).toBe(0);
  },
);

it('honors If-Modified-Since only when If-None-Match is absent', async () => {
  const initial = await fetch(base + '/sample.mov');
  const modified = initial.headers.get('last-modified')!;
  await initial.arrayBuffer();
  for (const [headers, expected] of [
    [{ 'if-modified-since': modified }, 304],
    [{ 'if-modified-since': 'invalid' }, 200],
    [{ 'if-modified-since': 'Mon, 01 Jan 1990 00:00:00 GMT' }, 200],
    [{ 'if-none-match': '"different"', 'if-modified-since': 'Mon, 01 Jan 2090 00:00:00 GMT' }, 200],
  ] as const) {
    const response = await fetch(base + '/sample.mov', { headers });
    expect(response.status).toBe(expected);
    await response.arrayBuffer();
  }
});

it('does not use metadata validators to authorize partial recombination', async () => {
  const initial = await fetch(base + '/sample.mov');
  const etag = initial.headers.get('etag')!;
  const modified = initial.headers.get('last-modified')!;
  await initial.arrayBuffer();
  for (const token of [etag, etag.slice(2), modified, '"different"']) {
    const response = await fetch(base + '/sample.mov', { headers: { 'if-range': token, range: 'bytes=0-1' } });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-range')).toBeNull();
    expect(Buffer.from(await response.arrayBuffer())).toEqual(body);
  }
});

it('invalidates a same-size rewrite with the same Last-Modified second', async () => {
  const name = path.join(temporary, 'mutable.jpg');
  const date = new Date('2000-01-01T00:00:00Z');
  await writeFile(name, 'before');
  await utimes(name, date, date);
  const initial = await fetch(base + '/mutable.jpg');
  const etag = initial.headers.get('etag')!;
  const modified = initial.headers.get('last-modified');
  await initial.arrayBuffer();
  await writeFile(name, 'after!');
  await utimes(name, date, date);
  const response = await fetch(base + '/mutable.jpg', { headers: { 'if-none-match': etag } });
  expect(response.status).toBe(200);
  expect(response.headers.get('etag')).not.toBe(etag);
  expect(response.headers.get('last-modified')).toBe(modified);
  expect(await response.text()).toBe('after!');
  await rm(name);
  const missing = await fetch(base + '/mutable.jpg', { headers: { 'if-none-match': '*' } });
  expect(missing.status).toBe(404);
  await missing.arrayBuffer();
});
