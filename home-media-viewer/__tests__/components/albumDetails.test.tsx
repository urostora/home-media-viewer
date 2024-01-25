import '@testing-library/jest-dom'
import 'whatwg-fetch'
import {setupServer} from 'msw/node';
import { render, screen, waitForElementToBeRemoved } from '@testing-library/react'

import { type AsyncResponseResolverReturnType, type DefaultBodyType, type MockedResponse, rest} from 'msw'

import AlbumDetails from "@/components/content/albumDetails";
import { getApiResponseWithData } from '@/utils/apiHelpers';

import type { AlbumExtendedDataType } from '@/types/api/albumTypes';

const SAMPLE_DATA: AlbumExtendedDataType = {
  id: 'qwer-1234',
  status: 'Active',
  name: 'Test album name',
  sourceType: 'File',
  basePath: 'albumRoot/album1',
  connectionString: 'file://albumRoot/album1',
  parentAlbumId: null,
  fileStatus: [
    {
      metadataStatus: 'New',
      fileCount: 1,
    },
    {
      metadataStatus: 'Processed',
      fileCount: 3,
    },
    {
      metadataStatus: 'Failed',
      fileCount: 2,
    },
  ]
};

const server = setupServer(
  rest.get('/api/album/asdf-1234', (req, res, ctx): AsyncResponseResolverReturnType<MockedResponse<DefaultBodyType>> => {
    // return album details
    return res(ctx.json(getApiResponseWithData<AlbumExtendedDataType>(SAMPLE_DATA)));
  }),
  rest.get('/api/album/qwer', (req, res, ctx): AsyncResponseResolverReturnType<MockedResponse<DefaultBodyType>> => {
    return res(ctx.status(400));
  }),
);

beforeAll(() => { server.listen() });
afterEach(() => { server.resetHandlers() });
afterAll(() => { server.close() }) ;


describe('component/contents/AlbumDetails', () => {
  it('shows loading message at first render', async () => {
    render(<AlbumDetails albumId="qwer" />);

    screen.getByText(/Loading album details/i);
  });

  it('show empty element without albumId set', async () => {
    const { container } = render(<AlbumDetails />);

    expect(container).toBeEmptyDOMElement();
  });

  it('show album found in database', async () => {
    render(<AlbumDetails albumId="asdf-1234" />);

    await screen.findByText('Name:', undefined, { timeout: 2000 });

    screen.getByText(/Test album name/i)
    screen.getByText(/qwer-1234/i)

    screen.getByText(/6 \(/)
    screen.getByText(/New: 1/i)
    screen.getByText(/Processed: 3/i)
    screen.getByText(/Failed: 2/i)
  });

  it('show error when album not exists', async () => {
    render(<AlbumDetails albumId="qwer" />);

    await waitForElementToBeRemoved(() => screen.getByText(/Loading/i))

    await screen.findByText(/Could not load/i, undefined, { timeout: 2000 })

    screen.getByText(/Could not load/i);
  });
});
