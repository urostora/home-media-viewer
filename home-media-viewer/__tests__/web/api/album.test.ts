import { GeneralEntityListResponse, GeneralResponseWithData } from '@/types/api/generalTypes';
import { fetchDataFromApi } from './helpers/helper';
import { UserDataType } from '@/types/api/userTypes';
import { AlbumDataType, AlbumUpdateType } from '@/types/api/albumTypes';
import { getAlbumData } from './helpers/album.helper';
import { FileResultType, FileSearchType } from '@/types/api/fileTypes';
import { getTestFilesInPath } from './helpers/file.helper';

const APP_ALBUM_ROOT_PATH = process.env.APP_ALBUM_ROOT_PATH;

const createAlbumPath = 'album';
const getExactAlbumPath = (id: string): string => {
  return `album/${id}`;
};

const searchFilesPath = 'file/search';

describe('web/api/album', () => {
  const parentAlbumPath = 'testalbum01';
  let parentAlbumId: string | undefined = undefined;

  const albumIdsAdded: string[] = [];

  beforeAll(async () => {
    if (parentAlbumId !== undefined) {
      return;
    }

    const result = await fetchDataFromApi<GeneralResponseWithData<AlbumDataType>>(
      createAlbumPath,
      { path: parentAlbumPath },
      'POST',
    );

    expect(result.ok).toBe(true);
    expect(typeof result?.data?.id).toBe('string');

    if (typeof result?.data?.id === 'string') {
      parentAlbumId = result?.data?.id;
      albumIdsAdded.push(parentAlbumId);
    }
  });

  afterAll(async () => {
    // delete created users
    for (const albumId of albumIdsAdded) {
      try {
        await fetchDataFromApi<GeneralResponseWithData<UserDataType>>(getExactAlbumPath(albumId), undefined, 'DELETE');
      } catch {
        // eslint-disable-next-line no-empty
      }
    }
  });

  it('should create album', async () => {
    const path = 'testalbum02';

    const result = await fetchDataFromApi<GeneralResponseWithData<AlbumDataType>>(createAlbumPath, { path }, 'POST');

    expect(result?.ok).toBe(true);
    expect(typeof result?.data).toBe('object');
    expect(typeof result?.data?.id).toBe('string');

    if (typeof result?.data?.id !== 'string') {
      return;
    }

    const createdId = result?.data?.id;
    albumIdsAdded.push(createdId);

    // get added album from API
    const savedAlbum = await getAlbumData(createdId);

    expect(savedAlbum).not.toBeNull();

    if (savedAlbum === null) {
      return;
    }

    expect(savedAlbum.basePath).toBe(`${APP_ALBUM_ROOT_PATH}/${path}`);
    expect(savedAlbum.sourceType).toBe('File');
    expect(savedAlbum.status).toBe('Active');
    expect(savedAlbum.name).toBe(path);

    // get files connected to album
    const fileSearchParameters: FileSearchType = {
      status: ['Active'],
      album: {
        id: createdId,
      },
    };

    const filesConnectedToAlbumCreated = await fetchDataFromApi<GeneralEntityListResponse<FileResultType>>(
      searchFilesPath,
      fileSearchParameters,
      'POST',
    );

    console.log('FilesConnected', filesConnectedToAlbumCreated);

    // check attached files (1 file expected)
    const expectedFiles = getTestFilesInPath('testalbum02', true);

    console.log('Files expected', expectedFiles);

    expect(filesConnectedToAlbumCreated.ok).toBe(true);
    expect(filesConnectedToAlbumCreated.count).toBe(expectedFiles.length);
    expect(Array.isArray(filesConnectedToAlbumCreated?.data)).toBe(true);
    expect(filesConnectedToAlbumCreated.data.length).toBe(expectedFiles.length);

    for (const testFile of expectedFiles) {
      expect(
        filesConnectedToAlbumCreated.data.filter(
          (f) => f.name === testFile.name && f.isDirectory === testFile.isDirectory,
        ).length,
      ).toBe(1);
    }
  });

  it('should create album and connect to parent', async () => {
    if (typeof parentAlbumId !== 'string') {
      throw Error('Could not create parent album');
    }

    const path = 'testalbum01/testalbum0101';

    const result = await fetchDataFromApi<GeneralResponseWithData<AlbumDataType>>(createAlbumPath, { path }, 'POST');

    expect(result?.ok).toBe(true);
    expect(typeof result?.data).toBe('object');
    expect(typeof result?.data?.id).toBe('string');

    if (typeof result?.data?.id !== 'string') {
      return;
    }

    const createdId = result?.data?.id;
    albumIdsAdded.push(createdId);

    // get added album from API

    const savedAlbum = await getAlbumData(createdId);

    expect(savedAlbum).not.toBeNull();

    if (savedAlbum === null) {
      return;
    }

    expect(savedAlbum.basePath).toBe(`${APP_ALBUM_ROOT_PATH}/${path}`);
    expect(savedAlbum.sourceType).toBe('File');
    expect(savedAlbum.status).toBe('Active');
    expect(savedAlbum.name).toBe('testalbum0101');
    expect(savedAlbum.parentAlbumId).toBe(parentAlbumId);

    // get files connected to album
    const fileSearchParameters: FileSearchType = {
      status: ['Active'],
      album: {
        id: createdId,
      },
    };

    const filesConnectedToAlbumCreated = await fetchDataFromApi<GeneralEntityListResponse<FileResultType>>(
      searchFilesPath,
      fileSearchParameters,
      'POST',
    );

    // check attached files
    const expectedFiles = getTestFilesInPath('testalbum01/testalbum0101', true);

    expect(filesConnectedToAlbumCreated.ok).toBe(true);
    expect(filesConnectedToAlbumCreated.count).toBe(expectedFiles.length);
    expect(Array.isArray(filesConnectedToAlbumCreated?.data)).toBe(true);
    expect(filesConnectedToAlbumCreated.data.length).toBe(expectedFiles.length);

    for (const testFile of expectedFiles) {
      expect(
        filesConnectedToAlbumCreated.data.filter(
          (f) => f.name === testFile.name && f.isDirectory === testFile.isDirectory,
        ).length,
      ).toBe(1);
    }
  });

  it('update album', async () => {
    if (typeof parentAlbumId !== 'string') {
      throw Error('Could not create parent album');
    }

    const originalAlbumData = await getAlbumData(parentAlbumId);
    if (originalAlbumData == null) {
      throw Error('Could not get parent album data');
    }

    expect(originalAlbumData?.id).toBe(parentAlbumId);
    expect(typeof originalAlbumData?.name).toBe('string');
    expect(typeof originalAlbumData?.status).toBe('string');

    const updateData: AlbumUpdateType = { name: originalAlbumData.name + '_mod', status: 'Disabled' };

    const updateResult = await fetchDataFromApi<GeneralResponseWithData<AlbumDataType>>(
      getExactAlbumPath(parentAlbumId),
      updateData,
      'PATCH',
    );

    expect(updateResult?.ok).toBe(true);
    expect(typeof updateResult?.data).toBe('object');
    expect(typeof updateResult?.data?.id).toBe('string');

    if (typeof updateResult?.data?.id !== 'string') {
      return;
    }

    const newAlbumData = await getAlbumData(parentAlbumId);
    if (newAlbumData == null) {
      throw Error('Could not get parent album data');
    }

    expect(newAlbumData?.id).toBe(parentAlbumId);
    expect(typeof newAlbumData?.name).toBe('string');
    expect(newAlbumData?.name).toBe(updateData.name);
    expect(typeof newAlbumData?.status).toBe('string');
    expect(newAlbumData?.status).toBe(updateData.status);
  });
});
