import '@testing-library/jest-dom';
import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { AuthContext } from '@/components/auth/authContext';
import ContentFilter from '@/components/content/filter/contentFilter';
import LocationMetadataDisplay from '@/components/content/locationMetadataDisplay';
import { apiFileUpdateMetadata } from '@/utils/frontend/dataSource/file';
import type { FileResultType } from '@/types/api/fileTypes';

jest.mock('../../src/utils/frontend/dataSource/file', () => ({ apiFileUpdateMetadata: jest.fn() }));

const file: FileResultType = {
  id: 'location-file',
  status: 'Active',
  path: '/photo.jpg',
  name: 'photo',
  extension: 'jpg',
  isDirectory: false,
  createdAt: '2026-10-25',
  modifiedAt: '2026-10-25',
  contentDate: null,
  size: null,
  hash: null,
  metadataStatus: 'Processed',
  metadataProcessedAt: null,
  metadataProcessingError: null,
  thumbnailStatus: 'New',
  thumbnailProcessedAt: null,
  parentFileId: null,
  metas: [],
  thumbnail: null,
};

let consoleError: jest.SpyInstance;
let consoleWarn: jest.SpyInstance;
beforeEach(() => {
  sessionStorage.clear();
  jest.mocked(apiFileUpdateMetadata).mockReset();
  // Keep console output visible while asserting that React reports no warnings.
  consoleError = jest.spyOn(console, 'error');
  consoleWarn = jest.spyOn(console, 'warn');
});
afterEach(() => {
  try {
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
  } finally {
    consoleError.mockRestore();
    consoleWarn.mockRestore();
  }
});

describe('location maps with real Pigeon Maps in Strict Mode', () => {
  it('renders the search crosshair, zooms and applies the location filter without injected DOM props', () => {
    const onFilterChanged = jest.fn();
    const { container, unmount } = render(
      <StrictMode>
        <ContentFilter onFilterChanged={onFilterChanged} currentFilter={{ contentType: 'all' }} />
      </StrictMode>,
    );

    expect(container.querySelector('.mapCenter')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeInTheDocument();
    expect(container.querySelector('[latLngToPixel], [pixelToLatLng], [setCenterZoom], [mapState]')).toBeNull();
    fireEvent.click(screen.getByLabelText('Filter to location'));
    fireEvent.click(screen.getByRole('button', { name: '+' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(onFilterChanged).toHaveBeenLastCalledWith(
      expect.objectContaining({
        contentType: 'all',
        location: expect.objectContaining({ latitude: 47.4899, longitude: 19.1173, zoom: 10 }),
      }),
    );
    unmount();
  });

  it('renders an editable marker and saves location metadata asynchronously', async () => {
    jest.mocked(apiFileUpdateMetadata).mockResolvedValue(undefined);
    const onFileChanged = jest.fn();
    const { container, unmount } = render(
      <StrictMode>
        <AuthContext.Provider value={{ isLoggedIn: true, isAdmin: true }}>
          <LocationMetadataDisplay file={file} onFileChanged={onFileChanged} />
        </AuthContext.Provider>
      </StrictMode>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Set it manually/ }));
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+' }));
    fireEvent.click(screen.getByRole('button', { name: 'Update location' }));
    await waitFor(() => {
      expect(onFileChanged).toHaveBeenCalledWith(file);
    });
    expect(apiFileUpdateMetadata).toHaveBeenCalledWith(file.id, {
      key: 'gps_coordinates',
      type: 'Location',
      value: { latitude: 47.507235, longitude: 19.042195 },
    });
    expect(screen.queryByRole('button', { name: 'Update location' })).toBeNull();
    expect(JSON.parse(sessionStorage.getItem('last-saved-location') ?? '{}')).toEqual({
      latitude: 47.507235,
      longitude: 19.042195,
    });
    unmount();
  });
});
