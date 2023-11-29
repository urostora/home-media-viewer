import {
  DebugType,
  EntityType,
  GeneralEntityListResponse,
  GeneralResponse,
  GeneralResponseParameters,
  GeneralResponseWithData,
} from '@/types/api/generalTypes';
import type { NextApiRequest, NextApiResponse } from 'next';

export function getRequestBodyObject<T>(req: NextApiRequest, res?: NextApiResponse): T | null {
  let ret: object | null = null;
  if (typeof req.body === 'string') {
    try {
      const parsedData = JSON.parse(req.body);
      ret = parsedData;
    } catch (ex) {
      return null;
    }
  } else if (typeof req.body === 'object') {
    ret = req.body;
  }

  if (ret == null && res != null) {
    // send bad request response
    res.status(400).end(`Could not parse body as JSON object`);
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
    ok: (parameters?.ok ?? true) === true,
  };

  if (typeof parameters?.error === 'string') {
    ret.error = parameters.error;
    ret.ok = false;
  }

  if (typeof parameters?.id === 'string') {
    ret.id = parameters.id;
  }

  if (parameters?.debug) {
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
  data: Array<T>,
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
  data: Array<T>,
  elementCount: number = 0,
  take: number = 10,
  skip: number = 0,
  debug?: DebugType,
): GeneralEntityListResponse<T> {
  return {
    ...getApiResponse({}),
    data,
    count: elementCount,
    take,
    skip,
    debug,
  };
}

interface HmvErrorOptions extends ErrorOptions {
  publicMessage?: string;
  isPublic?: boolean;
  data?: unknown;
}

export class HmvError extends Error {
  isPublic: boolean = false;
  publicMessage: string | undefined;
  data: unknown;

  constructor(message?: string, options?: HmvErrorOptions) {
    super(message, options);

    if (options) {
      const { isPublic = false, publicMessage = undefined, data = undefined } = options;

      this.isPublic = (isPublic ?? false) || typeof publicMessage === 'string';
      this.publicMessage = publicMessage;
      this.data = data;
    }
  }
}

export const handleApiError = (
  response: NextApiResponse,
  task: string,
  error: unknown = undefined,
  data: object | undefined = undefined,
): void => {
  let logMessage = `Error in ${task}`;
  let publicError: string | null = null;

  if (typeof error === 'string') {
    logMessage += ` ${error}`;
  } else if (typeof error === 'object' && error !== null) {
    if (error instanceof HmvError) {
      logMessage += ` ${error.message}`;
      if (error.isPublic === true || typeof error.publicMessage === 'string') {
        publicError = error.publicMessage ?? error.message;
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

  response.status(400).end(`Error in ${task}` + (publicError ? `: ${publicError}` : ''));
};
