import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import MetadataDisplay from '@/components/content/metadataDisplay';
import type { FileResultType } from '@/types/api/fileTypes';

const file: FileResultType = {
  id: '5b794e34-d63d-4106-ae04-66599bb5c72d',
  status: 'Active',
  path: '/photo.jpg',
  name: 'photo',
  extension: 'jpg',
  isDirectory: false,
  createdAt: '2026-10-04',
  modifiedAt: '2026-10-04',
  contentDate: null,
  size: null,
  hash: null,
  metadataStatus: 'Processed',
  metadataProcessedAt: null,
  metadataProcessingError: null,
  thumbnailStatus: 'Processed',
  thumbnailProcessedAt: new Date('2026-10-04T11:03:35.425Z'),
  parentFileId: null,
  metas: [],
  thumbnail: null,
};

it('loads the versioned thumbnail directly so the browser sends its session cookie', () => {
  render(<MetadataDisplay file={file} onClose={jest.fn()} />);

  const image = screen.getByRole('img', { name: 'photo' });
  expect(image).toHaveAttribute(
    'src',
    `/api/file/thumbnail/${file.id}/200?v=2026-10-04T11%3A03%3A35.425Z`,
  );
  expect(image).not.toHaveAttribute('srcset');
});
