import type { NextApiRequest, NextApiResponse } from 'next';

import { isProcessAuthorized } from '@/utils/processAuth';
import { readProcessingRun } from '@/utils/processes/runJournal';
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
        const runId = req.query.runId;
        if (
          runId !== undefined &&
          (typeof runId !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(runId))
        ) {
          res.status(400).json({ ok: false, error: 'Invalid runId' });
          return;
        }
        const run = await readProcessingRun(runId);
        if (runId !== undefined && run === null) {
          res.status(404).json({ ok: false, error: 'Run not retained' });
          return;
        }
        const statistics: MetadataProcessStatistics | undefined =
          run?.statistics ?? (run === null ? lastStatistics.getLastStatistics() : undefined);

        res.setHeader('Cache-Control', 'no-store');
        res.status(200).json({
          ...getApiResponseWithData<MetadataProcessStatistics | undefined>(statistics),
          indexing: await readIndexingState(),
          run,
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
