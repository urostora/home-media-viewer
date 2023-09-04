import { getApiResponse } from '@/utils/apiHelpers';
import updateMetadataProcess from '@/utils/processes/updateMetadataProcess';
import { NextApiRequest, NextApiResponse } from 'next';
import os from 'os';

const processToken = process.env?.PROCESS_TOKEN ?? null;
const longProcessTimeout = typeof process.env?.LONG_PROCESS_TIMEOUT_SEC === 'string' && process.env?.LONG_PROCESS_TIMEOUT_SEC.length > 0
  ? Math.floor(Number.parseInt(process.env.LONG_PROCESS_TIMEOUT_SEC) / 2)
  : undefined;

const threadCount = Math.floor(os.availableParallelism());

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const { method } = req;

  switch (method) {
    case 'GET':
      if (typeof processToken !== 'string' || processToken.length === 0) {
        res.status(400).end(`Invalid process token settings - api disabled`);
        break;
      }

      if (req.query['token'] !== processToken) {
        res.status(403).end(`Invalid process token`);
        break;
      }

      try {
        await updateMetadataProcess.update(longProcessTimeout, threadCount);

        res.status(200).json(getApiResponse({ ok: true }));
      } catch (e) {
        res.status(500).end(`${e}`);
      }

      break;
    default:
      res.setHeader('Allow', ['GET']);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
};

export default handler;
