import {
  type DebugType,
  type EntityListResult,
  type EntityType,
  type GeneralEntityListResponse,
  type GeneralResponse,
  type GeneralResponseParameters,
  type GeneralResponseWithData,
} from '@/types/api/generalTypes';
import type { NextApiRequest, NextApiResponse } from 'next';

export function getRequestBodyObject<T>(req: NextApiRequest, res?: NextApiResponse): T {
  let ret: object | null = null;
  if (typeof req.body === 'string') {
    try {
      const parsedData = JSON.parse(req.body);
      ret = parsedData;
    } catch (ex) {
      throw new HmvError('Could not parse JSON body', { isPublic: true });
    }
  } else if (typeof req.body === 'object') {
    ret = req.body;
  }

  if (ret == null && res != null) {
    // send bad request response
    throw new HmvError('Could not parse JSON body', { isPublic: true });
  }

  return ret as T;
}

export function getEntityTypeRequestBodyObject(req: NextApiRequest, res?: NextApiResponse): EntityType | null {
  const requestObject: { id?: string } | undefined | null = getRequestBodyObject(req, res);

  if (requestObject == null) {
    return null;
  }

  if (typeof requestObject?.id !== 'string') {
    if (res != null) {
      res.status(400).end('Missing parameter "id"');
    }

    return null;
  }

  return { id: requestObject.id };
}

export function getApiResponse(parameters: GeneralResponseParameters = {}): GeneralResponse {
  const now = new Date();
  const ret: GeneralResponse = {
    date: `${now.getFullYear()}.${('0' + (now.getMonth() + 1)).slice(-2)}.${('0' + now.getDate()).slice(-2)} ${(
      '0' + now.getHours()
    ).slice(-2)}:${('0' + now.getMinutes()).slice(-2)}:${('0' + now.getSeconds()).slice(-2)}`,
    ok: parameters?.ok ?? true,
  };

  if (typeof parameters?.error === 'string') {
    ret.error = parameters.error;
    ret.ok = false;
  }

  if (typeof parameters?.id === 'string') {
    ret.id = parameters.id;
  }

  if (parameters?.debug !== undefined) {
    ret.debug = parameters.debug;
  }

  return ret;
}

export function getApiResponseWithData<T>(data: T | null): GeneralResponseWithData<T> {
  return {
    ...getApiResponse({ ok: data !== null }),
    data: data ?? undefined,
  };
}

export function getApiResponseEntityList<T>(
  data: T[],
  elementCount: number = 0,
  take: number = 10,
  skip: number = 0,
): GeneralEntityListResponse<T> {
  return {
    ...getApiResponse(),
    data,
    take,
    skip,
    count: elementCount,
  };
}

export function getApiResponseWithEntityList<T>(
  data: EntityListResult<T>,
  debug?: DebugType,
): GeneralEntityListResponse<T> {
  return {
    ...getApiResponse({}),
    data: data.data,
    count: data.count,
    take: data.take,
    skip: data.skip,
    debug,
  };
}

interface HmvErrorOptions extends ErrorOptions {
  publicMessage?: string;
  isPublic?: boolean;
  data?: unknown;
  httpStatus?: number;
}

export class HmvError extends Error {
  isPublic: boolean = false;
  publicMessage: string | undefined;
  data: unknown;
  httpStatus: number = 400;

  constructor(message?: string, options?: HmvErrorOptions) {
    super(message, options);

    if (options !== undefined) {
      const { isPublic = false, publicMessage = undefined, data = undefined } = options;

      this.isPublic = (isPublic ?? false) || typeof publicMessage === 'string';
      this.publicMessage = publicMessage;
      this.data = data;
      this.httpStatus = options?.httpStatus ?? (this.isPublic ? 400 : 500);
    }
  }
}

export const handleApiError = (
  response: NextApiResponse,
  task: string,
  error: unknown = undefined,
  data: object | undefined | null = undefined,
): void => {
  let logMessage = `Error in ${task}`;
  let publicError: string | null = null;
  let httpStatus: number = 400;

  if (typeof error === 'string') {
    logMessage += ` ${error}`;
  } else if (typeof error === 'object' && error !== null) {
    if (error instanceof HmvError) {
      logMessage += ` ${error.message}`;
      if (error.isPublic || typeof error.publicMessage === 'string') {
        publicError = error.publicMessage ?? error.message;
      }
      if (error.httpStatus !== undefined) {
        httpStatus = error.httpStatus;
      }
    } else if (error instanceof Error) {
      logMessage += ` ${error}`;
    } else if ('error' in error && typeof error?.error === 'string') {
      logMessage += ` ${error.error}`;
    } else if ('publicError' in error && typeof error?.publicError === 'string') {
      logMessage += ` ${error.publicError}`;
      publicError = error.publicError;
    }
  }

  if (typeof data === 'object') {
    logMessage += ` (data: ${JSON.stringify(data)})`;
  }

  console.warn(logMessage);

  response.status(httpStatus).end(`Error in ${task}` + (publicError !== null ? `: ${publicError}` : ''));
};
