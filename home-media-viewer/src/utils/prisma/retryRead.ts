const connectionErrors = new Set(['P1001', 'P1002', 'P1017']);
// MariaDB driver errors wrapped by Prisma 7's P2039: unexpected socket close,
// connection timeout/closure, socket error/timeout, and pool acquisition timeout.
const adapterConnectionErrors = new Set(['45009', '45012', '45013', '45019', '45026', '45028']);

// Call only around a standalone model read. Never wrap a write, raw query or
// transaction: a failed write may already have committed. A fresh PrismaPromise
// must be created on each attempt, so callers supply a function, not a promise.
export const retryRead = async <T>(read: () => PromiseLike<T>): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await read();
    } catch (error) {
      const code =
        error !== null && typeof error === 'object'
          ? 'code' in error
            ? error.code
            : 'errorCode' in error
              ? error.errorCode
              : undefined
          : undefined;
      const adapter =
        error !== null && typeof error === 'object'
          ? (error as { meta?: { driverAdapterError?: { cause?: { kind?: unknown; originalCode?: unknown } } } }).meta
              ?.driverAdapterError?.cause
          : undefined;
      const transient =
        (typeof code === 'string' && connectionErrors.has(code)) ||
        (code === 'P2039' && adapter?.kind === 'mysql' && adapterConnectionErrors.has(String(adapter.originalCode)));
      if (attempt >= 2 || !transient) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
};
