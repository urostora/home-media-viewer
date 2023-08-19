import { AlbumResultType, AlbumSearchType } from '@/types/api/albumTypes';
import { GeneralEntityListResponse, GeneralResponse } from '@/types/api/generalTypes';

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
