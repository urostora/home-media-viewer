import { isShuttingDownHandler } from '../isShuttingDown';

// P2034 and MariaDB deadlock 1213 both roll back the whole transaction. Raw
// statements expose 1213 through P2010. Prisma 7 stores the driver code inside
// driverAdapterError. Never retry ambiguous connection/write errors.
export const retryMetadataTransaction = async <T>(run: () => Promise<T>): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      const details =
        error !== null && typeof error === 'object'
          ? (error as {
              code?: unknown;
              meta?: {
                code?: unknown;
                driverAdapterError?: { cause?: { kind?: unknown; originalCode?: unknown } };
              };
            })
          : undefined;
      const driver = details?.meta?.driverAdapterError?.cause;
      const rolledBack =
        details?.code === 'P2034' ||
        (details?.code === 'P2010' &&
          (String(details.meta?.code) === '1213' ||
            (driver?.kind === 'TransactionWriteConflict' && String(driver.originalCode) === '1213')));
      if (!rolledBack || attempt >= 3 || isShuttingDownHandler.isShuttingDown()) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20 * 2 ** attempt));
    }
  }
};
