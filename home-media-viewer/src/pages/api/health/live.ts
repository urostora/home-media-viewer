import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse): void {
  res.setHeader('Cache-Control', 'no-store');
  res.status(process.env.HMV_SHUTTING_DOWN === '1' ? 503 : 200).json({ live: process.env.HMV_SHUTTING_DOWN !== '1' });
}
