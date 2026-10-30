import type { NextApiResponse } from 'next';
import { ProcessingOptionsError, type ProcessingOptions } from '@/types/processingTypes';
import { getApiResponseWithData } from '../apiHelpers';
import updateMetadataProcess, { ProcessingFailedError } from './updateMetadataProcess';
import { IndexingBusyError } from './indexingState';

export const respondToProcessing = async (res: NextApiResponse, options: ProcessingOptions): Promise<void> => {
  try {
    const result = await updateMetadataProcess.run(options);
    res.status(200).json({ ...getApiResponseWithData(result), id: options.fileId ?? options.albumId });
  } catch (error) {
    if (error instanceof ProcessingFailedError) {
      res.status(500).json({ ok: false, error: error.message, data: error.statistics });
    } else if (error instanceof IndexingBusyError) {
      res.status(409).json({ ok: false, error: 'Indexing is locked' });
    } else if (error instanceof ProcessingOptionsError) {
      res.status(400).json({ ok: false, error: error.message });
    } else {
      res.status(503).json({ ok: false, error: 'Processing unavailable' });
    }
  }
};
