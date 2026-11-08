import type { NextApiRequest, NextApiResponse } from 'next';

import { handleFileResponseByPath } from '@/utils/responseHelper';
import { getFullPath } from '@/utils/fileHelper';
import { withAuthenticatedRoute } from '@/utils/auth/authenticatedRoute';

import { isFileIdentifier, resolveReadableFile } from '@/utils/auth/readableFile';
import { logApiFailure } from '@/utils/apiLogger';

// Original media is intentionally larger than the API JSON response warning threshold.
export const config = { api: { responseLimit: false } };

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
    const { method } = req;

    switch (method) {
        case 'GET':
            // search files
            try {
                const { id } = req.query;

                if (!isFileIdentifier(id)) {
                    res.status(400).end('Invalid file identifier');
                    return;
                }

                const file = await resolveReadableFile(id, req.authenticatedUser);

                if (file == null) {
                    res.status(404).end('File not found');
                    return;
                }

                const filePath = getFullPath(file);
                await handleFileResponseByPath(req, res, filePath);
            } catch (e) {
                logApiFailure('read file content', 500, e);
                if (!res.headersSent && !res.destroyed) res.status(500).end('File content unavailable');
                else if (!res.destroyed) res.destroy();
            }

            break;
        default:
            res.setHeader('Allow', ['GET']);
            res.status(405).end(`Method ${method} Not Allowed`);
    }
};

export default withAuthenticatedRoute(handler);
