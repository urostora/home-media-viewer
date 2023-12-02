import { GeneralResponseWithData } from '@/types/api/generalTypes';
import { fetchDataFromApi } from './helpers/helper';
import { UserDataType } from '@/types/api/userTypes';
import { AlbumDataType } from '@/types/api/albumTypes';
import { getAlbumData } from './helpers/album.helper';

const APP_ALBUM_ROOT_PATH = process.env.APP_ALBUM_ROOT_PATH;

const createAlbumPath = 'album';
const getExactAlbumPath = (id: string): string => {
  return `album/${id}`;
};

describe('web/api/album', () => {
  const parentAlbumPath = 'testalbum01';
  let parentAlbumId: string | undefined = undefined;

  const albumIdsAdded: string[] = [];

  beforeAll(async () => {
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

  it('create album', async () => {
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
  });

  it('create album with parent', async () => {
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
  });
});
