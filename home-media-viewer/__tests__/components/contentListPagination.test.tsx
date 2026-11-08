import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import ContentList from '@/components/content/contentList';
import type { FileResultType } from '@/types/api/fileTypes';

jest.mock('@/components/content/contentThumbnail', () => ({
    __esModule: true,
    default: ({ content }: { content: FileResultType }) => <div>{content.name}</div>,
}));
jest.mock('@/components/content/albumThumbnail', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/content/contentDisplay', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/content/metadataDisplay', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/content/scrollToTop', () => ({ __esModule: true, default: () => null }));
const data = Array.from(
    { length: 12 },
    (_, index) => ({ id: String(index), name: `File ${index}`, metadataStatus: 'Processed' }) as FileResultType,
);

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('reveals pages from clicks and scrolls, and removes its timer on unmount', () => {
    const view = render(<ContentList data={data} />);
    expect(screen.queryAllByText(/^File /)).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(screen.queryAllByText(/^File /)).toHaveLength(10);
    fireEvent.scroll(document);
    expect(screen.queryAllByText(/^File /)).toHaveLength(12);
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    view.unmount();
    expect(jest.getTimerCount()).toBe(0);
});

it('fills a short viewport in bounded pages, including after an empty initial result', () => {
    const view = render(<ContentList data={[]} />);
    act(() => jest.advanceTimersByTime(200));
    view.rerender(<ContentList data={data} />);
    for (let page = 0; page < 3; page++) {
        act(() => jest.advanceTimersByTime(200));
    }
    expect(screen.queryAllByText(/^File /)).toHaveLength(12);
    view.unmount();
    expect(jest.getTimerCount()).toBe(0);
});
