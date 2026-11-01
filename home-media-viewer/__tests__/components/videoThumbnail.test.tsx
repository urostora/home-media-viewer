import '@testing-library/jest-dom';
import 'whatwg-fetch';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { rest } from 'msw';
import ContentDisplay from '@/components/content/contentDisplay';
import ContentList from '@/components/content/contentList';
import BrowserContentList from '@/components/content/browserContentList';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
import { AuthContext } from '@/components/auth/authContext';
import { apiFileUpdateVideoThumbnail } from '@/utils/frontend/dataSource/file';
import { getThumbnailUrl } from '@/utils/frontend/contentUtils';
import type { FileResultType } from '@/types/api/fileTypes';

const file: FileResultType = {
  id: 'video-one',
  name: 'Sample',
  extension: 'mp4',
  path: 'sample.mp4',
  isDirectory: false,
  status: 'Active',
  createdAt: '',
  modifiedAt: '',
  contentDate: null,
  size: 123,
  hash: null,
  metadataStatus: 'Processed',
  metadataProcessedAt: null,
  metadataProcessingError: null,
  thumbnailStatus: 'Processed',
  thumbnailProcessedAt: null,
  parentFileId: null,
  metas: [],
  thumbnail: 'old',
};
const updated = { ...file, thumbnail: 'new', thumbnailProcessedAt: new Date('2026-11-01T12:00:00Z') };
const counts = { attempted: 1, succeeded: 1, failed: 0, deferred: 0, notSupported: 0 };
let requests: unknown[] = [];
const server = setupServer(
  rest.post('/api/process/run', async (req, res, ctx) => {
    requests.push(await req.json());
    return res(ctx.json({ ok: true, data: { stages: { thumbnails: counts } } }));
  }),
  rest.get('/api/file/video-one', (_req, res, ctx) => res(ctx.json({ ok: true, data: updated }))),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  requests = [];
});
afterAll(() => server.close());

function ready(container: HTMLElement, time = 0): HTMLVideoElement {
  const video = container.querySelector('video')!;
  Object.defineProperties(video, {
    readyState: { configurable: true, value: 2 },
    duration: { configurable: true, value: 10 },
    currentTime: { configurable: true, writable: true, value: time },
    seeking: { configurable: true, value: false },
  });
  fireEvent.loadedData(video);
  return video;
}
const preview = (content = file, isAdmin = true, onThumbnailUpdated = jest.fn()) => (
  <AuthContext.Provider value={{ isLoggedIn: true, isAdmin }}>
    <ContentDisplay content={content} onThumbnailUpdated={onThumbnailUpdated} />
  </AuthContext.Provider>
);

it.each([0, 1.25])('sends a thumbnail-only refresh at %s seconds and reloads thumbnail data', async (time) => {
  const result = await apiFileUpdateVideoThumbnail(file.id, time);
  expect(result.thumbnail).toBe('new');
  expect(requests).toEqual([{ fileId: file.id, stages: ['thumbnails'], mode: 'refresh', videoThumbnailTimeSec: time }]);
});

it.each([403, 409, 500, 503])('reports HTTP %s failures', async (status) => {
  server.use(
    rest.post('/api/process/run', (_req, res, ctx) =>
      res(ctx.status(status), ctx.json({ ok: false, error: 'Rejected' })),
    ),
  );
  await expect(apiFileUpdateVideoThumbnail(file.id, 1)).rejects.toThrow('Rejected');
});

it('handles text authorization errors and malformed successful responses', async () => {
  server.use(
    rest.post('/api/process/run', (_req, res, ctx) => res(ctx.status(403), ctx.text('Only administrators allowed'))),
  );
  await expect(apiFileUpdateVideoThumbnail(file.id, 1)).rejects.toThrow('Only administrators allowed');
  server.use(rest.post('/api/process/run', (_req, res, ctx) => res(ctx.text('invalid'))));
  await expect(apiFileUpdateVideoThumbnail(file.id, 1)).rejects.toThrow('Invalid thumbnail update response');
});

it.each([
  undefined,
  { ...counts, attempted: 0, succeeded: 0 },
  { ...counts, succeeded: 0, deferred: 1 },
  { ...counts, succeeded: 0, notSupported: 1 },
])('does not report success when processing did not update the target (%j)', async (thumbnails) => {
  server.use(
    rest.post('/api/process/run', (_req, res, ctx) => res(ctx.json({ ok: true, data: { stages: { thumbnails } } }))),
  );
  await expect(apiFileUpdateVideoThumbnail(file.id, 1)).rejects.toThrow('Thumbnail was not updated');
});

it.each([-1, NaN, Infinity])('rejects invalid time %s without a request', async (time) => {
  await expect(apiFileUpdateVideoThumbnail(file.id, time)).rejects.toThrow('finite nonnegative');
  expect(requests).toHaveLength(0);
});

it('only exposes the action on administrator video previews', () => {
  const { rerender } = render(preview(file, false));
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  rerender(preview({ ...file, extension: 'jpg' }));
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  rerender(preview());
  expect(screen.getByRole('button', { name: 'Use current frame as thumbnail' })).toBeDisabled();
});

it('captures click-time playback position, blocks duplicate submissions, and preserves playback', async () => {
  server.use(
    rest.post('/api/process/run', async (req, res, ctx) => {
      requests.push(await req.json());
      return res(ctx.delay(80), ctx.json({ ok: true, data: { stages: { thumbnails: counts } } }));
    }),
  );
  const changed = jest.fn();
  const { container } = render(preview(file, true, changed));
  const video = ready(container);
  video.currentTime = 2.75;
  const button = screen.getByRole('button');
  fireEvent.click(button);
  fireEvent.click(button);
  expect(button).toBeDisabled();
  await screen.findByText('Thumbnail updated');
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ videoThumbnailTimeSec: 2.75 });
  expect(changed).toHaveBeenCalledWith(expect.objectContaining({ id: file.id, thumbnail: 'new' }));
  expect(video.currentTime).toBe(2.75);
  expect(container.querySelector('video')).toBe(video);
});

it('disables capture during seeking, at the end, and after media errors', () => {
  const { container } = render(preview());
  const video = ready(container);
  const button = screen.getByRole('button');
  expect(button).toBeEnabled();
  Object.defineProperty(video, 'seeking', { configurable: true, value: true });
  fireEvent.seeking(video);
  expect(button).toBeDisabled();
  Object.defineProperty(video, 'seeking', { configurable: true, value: false });
  fireEvent.seeked(video);
  expect(button).toBeEnabled();
  video.currentTime = 10;
  fireEvent.timeUpdate(video);
  expect(button).toBeDisabled();
  video.currentTime = 0;
  fireEvent.seeked(video);
  expect(button).toBeEnabled();
  fireEvent.error(video);
  expect(button).toBeDisabled();
});

it('shows errors and permits retry', async () => {
  server.use(
    rest.post('/api/process/run', (_req, res, ctx) =>
      res(ctx.status(409), ctx.json({ ok: false, error: 'Indexing is locked' })),
    ),
  );
  const { container } = render(preview());
  ready(container);
  fireEvent.click(screen.getByRole('button'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Indexing is locked');
  expect(screen.getByRole('button')).toBeEnabled();
  server.resetHandlers();
  fireEvent.click(screen.getByRole('button'));
  await screen.findByText('Thumbnail updated');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('loads a fresh player on navigation and keeps late feedback out of the new preview', async () => {
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  server.use(
    rest.post('/api/process/run', async (_req, res, ctx) => {
      await gate;
      return res(ctx.json({ ok: true, data: { stages: { thumbnails: counts } } }));
    }),
  );
  const changed = jest.fn();
  const { container, rerender } = render(preview(file, true, changed));
  const first = ready(container, 1.5);
  fireEvent.click(screen.getByRole('button'));
  rerender(preview({ ...file, id: 'video-two' }, true, changed));
  expect(container.querySelector('video')).not.toBe(first);
  expect(container.querySelector('video')).toHaveAttribute('src', '/api/file/content/video-two');
  expect(screen.getByRole('button')).toBeDisabled();
  await act(async () => {
    finish();
  });
  await waitFor(() => expect(changed).toHaveBeenCalledWith(expect.objectContaining({ id: file.id })));
  expect(screen.queryByText('Thumbnail updated')).not.toBeInTheDocument();
});

it('replaces gallery and album inline thumbnails after an update without interrupting the preview', async () => {
  const metadataChanged = jest.fn();
  const { container } = render(
    <AuthContext.Provider value={{ isLoggedIn: true, isAdmin: true }}>
      <ContentList
        onFileChanged={metadataChanged}
        data={[
          file,
          { id: 'album', name: 'Album', status: 'Active', thumbnailFile: { id: file.id, thumbnailImage: 'old' } },
        ]}
      />
    </AuthContext.Provider>,
  );
  fireEvent.click(container.querySelector('[data-id="video-one"]')!);
  const video = ready(container, 1.5);
  fireEvent.click(screen.getByRole('button', { name: 'Use current frame as thumbnail' }));
  await screen.findByText('Thumbnail updated');
  expect(screen.getByAltText('Sample')).toHaveAttribute('src', 'data:image/jpeg;base64,new');
  expect(screen.getByAltText('Album')).toHaveAttribute('src', 'data:image/jpeg;base64,new');
  expect(metadataChanged).not.toHaveBeenCalled();
  expect(container.querySelector('video')).toBe(video);
});

it('versions URL thumbnails while preserving existing callers without a version', () => {
  expect(getThumbnailUrl('id')).toBe('/api/file/thumbnail/id/200');
  expect(getThumbnailUrl('id', 600, updated.thumbnailProcessedAt)).toBe(
    '/api/file/thumbnail/id/600?v=2026-11-01T12%3A00%3A00.000Z',
  );
});

it('refreshes browser cards and still navigates after replacing a stored file', async () => {
  server.use(
    rest.get('/api/browse/test', (_req, res, ctx) =>
      res(
        ctx.json({
          ok: true,
          data: {
            albumContains: [],
            content: [file, { ...file, id: 'video-two', name: 'Second' }].map((storedFile) => ({
              name: storedFile.name,
              path: storedFile.id,
              isDirectory: false,
              size: 123,
              storedFile,
            })),
          },
        }),
      ),
    ),
  );
  const { container } = render(
    <AuthContext.Provider value={{ isLoggedIn: true, isAdmin: true }}>
      <BrowserContentList path="test" />
    </AuthContext.Provider>,
  );
  fireEvent.click(await screen.findByText('Sample'));
  const video = ready(container, 0);
  fireEvent.click(screen.getByRole('button', { name: 'Use current frame as thumbnail' }));
  await screen.findByText('Thumbnail updated');
  expect(container.querySelector('[style*="base64,new"]')).toBeInTheDocument();
  expect(container.querySelector('video')).toBe(video);
  fireEvent.click(screen.getByText('>'));
  expect(container.querySelector('video')).toHaveAttribute('src', '/api/file/content/video-two');
});
