import { timingSafeEqual } from 'node:crypto';
import type { NextApiRequest } from 'next';

export const isProcessAuthorized = (req: NextApiRequest): boolean => {
  const token = process.env.PROCESS_TOKEN;
  const supplied = req.headers.authorization;
  if (typeof token !== 'string' || token.length === 0 || typeof supplied !== 'string') return false;
  const expected = Buffer.from(`Bearer ${token}`);
  const received = Buffer.from(supplied);
  return expected.length === received.length && timingSafeEqual(expected, received);
};
