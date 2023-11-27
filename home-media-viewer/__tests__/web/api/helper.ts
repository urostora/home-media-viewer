import fetch from 'node-fetch';

const APP_URL = process.env.APP_URL;

export const getApiUrl = (path: string): string => `${APP_URL}/api/${path}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const fetchDataFromApi = async <T>(path: string, data: object | undefined = undefined, method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' = 'GET'): Promise<T> => {
    const result = await fetchResultFromApi(path, data, method);

    if (!result.ok) {
        throw `Fetch returned status code ${result.status} (${result.statusText})`;
    }

    return await result.json();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const fetchResultFromApi = async (path: string, data: object | undefined = undefined, method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' = 'GET'): Promise<Response> => {
    const url = getApiUrl(path);

    return await fetch(url, {
        body: data ? JSON.stringify(data) : undefined,
        method: method,
        headers: {
            'Content-Type': data ? 'text/javascript' : '',
        }
    });
}