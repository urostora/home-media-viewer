import type { NextApiRequest, NextApiResponse } from 'next';
import { apiOnlyWithAdminUsers } from '@/utils/auth/apiHoc';
import { getRequestBodyObject } from '@/utils/apiHelpers';
import { respondToProcessing } from '@/utils/processes/processingResponse';
import type { ProcessingOptions } from '@/types/processingTypes';

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    res.status(405).end('Method Not Allowed');
    return;
  }
  try {
    const options = getRequestBodyObject<ProcessingOptions>(req, res);
    await respondToProcessing(res, options);
  } catch {
    res.status(400).json({ ok: false, error: 'Invalid processing request' });
  }
};
export default apiOnlyWithAdminUsers(handler);
