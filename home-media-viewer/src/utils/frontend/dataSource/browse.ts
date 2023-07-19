import { BrowseResult } from '@/types/api/browseTypes';
import { GeneralResponseWithData } from '@/types/api/generalTypes';

export const apiBrowse = async (relativePath: string = ''): Promise<BrowseResult> => {
  const fetchArgs: RequestInit = {
    method: 'get',
  };

  const fetchResult = await fetch(`/api/browse?relativePath=${encodeURI(relativePath)}`, fetchArgs);
  const resultData: GeneralResponseWithData<BrowseResult> = await fetchResult.json();

  if (!resultData.ok) {
    throw Error(resultData.error ?? 'Could not load files');
  }

  if (!Array.isArray(resultData?.data)) {
    throw Error(resultData.error ?? 'Result contains no file list');
  }

  return resultData.data;
};
