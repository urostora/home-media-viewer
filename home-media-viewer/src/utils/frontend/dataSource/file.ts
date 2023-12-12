import type { FileResultType, FileSearchType } from '@/types/api/fileTypes';
import type { GeneralResponseWithData, GeneralEntityListResponse } from '@/types/api/generalTypes';

export const apiGetFile = async (id: string): Promise<FileResultType | null> => {
  const fetchResult = await fetch(`/api/file/${id}`);

  if (!fetchResult.ok) {
    const responseText = await fetchResult.text();
    throw Error(responseText.length > 0 ? responseText : `Error while loading file data`);
  }

  const resultData: GeneralResponseWithData<FileResultType> = await fetchResult.json();

  if (!resultData.ok) {
    throw Error(resultData.error ?? 'Could not load files');
  }

  if (!Array.isArray(resultData?.data)) {
    throw Error(resultData.error ?? 'Result contains no file list');
  }

  return resultData.data;
};

export const apiLoadFiles = async (args: FileSearchType): Promise<FileResultType[]> => {
  const fetchArgs: RequestInit = {
    method: 'post',
    body: JSON.stringify({
      status: 'Active',
      metadataStatus: 'Processed',
      ...args,
    }),
  };

  const fetchResult = await fetch('/api/file/search', fetchArgs);
  const resultData: GeneralEntityListResponse<FileResultType> = await fetchResult.json();

  if (!resultData.ok) {
    throw Error(resultData.error ?? 'Could not load files');
  }

  if (!Array.isArray(resultData?.data)) {
    throw Error(resultData.error ?? 'Result contains no file list');
  }

  return resultData.data;
};

export const apiFileDelete = async (id: string): Promise<void> => {
  const fetchArgs: RequestInit = {
    method: 'DELETE',
  };

  const fetchResult = await fetch(`/api/file/${id}`, fetchArgs);
  const resultData: GeneralEntityListResponse<FileResultType> = await fetchResult.json();

  if (!resultData.ok) {
    throw Error(resultData.error ?? 'Could not delete file');
  }
};

export const apiFileRefreshMetadata = async (id: string): Promise<void> => {
  const fetchArgs: RequestInit = {
    method: 'post',
    body: JSON.stringify({
      id,
    }),
  };

  const fetchResult = await fetch('/api/file/metadata', fetchArgs);
  const resultData: GeneralEntityListResponse<FileResultType> = await fetchResult.json();

  if (!resultData.ok) {
    throw Error(resultData.error ?? 'Could not update metadata');
  }
};
