import { useCallback, useEffect, useState } from 'react';

/** Keep the loader stable with useCallback; a new loader starts a new request. */
export function useAsyncData<T>(loader: () => Promise<T>) {
    const [revision, setRevision] = useState(0);
    const [result, setResult] = useState<{
        loader: () => Promise<T>;
        revision: number;
        data?: T;
        error: string | null;
    } | null>(null);
    const isCurrent = result?.loader === loader && result.revision === revision;

    useEffect(() => {
        let active = true;
        loader().then(
            (data) => {
                if (active) setResult({ loader, revision, data, error: null });
            },
            (error: unknown) => {
                if (active) setResult({ loader, revision, error: String(error) });
            },
        );
        return () => {
            active = false;
        };
    }, [loader, revision]);

    const reload = useCallback(() => setRevision((value) => value + 1), []);
    const updateData = (update: (data: T) => T): void => {
        setResult((current) =>
            current?.loader === loader && current.revision === revision && current.data !== undefined
                ? { ...current, data: update(current.data) }
                : current,
        );
    };

    return {
        data: isCurrent ? result.data : undefined,
        error: isCurrent ? result.error : null,
        isLoading: !isCurrent,
        reload,
        updateData,
    };
}
