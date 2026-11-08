import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useCallback } from 'react';
import { useAsyncData } from '@/utils/frontend/hooks/useAsyncData';

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<T>((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
}

function Example({ load, id }: { load: (id: string) => Promise<string>; id: string }) {
    const loader = useCallback(() => load(id), [load, id]);
    const { data, isLoading, error, reload } = useAsyncData(loader);
    return (
        <>
            <p>{isLoading ? 'Loading' : (error ?? data)}</p>
            <button onClick={reload}>Reload</button>
        </>
    );
}

it('resets loading on input changes and ignores responses from obsolete requests', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const load = jest.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = render(<Example load={load} id="first" />);
    expect(screen.getByText('Loading')).toBeInTheDocument();
    view.rerender(<Example load={load} id="second" />);
    await act(async () => {
        second.resolve('Second');
    });
    expect(screen.getByText('Second')).toBeInTheDocument();
    await act(async () => {
        first.resolve('Obsolete');
    });
    expect(screen.queryByText('Obsolete')).not.toBeInTheDocument();
    expect(load.mock.calls).toEqual([['first'], ['second']]);
});

it('clears errors on reload and ignores settlement after unmount', async () => {
    const failed = deferred<string>();
    const retried = deferred<string>();
    const load = jest.fn().mockReturnValueOnce(failed.promise).mockReturnValueOnce(retried.promise);
    const view = render(<Example load={load} id="one" />);
    await act(async () => {
        failed.reject(new Error('Unavailable'));
    });
    expect(screen.getByText('Error: Unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(screen.getByText('Loading')).toBeInTheDocument();
    expect(screen.queryByText('Error: Unavailable')).not.toBeInTheDocument();
    view.unmount();
    await act(async () => {
        retried.resolve('Unmounted');
    });
    expect(screen.queryByText('Unmounted')).not.toBeInTheDocument();
});
