import { fetchDataFromApi } from './helper';
import { GeneralResponseWithData } from '@/types/api/generalTypes';
import { AlbumExtendedDataType } from '@/types/api/albumTypes';

export const getAlbumData = async (id: string): Promise<AlbumExtendedDataType | null> => {
  const path = `album/${id}`;

  const response = await fetchDataFromApi<GeneralResponseWithData<AlbumExtendedDataType>>(path);

  return response?.data ?? null;
};
