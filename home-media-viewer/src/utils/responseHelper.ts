import type { NextApiRequest, NextApiResponse } from 'next';
import { existsSync, statSync, createReadStream } from 'node:fs';
import { extname } from 'path';

import mime from 'mime-types';

export const handleFileResponseByPath = (req: NextApiRequest, res: NextApiResponse, path: string): void => {
  if (!existsSync(path)) {
    res.status(404).write('File not found');
  }

  const stat = statSync(path);

  const range = req.headers.range;
  if (!range) {
    res.writeHead(200, undefined, {
      'Content-Type': mime.contentType(extname(path)) as string,
      'Content-Length': stat.size,
    });
    const readStream = createReadStream(path);
    // We replaced all the event handlers with a simple call to readStream.pipe()
    readStream.pipe(res);
  } else {
    const CHUNK_SIZE = 4 * 1_000_000; // 4MB
    const start = Number(range.replace(/\D/g, ''));

    const end = Math.min(start + CHUNK_SIZE, stat.size - 1);

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': 'video/mp4',
    });

    const videoStream = createReadStream(path, { start, end });
    videoStream.pipe(res);
  }
};
