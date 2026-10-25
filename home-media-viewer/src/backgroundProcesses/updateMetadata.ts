import { getWorkerCount, getProcessTimeout } from '@/utils/processes/processConfig';

import updateMetadataProcess from '@/utils/processes/updateMetadataProcess';

const threadCount = getWorkerCount();
const processTimeout = getProcessTimeout();

updateMetadataProcess
  .update(processTimeout, threadCount)
  .then(() => {
    console.log('PROCESSING FINISHED');
  })
  .catch((error) => {
    console.error(`${error}`);
    process.exitCode = 1;
  });
