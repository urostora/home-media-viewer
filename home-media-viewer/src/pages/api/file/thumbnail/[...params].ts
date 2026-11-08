import type { NextApiRequest, NextApiResponse } from 'next';
import { getReadableThumbnailPath } from '@/utils/thumbnailHelper';
import { handleFileResponseByPath } from '@/utils/responseHelper';
import { withAuthenticatedRoute } from '@/utils/auth/authenticatedRoute';
import { isFileIdentifier, resolveReadableFile } from '@/utils/auth/readableFile';
import { thumbnailSizes } from '@/utils/frontend/thumbnailUtils';
import { logApiFailure } from '@/utils/apiLogger';

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
    const { method } = req;

    switch (method) {
        case 'GET':
            try {
                const { params } = req.query;

                if (params === undefined || !Array.isArray(params) || params.length !== 2) {
                    res.status(400).end('Invalid thumbnail parameters');
                    return;
                }

                const [fileId, sizeString] = params;
                const size = thumbnailSizes.find((size) => String(size) === sizeString);
                if (!isFileIdentifier(fileId) || size === undefined) {
                    res.status(400).end('Invalid thumbnail parameters');
                    return;
                }

                const file = await resolveReadableFile(fileId, req.authenticatedUser);
                if (file === null) {
                    res.status(404).end('File not found');
                    return;
                }

                const thumbnailPath = await getReadableThumbnailPath(file.id, size);
                if (thumbnailPath === null) {
                    res.status(404).end('File not found');
                    return;
                }
                await handleFileResponseByPath(req, res, thumbnailPath);
            } catch (e) {
                logApiFailure('read thumbnail', 500, e);
                if (!res.headersSent && !res.destroyed) res.status(500).end('Thumbnail unavailable');
                else if (!res.destroyed) res.destroy();
            }

            break;
        default:
            res.setHeader('Allow', ['GET']);
            res.status(405).end(`Method ${method} Not Allowed`);
    }
};

export default withAuthenticatedRoute(handler);
