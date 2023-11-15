import { AlbumDetailsType, AlbumResultType, AlbumSearchType } from '@/types/api/albumTypes';
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

  const fetchResult = await fetch('/api/album', fetchArgs);
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
    throw Error(resultData.error ?? 'Could not add albums');
  }
};

export const apiAlbumDelete = async (id: string) => {
  const fetchArgs: RequestInit = {
    method: 'DELETE',
    body: JSON.stringify({ id }),
  };

  const fetchResult = await fetch('/api/album', fetchArgs);
  const resultData: GeneralResponse = await fetchResult.json();

  if (!resultData.ok) {
    throw Error(resultData.error ?? 'Could not add albums');
  }
};

export const apiAlbumDetails = async (id: string): Promise<AlbumDetailsType | undefined> => {
  const fetchResult = await fetch(`/api/album/${id}`);
  if (fetchResult.status !== 200) {
    throw Error(`Album fetch status is ${fetchResult.status} (${fetchResult.statusText})`);
  }

  const resultText = await fetchResult.text();
  const resultData: GeneralResponseWithData<AlbumDetailsType> = JSON.parse(resultText);

  if (typeof resultData?.data?.name !== 'string') {
    throw Error(`Could not parse result (status: ${fetchResult.status}, ${fetchResult.statusText}): ${resultText}`);
  }

  if (!resultData.ok) {
    throw Error(resultData.error ?? 'Could not load album details');
  }

  return resultData.data;
};