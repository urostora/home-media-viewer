import { type GeneralResponseWithData } from '@/types/api/generalTypes';
import { type LoginRequestType, type LoginResponseDataType } from '@/types/loginTypes';

export const apiLogin = async (args: LoginRequestType): Promise<LoginResponseDataType | null> => {
  const fetchArgs: RequestInit = {
    method: 'post',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...args,
    }),
  };

  const fetchResult = await fetch('/api/login', fetchArgs);
  if (fetchResult.status === 429) {
    const value = Number(fetchResult.headers.get('Retry-After'));
    const seconds = Number.isFinite(value) && value >= 1 ? Math.min(300, Math.ceil(value)) : 1;
    throw new Error(`Too many login attempts. Try again in ${seconds} seconds.`);
  }
  if (fetchResult.status === 503) throw new Error('Login unavailable. Please retry.');
  if (fetchResult.status === 400 || fetchResult.status === 401) throw new Error('Invalid email or password');
  const resultData: GeneralResponseWithData<LoginResponseDataType> = await fetchResult.json();

  if (!fetchResult.ok || !resultData.ok) {
    throw Error(resultData.error ?? 'Login failed');
  }

  return typeof resultData?.data === 'object' ? resultData.data : null;
};

// Identity requests deliberately bypass apiFetch to avoid recursive 403 rechecks.
export const apiCurrentUser = async (signal?: AbortSignal): Promise<LoginResponseDataType | null> => {
  const response = await fetch('/api/me', { credentials: 'same-origin', cache: 'no-store', signal });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error('Could not confirm your session. Please retry.');
  const result: GeneralResponseWithData<LoginResponseDataType> = await response.json();
  const data = result.data;
  if (
    !result.ok ||
    data == null ||
    typeof data.name !== 'string' ||
    typeof data.email !== 'string' ||
    typeof data.isAdmin !== 'boolean'
  ) {
    throw new Error('Could not confirm your session. Please retry.');
  }
  return data;
};

export const apiLogout = async (): Promise<void> => {
  const response = await fetch('/api/logout', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Logout could not be confirmed. Please retry.');
  const result: { ok?: boolean } = await response.json();
  if (result.ok !== true) throw new Error('Logout could not be confirmed. Please retry.');
};
