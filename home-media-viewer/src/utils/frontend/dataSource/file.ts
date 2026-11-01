import type { FileMetaUpdateType, FileResultType, FileSearchType } from '@/types/api/fileTypes';
import type { GeneralResponseWithData, GeneralEntityListResponse, GeneralResponse } from '@/types/api/generalTypes';
import { validateVideoThumbnailTime, type StageStatistics } from '@/types/processingTypes';

export const apiFileUpdateVideoThumbnail = async (id: string, time: number): Promise<FileResultType> => {
  validateVideoThumbnailTime(time);
  const response = await fetch('/api/process/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId: id, stages: ['thumbnails'], mode: 'refresh', videoThumbnailTimeSec: time }),
  });
  const text = await response.text();
  let result: GeneralResponseWithData<{ stages?: { thumbnails?: StageStatistics } }> | undefined;
  try {
    result = JSON.parse(text) as typeof result;
  } catch {
    throw new Error(response.ok ? 'Invalid thumbnail update response' : text || 'Could not update thumbnail');
  }
  if (!response.ok || result?.ok !== true) {
    throw new Error(result?.error ?? 'Could not update thumbnail');
  }
  const counts = result.data?.stages?.thumbnails;
  if (
    counts?.attempted !== 1 ||
    counts.succeeded !== 1 ||
    counts.failed !== 0 ||
    counts.deferred !== 0 ||
    counts.notSupported !== 0
  ) {
    throw new Error('Thumbnail was not updated. Please retry.');
  }
  const file = await apiGetFile(id);
  if (file === null) throw new Error('Thumbnail updated, but the file could not be reloaded');
  return file;
};

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

  return resultData.data ?? null;
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

export const apiFileDisable = async (id: string): Promise<void> => {
  const fetchArgs: RequestInit = {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'Disabled',
    }),
  };

  const fetchResult = await fetch(`/api/file/${id}`, fetchArgs);
  const resultData: GeneralEntityListResponse<FileResultType> = await fetchResult.json();

  if (!resultData.ok) {
    throw Error(resultData.error ?? 'Could not disable file');
  }
};

export const apiFileActivate = async (id: string): Promise<void> => {
  const fetchArgs: RequestInit = {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'Active',
    }),
  };

  const fetchResult = await fetch(`/api/file/${id}`, fetchArgs);
  const resultData: GeneralEntityListResponse<FileResultType> = await fetchResult.json();

  if (!resultData.ok) {
    throw Error(resultData.error ?? 'Could not disable file');
  }
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
    throw Error(resultData.error ?? 'Could not refresh metadata');
  }
};

export const apiFileUpdateMetadata = async (fileId: string, data: FileMetaUpdateType): Promise<void> => {
  const fetchArgs: RequestInit = {
    method: 'PATCH',
    body: JSON.stringify(data),
  };

  const fetchResult = await fetch(`/api/file/${fileId}/metadata`, fetchArgs);
  const resultData: GeneralResponse = await fetchResult.json();

  if (!resultData.ok) {
    throw Error(resultData.error ?? 'Could not update metadata');
  }
};
