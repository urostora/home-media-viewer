import fetch from 'node-fetch';

const APP_URL = process.env.APP_URL;
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;

let loginCookie: string | undefined | null = undefined;

export const getApiUrl = (path: string): string => `${APP_URL}/api/${path}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const fetchDataFromApi = async <T>(
  path: string,
  data: object | undefined = undefined,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' = 'GET',
): Promise<T> => {
  const result = await fetchResultFromApi(path, data, method);

  if (!result.ok) {
    throw `Fetch returned status code ${result.status} (${result.statusText})`;
  }

  return await result.json();
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const fetchResultFromApi = async (
  path: string,
  data: object | undefined = undefined,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' = 'GET',
): Promise<Response> => {
  const url = getApiUrl(path);
  const loginCookie = await getLoginCookie();

  const cookiesHeader = loginCookie ? { Cookie: loginCookie } : {};

  const fetchOptions = {
    body: data ? JSON.stringify(data) : undefined,
    method: method,
    headers: {
      'Content-Type': data ? 'text/javascript' : '',
      ...cookiesHeader,
    },
  };

  return fetch(url, fetchOptions);
};

export const getLoginCookie = async (): Promise<string | undefined> => {
  if (typeof loginCookie === 'undefined') {
    const url = getApiUrl('login');

    const response = await fetch(url, {
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
      method: 'POST',
    });

    const setCookieValue = response?.headers?.get('set-cookie');
    if (typeof setCookieValue != 'string' || setCookieValue.length < 50) {
      loginCookie = null;
      throw 'Could not get login cookie - 1';
    }

    const groups = /(?<logincookie>home-media-viewer-user-cookie=[^;]+);/.exec(setCookieValue as string)?.groups;

    if (groups && groups['logincookie'].length > 50) {
      loginCookie = groups['logincookie'];
    } else {
      loginCookie = null;
    }
  }

  return loginCookie ?? undefined;
};
