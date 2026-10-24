import type { Prisma } from '@prisma/client';

const readActions = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);
const connectionErrors = new Set(['P1001', 'P1002', 'P1017']);

// Only retry reads outside transactions: a failed write may already have committed.
export const retryRead: Prisma.Middleware = async (params, next) => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await next(params);
    } catch (error) {
      const code =
        error !== null && typeof error === 'object'
          ? 'code' in error
            ? error.code
            : 'errorCode' in error
              ? error.errorCode
              : undefined
          : undefined;
      if (
        params.runInTransaction ||
        !readActions.has(params.action) ||
        attempt >= 2 ||
        typeof code !== 'string' ||
        !connectionErrors.has(code)
      ) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
};
