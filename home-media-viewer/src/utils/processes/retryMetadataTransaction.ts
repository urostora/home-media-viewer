import { isShuttingDownHandler } from '../isShuttingDown';

// P2034 means the whole transaction was rolled back. Never retry ambiguous connection/write errors.
export const retryMetadataTransaction = async <T>(run: () => Promise<T>): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      const code = error !== null && typeof error === 'object' && 'code' in error ? error.code : undefined;
      if (code !== 'P2034' || attempt >= 3 || isShuttingDownHandler.isShuttingDown()) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20 * 2 ** attempt));
    }
  }
};
