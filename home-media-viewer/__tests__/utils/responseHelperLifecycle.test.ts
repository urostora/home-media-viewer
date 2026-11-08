/** @jest-environment node */
import * as fs from 'node:fs/promises';
import { Readable, Writable } from 'node:stream';
import os from 'node:os';
import path from 'node:path';
import type { NextApiRequest, NextApiResponse } from 'next';
import { handleFileResponseByPath } from '@/utils/responseHelper';

jest.mock('node:fs/promises', () => {
  const actual = jest.requireActual('node:fs/promises');
  return { ...actual, open: jest.fn(actual.open) };
});

const actualOpen: typeof fs.open = jest.requireActual('node:fs/promises').open;
let temporary: string;
let filename: string;
const handles: fs.FileHandle[] = [];
const request = (range?: string): NextApiRequest => ({ headers: range ? { range } : {} }) as NextApiRequest;
const response = (write?: (chunk: Buffer, done: (error?: Error) => void) => void) => {
  const chunks: Buffer[] = [];
  const res = new Writable({
    write(chunk: Buffer, _encoding, done) {
      if (write) write(chunk, done);
      else {
        chunks.push(chunk);
        done();
      }
    },
  }) as Writable & NextApiResponse;
  res.writeHead = jest.fn().mockReturnValue(res);
  res.status = jest.fn().mockReturnValue(res);
  return { res, chunks };
};
const gate = () => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { release, promise };
};

beforeAll(async () => {
  temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'hmv-stream-'));
  filename = path.join(temporary, 'large.mp4');
  await fs.writeFile(filename, Buffer.alloc(8_000_000, 42));
});
beforeEach(() => {
  jest.mocked(fs.open).mockImplementation(async (...args) => {
    const file = await actualOpen(...args);
    handles.push(file);
    return file;
  });
});
afterEach(async () => {
  try {
    for (const file of handles) expect(file.fd).toBe(-1);
  } finally {
    await Promise.all(handles.splice(0).map((file) => file.close()));
    jest.restoreAllMocks();
    jest.clearAllMocks();
  }
});
afterAll(async () => fs.rm(temporary, { recursive: true, force: true }));

it('awaits a complete transfer and closes its handle', async () => {
  const { res, chunks } = response();
  await handleFileResponseByPath(request('bytes=0-9'), res, filename);
  expect(Buffer.concat(chunks)).toEqual(Buffer.alloc(10, 42));
  expect(res.writableFinished).toBe(true);
});

it('reads the opened representation when its path is replaced before stat', async () => {
  const target = path.join(temporary, 'replace.mp4');
  const replacement = path.join(temporary, 'replacement.mp4');
  await fs.writeFile(target, 'original');
  await fs.writeFile(replacement, 'new');
  const file = await actualOpen(target, 'r');
  handles.push(file);
  jest.mocked(fs.open).mockImplementationOnce(async () => {
    await fs.rename(replacement, target);
    return file;
  });
  const { res, chunks } = response();
  await handleFileResponseByPath(request(), res, target);
  expect(Buffer.concat(chunks).toString()).toBe('original');
  expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({ 'Content-Length': 8 }));
});

it.each([undefined, 'bytes=0-'])('closes the file when the consumer disconnects, range %s', async (range) => {
  const { res } = response((_chunk, done) => {
    res.destroy();
    done();
  });
  await expect(handleFileResponseByPath(request(range), res, filename)).resolves.toBeUndefined();
  expect(res.destroyed).toBe(true);
});

it('keeps read-ahead bounded while a slow consumer applies backpressure', async () => {
  const started = gate();
  const release = gate();
  let first = true;
  let stream: ReturnType<fs.FileHandle['createReadStream']>;
  const file = await actualOpen(filename, 'r');
  handles.push(file);
  const original = file.createReadStream.bind(file);
  jest.spyOn(file, 'createReadStream').mockImplementation((options) => {
    stream = original(options);
    return stream;
  });
  jest.mocked(fs.open).mockResolvedValueOnce(file);
  const { res } = response((_chunk, done) => {
    if (first) {
      first = false;
      started.release();
      void release.promise.then(() => done());
    } else done();
  });
  const transfer = handleFileResponseByPath(request(), res, filename);
  await started.promise;
  try {
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(stream!.bytesRead).toBeLessThanOrEqual(256 * 1024);
    expect(res.writableFinished).toBe(false);
  } finally {
    release.release();
    await transfer;
  }
});

it('does not block another response while asynchronous open is delayed', async () => {
  const delayed = gate();
  jest.mocked(fs.open).mockImplementationOnce(async (...args) => {
    await delayed.promise;
    const file = await actualOpen(...args);
    handles.push(file);
    return file;
  });
  const first = response();
  const pending = handleFileResponseByPath(request('bytes=0-1'), first.res, filename);
  try {
    const second = response();
    await handleFileResponseByPath(request('bytes=0-1'), second.res, filename);
    expect(second.res.writableFinished).toBe(true);
    expect(first.res.writeHead).not.toHaveBeenCalled();
  } finally {
    delayed.release();
    await pending;
  }
});

it.each(['open', 'stat'])('closes a file when the client leaves during %s', async (stage) => {
  const entered = gate();
  const release = gate();
  const file = await actualOpen(filename, 'r');
  handles.push(file);
  jest.mocked(fs.open).mockImplementationOnce(async () => {
    if (stage === 'open') {
      entered.release();
      await release.promise;
    }
    return file;
  });
  if (stage === 'stat') {
    const original = file.stat.bind(file);
    jest.spyOn(file, 'stat').mockImplementationOnce(async () => {
      entered.release();
      await release.promise;
      return original();
    });
  }
  const { res } = response();
  const pending = handleFileResponseByPath(request(), res, filename);
  await entered.promise;
  res.destroy();
  release.release();
  await pending;
  expect(res.writeHead).not.toHaveBeenCalled();
});

it('does not open a file for an already aborted request', async () => {
  const { res } = response();
  await handleFileResponseByPath({ ...request(), aborted: true } as NextApiRequest, res, filename);
  expect(fs.open).not.toHaveBeenCalled();
});

it.each(['missing', 'directory', 'unsatisfiable', 'empty'])('closes resources for %s', async (kind) => {
  const { res } = response();
  let target = filename;
  if (kind === 'missing') target = path.join(temporary, 'missing.mp4');
  if (kind === 'directory') target = temporary;
  if (kind === 'empty') {
    target = path.join(temporary, 'empty.mp4');
    await fs.writeFile(target, '');
  }
  await handleFileResponseByPath(request(kind === 'unsatisfiable' ? 'bytes=99999999-' : undefined), res, target);
  if (kind === 'missing' || kind === 'directory') expect(res.status).toHaveBeenCalledWith(404);
  else expect(res.writeHead).toHaveBeenCalledWith(kind === 'empty' ? 200 : 416, expect.any(Object));
});

it('propagates an open failure before sending headers', async () => {
  jest.mocked(fs.open).mockRejectedValueOnce(Object.assign(new Error('synthetic'), { code: 'EACCES' }));
  const { res } = response();
  await expect(handleFileResponseByPath(request(), res, filename)).rejects.toMatchObject({ code: 'EACCES' });
  expect(res.writeHead).not.toHaveBeenCalled();
});

it('closes a handle after a metadata error', async () => {
  const file = await actualOpen(filename, 'r');
  handles.push(file);
  jest.mocked(fs.open).mockResolvedValueOnce(file);
  jest.spyOn(file, 'stat').mockRejectedValueOnce(Object.assign(new Error('synthetic'), { code: 'EIO' }));
  const { res } = response();
  await expect(handleFileResponseByPath(request(), res, filename)).rejects.toMatchObject({ code: 'EIO' });
  expect(res.writeHead).not.toHaveBeenCalled();
});

it('propagates a read error and destroys the response after headers', async () => {
  const file = await actualOpen(filename, 'r');
  handles.push(file);
  jest.mocked(fs.open).mockResolvedValueOnce(file);
  const stream = new Readable({
    read() {
      this.destroy(Object.assign(new Error('synthetic'), { code: 'EIO' }));
    },
  });
  jest.spyOn(file, 'createReadStream').mockReturnValueOnce(stream as ReturnType<typeof file.createReadStream>);
  const { res } = response();
  await expect(handleFileResponseByPath(request(), res, filename)).rejects.toMatchObject({ code: 'EIO' });
  expect(res.writeHead).toHaveBeenCalledTimes(1);
  expect(res.destroyed).toBe(true);
});
