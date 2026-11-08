import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import AlbumList from '@/components/albumList';
import { apiLoadAlbums } from '@/utils/frontend/dataSource/album';

jest.mock('@/utils/frontend/dataSource/album', () => ({ apiLoadAlbums: jest.fn() }));
jest.mock('@/components/content/contentList', () => ({
    __esModule: true,
    default: ({ data }: { data: Array<{ name: string }> }) => (
        <ol>
            {data.map((album) => (
                <li key={album.name}>{album.name}</li>
            ))}
        </ol>
    ),
}));
const key = 'hmv:album-order';
const names = () => screen.getAllByRole('listitem').map((item) => item.textContent);
beforeEach(() => {
    localStorage.clear();
    jest.mocked(apiLoadAlbums).mockImplementation(async () => [
        { id: 'a', name: 'Alpha', status: 'Active', thumbnailFile: { id: 'a-photo', contentDate: '2026-01-01' } },
        { id: 'z', name: 'Zulu', status: 'Active', thumbnailFile: { id: 'z-photo', contentDate: '2025-01-01' } },
    ]);
});
afterEach(() => jest.restoreAllMocks());

it('keeps the existing default when no preference has been saved', async () => {
    render(<AlbumList />);
    expect(await screen.findByRole('combobox', { name: 'Sort albums' })).toHaveValue('dateDesc');
    expect(names()).toEqual(['Alpha', 'Zulu']);
    expect(localStorage.getItem(key)).toBeNull();
});
it.each([
    ['nameAsc', ['Alpha', 'Zulu']],
    ['nameDesc', ['Zulu', 'Alpha']],
    ['dateAsc', ['Zulu', 'Alpha']],
    ['dateDesc', ['Alpha', 'Zulu']],
])('persists %s and restores both the selector and ordering on reopening', async (order, expected) => {
    const view = render(<AlbumList />);
    fireEvent.change(await screen.findByRole('combobox', { name: 'Sort albums' }), { target: { value: order } });
    expect(localStorage.getItem(key)).toBe(order);
    expect(names()).toEqual(expected);
    view.unmount();
    render(<AlbumList />);
    expect(await screen.findByRole('combobox', { name: 'Sort albums' })).toHaveValue(order);
    expect(names()).toEqual(expected);
});
it('ignores an unsupported saved order', async () => {
    localStorage.setItem(key, 'invalid');
    render(<AlbumList />);
    expect(await screen.findByRole('combobox', { name: 'Sort albums' })).toHaveValue('dateDesc');
    expect(names()).toEqual(['Alpha', 'Zulu']);
});
it('allows sorting when storage cannot be read or written', async () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('Storage disabled');
    });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('Storage disabled');
    });
    render(<AlbumList />);
    const select = await screen.findByRole('combobox', { name: 'Sort albums' });
    expect(select).toHaveValue('dateDesc');
    fireEvent.change(select, { target: { value: 'nameDesc' } });
    expect(select).toHaveValue('nameDesc');
    expect(names()).toEqual(['Zulu', 'Alpha']);
});
