import type { NextApiRequest, NextApiResponse } from 'next';

import { isProcessAuthorized } from '@/utils/processAuth';
import { readIndexingState } from '@/utils/processes/indexingState';

import { getApiResponseWithData } from '@/utils/apiHelpers';
import { type MetadataProcessStatistics, lastStatistics } from '@/utils/processes/updateMetadataProcess';

const isBackgroundProcessEnabled = Number.parseInt(process.env?.IS_BACKGROUND_PROCESS_ENABLED ?? '0') === 1;

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  const { method } = req;

  switch (method) {
    case 'GET':
      if (!isBackgroundProcessEnabled) {
        res.status(400).send(`Background process api disabled by config`);
        break;
      }

      if (!isProcessAuthorized(req)) {
        res.status(403).send('Invalid process authorization');
        break;
      }

      try {
        const statistics: MetadataProcessStatistics | undefined = lastStatistics.getLastStatistics();

        res.setHeader('Cache-Control', 'no-store');
        res.status(200).json({
          ...getApiResponseWithData<MetadataProcessStatistics | undefined>(statistics),
          indexing: await readIndexingState(),
        });
      } catch {
        res.status(503).send('Indexing status unavailable');
      }

      break;
    default:
      res.setHeader('Allow', ['GET']);
      res.status(405).send(`Method ${method} Not Allowed`);
  }
};

export default handler;
