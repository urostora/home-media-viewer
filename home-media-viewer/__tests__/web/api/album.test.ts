import { fetchDataFromApi } from './helpers/helper';
import { getAlbumData } from './helpers/album.helper';
import { getTestFilesInPath } from './helpers/file.helper';

import type { AlbumDataType, AlbumUpdateType } from '@/types/api/albumTypes';
import type { FileResultType, FileSearchType } from '@/types/api/fileTypes';
import type { GeneralEntityListResponse, GeneralResponseWithData } from '@/types/api/generalTypes';
import type { UserDataType } from '@/types/api/userTypes';

const APP_ALBUM_ROOT_PATH = process.env.APP_ALBUM_ROOT_PATH;

const createAlbumPath = 'album';
const getExactAlbumPath = (id: string): string => {
  return `album/${id}`;
};
const getExactFilePath = (id: string): string => {
  return `file/${id}`;
};

const searchFilesPath = 'file/search';

describe('web/api/album', () => {
  const parentAlbumPath = 'testalbum01';
  let parentAlbumId: string | undefined;

  const hierarchyMiddleAlbumPath = 'albumHierarchy/depth01/depth02';
  let hierarchyMiddleAlbumId: string | undefined;

  const albumIdsAdded: string[] = [];

  beforeAll(async () => {
    if (parentAlbumId !== undefined) {
      return;
    }

    // add testalbum01
    const addParentAlbumResult = await fetchDataFromApi<GeneralResponseWithData<AlbumDataType>>(
      createAlbumPath,
      { path: parentAlbumPath },
      'POST',
    );

    expect(addParentAlbumResult.ok).toBe(true);
    expect(typeof addParentAlbumResult?.data?.id).toBe('string');

    if (typeof addParentAlbumResult?.data?.id === 'string') {
      parentAlbumId = addParentAlbumResult?.data?.id;
      albumIdsAdded.push(parentAlbumId);
    }

    // add hierarchy depth02 album
    const addHierarchyMiddleAlbumResult = await fetchDataFromApi<GeneralResponseWithData<AlbumDataType>>(
      createAlbumPath,
      { path: hierarchyMiddleAlbumPath },
      'POST',
    );

    expect(addHierarchyMiddleAlbumResult.ok).toBe(true);
    expect(typeof addHierarchyMiddleAlbumResult?.data?.id).toBe('string');

    if (typeof addHierarchyMiddleAlbumResult?.data?.id === 'string') {
      hierarchyMiddleAlbumId = addHierarchyMiddleAlbumResult?.data?.id;
      albumIdsAdded.push(hierarchyMiddleAlbumId);
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

  it('should update album', async () => {
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

  it('should create album in directory that includes an existing album', async () => {
    if (typeof hierarchyMiddleAlbumId !== 'string') {
      throw Error('Could not create parent album');
    }

    const path = 'albumHierarchy/depth01';

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
    expect(savedAlbum.name).toBe('depth01');

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
    const expectedFiles = getTestFilesInPath('albumHierarchy/depth01', true);

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

    // check if depth03 has parent directory (depth02) added with new album
    const childPath = 'albumHierarchy/depth01/depth02/depth03';
    const childSearchParameters: FileSearchType = {
      status: ['Active'],
      pathIsExactly: childPath,
    };

    const directoryDepth03Result = await fetchDataFromApi<GeneralEntityListResponse<FileResultType>>(
      searchFilesPath,
      childSearchParameters,
      'POST',
    );

    expect(directoryDepth03Result.ok).toBe(true);
    expect(Array.isArray(directoryDepth03Result?.data)).toBe(true);
    expect(directoryDepth03Result.data.length).toBeGreaterThan(0);

    const depth03Directory = directoryDepth03Result.data[0];

    expect(depth03Directory.parentFileId).not.toBeNull();

    const depth03ParentId = depth03Directory.parentFileId;
    if (depth03ParentId === null) {
      return;
    }

    const directoryDepth03ParentResult = await fetchDataFromApi<GeneralResponseWithData<FileResultType>>(
      getExactFilePath(depth03ParentId),
    );

    expect(directoryDepth03ParentResult.ok).toBe(true);
    expect(directoryDepth03ParentResult?.data).not.toBeNull();
    expect(directoryDepth03ParentResult.data?.path).toBe('albumHierarchy/depth01/depth02');
  });
});
