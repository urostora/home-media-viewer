import { FileResultType, FileSearchType } from '@/types/api/fileTypes';
import { GeneralEntityListResponse } from '@/types/api/generalTypes';

export const apiLoadFiles = async (args: FileSearchType): Promise<FileResultType[]> => {
  const fetchArgs: RequestInit = {
    method: 'post',
    body: JSON.stringify({
      status: 'Active',
      metadataStatus: 'Processed',
      ...args,
    }),
  };

  const fetchResult = await fetch('/api/file', fetchArgs);
  const resultData: GeneralEntityListResponse<FileResultType> = await fetchResult.json();

  if (!resultData.ok) {
    throw Error(resultData.error ?? 'Could not load files');
  }

  if (!Array.isArray(resultData?.data)) {
    throw Error(resultData.error ?? 'Result contains no file list');
  }

  return resultData.data;
};
