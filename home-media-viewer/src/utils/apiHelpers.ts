import type { NextApiRequest, NextApiResponse } from 'next'

export function getRequestBodyObject (req: NextApiRequest, res?: NextApiResponse): object | null {
    let ret: object | null = null;
    if (typeof req.body === 'string') {
        try {
          const parsedData = JSON.parse(req.body);
          ret = parsedData;
        } catch (ex) { return null; }
        
    } else if (typeof req.body === 'object') {
        ret = req.body;
    }

    if (ret == null && res != null) {
        // send bad request response
        res.status(400).end(`Could not parse JSON body: ${req.body}`);
    }

    return ret;
}