import type { NextApiRequest, NextApiResponse } from 'next';

import { getApiResponseWithData } from '@/utils/apiHelpers';
import { type MetadataProcessStatistics, lastStatistics } from '@/utils/processes/updateMetadataProcess';

const isBackgroundProcessEnabled = Number.parseInt(process.env?.IS_BACKGROUND_PROCESS_ENABLED ?? '0') === 1;
const processToken = process.env?.PROCESS_TOKEN ?? null;

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  const { method } = req;

  switch (method) {
    case 'GET':
      if (!isBackgroundProcessEnabled && req.query?.force !== '1') {
        res.status(400).send(`Background process api disabled by config`);
        break;
      }

      if (typeof processToken !== 'string' || processToken.length === 0) {
        res.status(400).send(`Invalid process token settings - api disabled`);
        break;
      }

      if (req.query.token !== processToken) {
        res.status(403).send(`Invalid process token`);
        break;
      }

      try {
        const statistics: MetadataProcessStatistics | undefined = lastStatistics.getLastStatistics();

        res.status(200).json(getApiResponseWithData<MetadataProcessStatistics | undefined>(statistics));
      } catch (e) {
        res.status(500).send(`${e}`);
      }

      break;
    default:
      res.setHeader('Allow', ['GET']);
      res.status(405).send(`Method ${method} Not Allowed`);
  }
};

export default handler;
