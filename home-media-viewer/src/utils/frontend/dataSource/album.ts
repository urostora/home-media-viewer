import { AlbumDataType, AlbumResultType, AlbumSearchType, AlbumUpdateType } from '@/types/api/albumTypes';
import { GeneralEntityListResponse, GeneralResponse, GeneralResponseWithData } from '@/types/api/generalTypes';

export const apiLoadAlbums = async (args: AlbumSearchType): Promise<AlbumResultType[]> => {
  const fetchArgs: RequestInit = {
    method: 'post',
    body: JSON.stringify({
      status: 'Active',
      metadataStatus: 'Processed',
      ...args,
    }),
  };

  const fetchResult = await fetch('/api/album/search', fetchArgs);
  const resultData: GeneralEntityListResponse<AlbumResultType> = await fetchResult.json();

  if (!resultData.ok) {
    throw Error(resultData.error ?? 'Could not load albums');
  }

  if (!Array.isArray(resultData?.data)) {
    throw Error(resultData.error ?? 'Result empty');
  }

  return resultData.data;
};

export const apiAlbumAdd = async (path: string) => {
  const fetchArgs: RequestInit = {
    method: 'PUT',
    body: JSON.stringify({ path }),
  };

  const fetchResult = await fetch('/api/album', fetchArgs);
  const resultData: GeneralResponse = await fetchResult.json();

  if (!resultData.ok) {
    throw Error(resultData.error ?? 'Could not add album');
  }
};

export const apiAlbumUpdate = async (id: string, data: AlbumUpdateType) => {
  const fetchArgs: RequestInit = {
    method: 'PUT',
    body: JSON.stringify(data),
  };

  const fetchResult = await fetch(`/api/album/${id}`, fetchArgs);
  const resultData: GeneralResponse = await fetchResult.json();

  if (!resultData.ok) {
    throw Error(resultData.error ?? 'Could not update album');
  }
};

export const apiAlbumDelete = async (id: string) => {
  const fetchArgs: RequestInit = {
    method: 'DELETE',
  };

  const fetchResult = await fetch(`/api/album/${id}`, fetchArgs);
  const resultData: GeneralResponse = await fetchResult.json();

  if (!resultData.ok) {
    throw Error(resultData.error ?? 'Could not delete album');
  }
};

export const apiAlbumDetails = async (id: string): Promise<AlbumDataType | undefined> => {
  const fetchResult = await fetch(`/api/album/${id}`);
  if (fetchResult.status !== 200) {
    throw Error(`Album fetch status is ${fetchResult.status} (${fetchResult.statusText})`);
  }

  const resultText = await fetchResult.text();
  const resultData: GeneralResponseWithData<AlbumDataType> = JSON.parse(resultText);

  if (typeof resultData?.data?.name !== 'string') {
    throw Error(`Could not parse result (status: ${fetchResult.status}, ${fetchResult.statusText}): ${resultText}`);
  }

  if (!resultData.ok) {
    throw Error(resultData.error ?? 'Could not load album details');
  }

  return resultData.data;
};
