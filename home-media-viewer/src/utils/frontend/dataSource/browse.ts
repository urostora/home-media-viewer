import { type BrowseResult } from '@/types/api/browseTypes';
import { type GeneralResponseWithData } from '@/types/api/generalTypes';

export const apiBrowse = async (relativePath: string = ''): Promise<BrowseResult> => {
  const fetchArgs: RequestInit = {
    method: 'get',
  };

  const fetchResult = await fetch(`/api/browse/${encodeURI(relativePath)}`, fetchArgs);

  if (!fetchResult.ok) {
    const errorText = await fetchResult.text();
    throw Error(errorText);
  }

  const resultData: GeneralResponseWithData<BrowseResult> = await fetchResult.json();

  if (!resultData.ok) {
    throw Error(resultData.error ?? 'Could not load files');
  }

  if (resultData?.data === undefined) {
    throw Error(resultData.error ?? 'Response data not found');
  }

  if (!Array.isArray(resultData?.data?.content)) {
    throw Error(resultData.error ?? 'Result contains no file list');
  }

  return resultData.data;
};
