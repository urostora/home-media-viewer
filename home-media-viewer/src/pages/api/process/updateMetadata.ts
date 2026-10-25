import { isProcessAuthorized } from '@/utils/processAuth';
import { getWorkerCount, getProcessTimeout } from '@/utils/processes/processConfig';
import { IndexingBusyError } from '@/utils/processes/indexingState';
import { type NextApiRequest, type NextApiResponse } from 'next';

import { getApiResponseWithData } from '@/utils/apiHelpers';
import updateMetadataProcess, { type MetadataProcessStatistics } from '@/utils/processes/updateMetadataProcess';

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
        const statistics = await updateMetadataProcess.update(getProcessTimeout(), getWorkerCount());

        res.status(200).json(getApiResponseWithData<MetadataProcessStatistics | undefined>(statistics));
      } catch (e) {
        res.status(e instanceof IndexingBusyError ? 409 : 500).send('Indexing unavailable or failed');
      }

      break;
    default:
      res.setHeader('Allow', ['GET']);
      res.status(405).send(`Method ${method} Not Allowed`);
  }
};

export default handler;
