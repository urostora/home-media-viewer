import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import FileList from '@/components/fileList';
import { apiLoadFiles } from '@/utils/frontend/dataSource/file';
import type { FileResultType } from '@/types/api/fileTypes';

jest.mock('@/utils/frontend/dataSource/file', () => ({ apiLoadFiles: jest.fn() }));
jest.mock('@/components/content/filter/contentFilter', () => ({
    __esModule: true,
    default: ({ onFilterChanged }: { onFilterChanged: (value: { contentType: string }) => void }) => (
        <button onClick={() => onFilterChanged({ contentType: 'video' })}>Videos</button>
    ),
}));
jest.mock('@/components/content/contentList', () => ({
    __esModule: true,
    default: ({ data }: { data: FileResultType[] }) => (
        <ul>
            {data.map((file) => (
                <li key={file.id}>{file.name}</li>
            ))}
        </ul>
    ),
}));
jest.mock('@/components/content/contentDisplay', () => ({ __esModule: true, default: () => null }));

function files(prefix: string, count: number): FileResultType[] {
    return Array.from(
        { length: count },
        (_, index) => ({ id: `${prefix}-${index}`, name: `${prefix}-${index}` }) as FileResultType,
    );
}
function pending() {
    let resolve!: (value: FileResultType[]) => void;
    const promise = new Promise<FileResultType[]>((yes) => {
        resolve = yes;
    });
    return { promise, resolve };
}
afterEach(() => jest.resetAllMocks());

it('loads each filter once, ignores old responses, and paginates only after completion', async () => {
    const first = pending();
    const filtered = pending();
    const next = pending();
    jest.mocked(apiLoadFiles)
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(filtered.promise)
        .mockReturnValueOnce(next.promise);
    render(<FileList />);
    fireEvent.scroll(document);
    expect(apiLoadFiles).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Videos' }));
    expect(apiLoadFiles).toHaveBeenCalledTimes(2);
    expect(jest.mocked(apiLoadFiles).mock.calls[1][0]).toMatchObject({ contentType: 'video', skip: 0 });
    await act(async () => {
        filtered.resolve(files('video', 20));
    });
    await act(async () => {
        first.resolve(files('obsolete', 20));
    });
    expect(screen.queryByText('obsolete-0')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load more content' }));
    fireEvent.scroll(document);
    expect(apiLoadFiles).toHaveBeenCalledTimes(3);
    expect(jest.mocked(apiLoadFiles).mock.calls[2][0]).toMatchObject({ contentType: 'video', skip: 20 });
    await act(async () => {
        next.resolve(files('next', 1));
    });
    expect(screen.getAllByRole('listitem')).toHaveLength(21);
    expect(screen.queryByRole('button', { name: 'Load more content' })).not.toBeInTheDocument();
});

it('can retry a failed first page without retaining the previous error', async () => {
    jest.mocked(apiLoadFiles).mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(files('recovered', 1));
    render(<FileList />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Offline');
    fireEvent.click(screen.getByRole('button', { name: 'Load more content' }));
    expect(await screen.findByText('recovered-0')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
