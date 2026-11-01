import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Layout from '@/components/layout/layout';
import { apiCurrentUser, apiLogout } from '@/utils/frontend/dataSource/auth';
import { apiFetch, AUTH_RECHECK_EVENT } from '@/utils/frontend/dataSource/apiFetch';

jest.mock('@/utils/frontend/dataSource/auth', () => ({ apiCurrentUser: jest.fn(), apiLogout: jest.fn() }));
jest.mock('next/head', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/layout/layoutLoggedIn', () => ({
  __esModule: true,
  default: jest.requireActual('@/components/layout/userHeader').default,
}));
jest.mock('@/components/layout/layoutNotLoggedIn', () => ({
  __esModule: true,
  default: ({ onUserAuthenticated }: { onUserAuthenticated: () => void }) => (
    <button onClick={onUserAuthenticated}>Test login</button>
  ),
}));
const current = jest.mocked(apiCurrentUser);
const logout = jest.mocked(apiLogout);
const user = {
  name: 'Current reader',
  email: 'reader@example.invalid',
  isAdmin: false,
  sessionExpiresOn: 1000,
  sessionExpiresInSeconds: 100,
};
const mount = (): ReturnType<typeof render> =>
  render(
    <Layout>
      <div>Protected</div>
    </Layout>,
  );
const deferred = <T,>(): { promise: Promise<T>; resolve: (value: T) => void } => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
beforeEach(() => {
  jest.clearAllMocks();
  current.mockResolvedValue(user);
  logout.mockResolvedValue();
  localStorage.clear();
});
afterEach(() => {
  for (const name of ['hmv-name', 'hmv-email', 'hmv-isadmin']) document.cookie = `${name}=; Max-Age=0; Path=/`;
});

test('restores the current server user, removes editable display hints, never writes the session cookie', async () => {
  document.cookie = 'hmv-name=Forged';
  document.cookie = 'hmv-isadmin=1';
  mount();
  expect(screen.getByText('Initiating...')).toBeInTheDocument();
  expect(await screen.findByText(user.name)).toBeInTheDocument();
  expect(document.cookie).not.toContain('hmv-');
  expect(current).toHaveBeenCalledWith(expect.any(AbortSignal));
});
test('removes legacy hints created at nested default paths', async () => {
  window.history.replaceState({}, '', '/album/example');
  try {
    document.cookie = 'hmv-name=Nested';
    document.cookie = 'hmv-isadmin=1';
    mount();
    await screen.findByText(user.name);
    expect(document.cookie).not.toContain('hmv-');
  } finally {
    window.history.replaceState({}, '', '/');
  }
});
test('forged cookies cannot restore a logged-out session', async () => {
  current.mockResolvedValue(null);
  document.cookie = 'hmv-name=Forged';
  document.cookie = 'hmv-isadmin=1';
  mount();
  expect(await screen.findByText('Test login')).toBeInTheDocument();
  expect(screen.queryByText('Logout')).toBeNull();
});
test('waits for confirmed logout, prevents duplicate clicks and notifies other tabs', async () => {
  const pending = deferred<void>();
  logout.mockReturnValue(pending.promise);
  mount();
  fireEvent.click(await screen.findByText('Logout'));
  expect(screen.getByText('Logging out...')).toBeDisabled();
  expect(screen.getByText(user.name)).toBeInTheDocument();
  fireEvent.click(screen.getByText('Logging out...'));
  expect(logout).toHaveBeenCalledTimes(1);
  await act(async () => {
    pending.resolve();
  });
  expect(screen.getByText('Test login')).toBeInTheDocument();
  expect(localStorage.getItem('hmv:auth-change')).not.toBeNull();
});
test('failed logout preserves identity and shows a meaningful retry that calls logout again', async () => {
  logout.mockRejectedValueOnce(new Error('network'));
  mount();
  fireEvent.click(await screen.findByText('Logout'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Logout could not be confirmed');
  expect(screen.getByText(user.name)).toBeInTheDocument();
  expect(localStorage.getItem('hmv:auth-change')).toBeNull();
  fireEvent.click(screen.getByText('Retry'));
  expect(await screen.findByText('Test login')).toBeInTheDocument();
  expect(logout).toHaveBeenCalledTimes(2);
});
test('initial identity outage shows retry instead of falsely showing login', async () => {
  current.mockRejectedValueOnce(new Error('outage'));
  mount();
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not confirm your session');
  expect(screen.queryByText('Test login')).toBeNull();
  fireEvent.click(screen.getByText('Retry'));
  expect(await screen.findByText(user.name)).toBeInTheDocument();
});
test.each(['focus', AUTH_RECHECK_EVENT, 'storage'])(
  'revalidates on %s without trusting the notification',
  async (event) => {
    mount();
    await screen.findByText(user.name);
    current.mockResolvedValueOnce(null);
    act(() => {
      window.dispatchEvent(
        event === 'storage'
          ? new StorageEvent('storage', { key: 'hmv:auth-change', newValue: 'forged-admin' })
          : new Event(event),
      );
    });
    expect(await screen.findByText('Test login')).toBeInTheDocument();
  },
);
test('resource-only denial keeps the valid current session', async () => {
  mount();
  await screen.findByText(user.name);
  act(() => {
    window.dispatchEvent(new Event(AUTH_RECHECK_EVENT));
  });
  await waitFor(() => {
    expect(current).toHaveBeenCalledTimes(2);
  });
  expect(screen.getByText(user.name)).toBeInTheDocument();
});
test('old identity responses cannot restore a user after logout', async () => {
  const pending = deferred<typeof user | null>();
  mount();
  await screen.findByText(user.name);
  current.mockReturnValueOnce(pending.promise);
  act(() => {
    window.dispatchEvent(new Event('focus'));
  });
  fireEvent.click(screen.getByText('Logout'));
  await screen.findByText('Test login');
  await act(async () => {
    pending.resolve(user);
  });
  expect(screen.queryByText('Logout')).toBeNull();
});
test('unmount aborts pending identity work', async () => {
  current.mockReturnValue(new Promise(() => {}));
  const view = mount();
  const signal = current.mock.calls[0][0];
  view.unmount();
  expect(signal?.aborted).toBe(true);
});
test('login callback rechecks server identity', async () => {
  current.mockResolvedValueOnce(null);
  mount();
  fireEvent.click(await screen.findByText('Test login'));
  expect(await screen.findByText(user.name)).toBeInTheDocument();
  expect(current).toHaveBeenCalledTimes(2);
});
test.each([401, 403, 500, 200])('shared fetch signals only identity-relevant status %s', async (status) => {
  const original = global.fetch;
  global.fetch = jest.fn().mockResolvedValue({ status });
  const listener = jest.fn();
  window.addEventListener(AUTH_RECHECK_EVENT, listener);
  try {
    await apiFetch('/api/file/search', { method: 'POST' });
    expect(listener).toHaveBeenCalledTimes(status === 401 || status === 403 ? 1 : 0);
    expect(global.fetch).toHaveBeenCalledWith('/api/file/search', { method: 'POST', credentials: 'same-origin' });
  } finally {
    window.removeEventListener(AUTH_RECHECK_EVENT, listener);
    global.fetch = original;
  }
});
