// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';

interface Data {
  message: string;
}

export default function handler(req: NextApiRequest, res: NextApiResponse<Data>): void {
  res.status(200).json({ message: 'Hello' });
}
