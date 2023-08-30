import os from 'os';

import updateMetadataProcess from '@/utils/processes/updateMetadataProcess';

const threadCount = Math.max(1, os.cpus().length - 2);
const processTimeout = Number.parseInt(process.env?.LONG_PROCESS_TIMEOUT_SEC ?? '50');

updateMetadataProcess.update(processTimeout, threadCount).then(() => {
  console.log('PROCESSING FINISHED');
});
