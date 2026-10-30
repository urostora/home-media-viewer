import { getWorkerCount, getProcessTimeout } from '@/utils/processes/processConfig';
import updateMetadataProcess from '@/utils/processes/updateMetadataProcess';
import { parseProcessingCli } from '@/utils/processes/processingCli';
import prisma from '@/utils/prisma/prismaImporter';

const main = async (): Promise<void> => {
  const options = parseProcessingCli(process.argv.slice(2));
  const result = await updateMetadataProcess.run({
    ...options,
    workers: options.workers ?? getWorkerCount(),
    timeoutSec: options.timeoutSec ?? getProcessTimeout(),
  });
  console.log(JSON.stringify(result));
  if (result.outcome === 'partial') process.exitCode = 2;
};
void main()
  .catch(() => {
    console.error('Processing failed; check stage status and options');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
