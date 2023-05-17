import type { NextApiRequest, NextApiResponse } from 'next';
import { existsSync, statSync, createReadStream, readFileSync } from 'node:fs';
import { extname } from 'path';

import mime from 'mime-types';

export const handleFileResponseByPath = (req: NextApiRequest, res: NextApiResponse, path: string): void => {
    if (!existsSync(path)) {
        res.status(404).write('File not found');
    }

    var stat = statSync(path);

    res.writeHead(200, undefined, {
        'Content-Type': mime.contentType(extname(path)) as string,
        'Content-Length': stat.size,
    });

    var readStream = createReadStream(path);
    // We replaced all the event handlers with a simple call to readStream.pipe()
    readStream.pipe(res);
}