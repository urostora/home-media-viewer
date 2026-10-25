import { execFile } from 'node:child_process';
import { isShuttingDownHandler } from './isShuttingDown';

// Asynchronous tools keep the event loop responsive to health probes and shutdown.
export const mediaCommand = async (executable: string, args: string[]): Promise<string> => {
  if (isShuttingDownHandler.isShuttingDown()) throw new Error('Shutting down');
  return await new Promise((resolve, reject) => {
    const child = execFile(
      executable,
      args,
      { timeout: 30000, killSignal: 'SIGKILL', maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        process.removeListener('SIGTERM', stop);
        process.removeListener('SIGINT', stop);
        if (error !== null) reject(new Error('Media command failed or timed out'));
        else resolve(args.includes('-print_format') ? stdout : stdout + stderr);
      },
    );
    const stop = (): void => {
      child.kill('SIGTERM');
    };
    process.once('SIGTERM', stop);
    process.once('SIGINT', stop);
  });
};
