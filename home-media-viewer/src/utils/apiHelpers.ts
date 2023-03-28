import { EntityType, GeneralEntityListResponse, GeneralMutationResponse, GeneralResponse } from '@/types/api/generalTypes';
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

export function getEntityTypeRequestBodyObject (req: NextApiRequest, res?: NextApiResponse): EntityType | null {
    const requestObject: any = getRequestBodyObject(req, res);

    if (requestObject == null) {
        return null;
    }

    if (typeof (requestObject.id ?? null) !== 'string') {
        if (res != null) {
            res.status(400).end('Missing parameter "id"');
        }
    }

    return requestObject;
}

export function getApiResponse(parameters: any = {}): GeneralResponse {
  const now = new Date();
    const ret: GeneralMutationResponse = {
        date: `${now.getFullYear()}.${('0' + (now.getMonth() + 1)).slice(-2)}.${('0' + now.getDate()).slice(-2)} ${('0' + now.getHours()).slice(-2)}:${('0' + now.getMinutes()).slice(-2)}:${('0' + now.getSeconds()).slice(-2)}`,
        ok: parameters.ok ?? true,
    };

    if (typeof (parameters.error ?? null) === 'string') {
      ret.error = parameters.error;
    }

    if (typeof (parameters.id ?? null) === 'string') {
      ret.id = parameters.id;
    }

    return ret;
}

export function getApiResponseEntityList(parameters: any = {}, data: Array<any>, elementCount: number = 0): GeneralEntityListResponse<any> {
  return {
    ...getApiResponse(parameters),
    data,
    count: elementCount
  };
}
