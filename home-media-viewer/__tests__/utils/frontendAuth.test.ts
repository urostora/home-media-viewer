import { apiCurrentUser, apiLogin, apiLogout } from '@/utils/frontend/dataSource/auth';
const fetchMock = jest.fn();
const original = global.fetch;
beforeEach(() => {
    global.fetch = fetchMock;
    fetchMock.mockReset();
});
afterAll(() => {
    global.fetch = original;
});
const response = (status: number, body: unknown): void => {
    fetchMock.mockResolvedValue({ status, ok: status >= 200 && status < 300, json: async () => body });
};
test.each([401, 403])('identity denial %s is unauthenticated', async (status) => {
    response(status, {});
    expect(await apiCurrentUser()).toBeNull();
});
test.each([500, 503])('identity outage %s remains retryable', async (status) => {
    response(status, {});
    await expect(apiCurrentUser()).rejects.toThrow('Could not confirm');
});
test.each([{}, { ok: false }, { ok: true, data: null }, { ok: true, data: { name: 'Forged', isAdmin: 'true' } }])(
    'invalid identity payload remains retryable %j',
    async (body) => {
        response(200, body);
        await expect(apiCurrentUser()).rejects.toThrow('Could not confirm');
    },
);
test('identity request uses same-origin credentials, no-store and abort signal', async () => {
    const user = { name: 'Reader', email: 'reader@example.invalid', isAdmin: false };
    response(200, { ok: true, data: user });
    const controller = new AbortController();
    expect(await apiCurrentUser(controller.signal)).toEqual(user);
    expect(fetchMock).toHaveBeenCalledWith('/api/me', {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
    });
});
test('confirmed logout sends POST with credentials', async () => {
    response(200, { ok: true });
    await apiLogout();
    expect(fetchMock).toHaveBeenCalledWith('/api/logout', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
    });
});
test.each([
    [503, { ok: true }],
    [200, { ok: false }],
    [200, {}],
])('unconfirmed logout %s rejects', async (status, body) => {
    response(status as number, body);
    await expect(apiLogout()).rejects.toThrow('Logout could not be confirmed');
});
test('network/parse failure never confirms logout', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));
    await expect(apiLogout()).rejects.toThrow();
    fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => {
            throw new Error('json');
        },
    });
    await expect(apiLogout()).rejects.toThrow();
});
test('login sends explicit JSON with credentials', async () => {
    response(200, { ok: true, data: { name: 'Reader' } });
    await apiLogin({ email: 'reader@example.invalid', password: 'synthetic-only' });
    expect(fetchMock).toHaveBeenCalledWith(
        '/api/login',
        expect.objectContaining({
            method: 'post',
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
        }),
    );
});

test.each(['12', '99999', 'invalid', null])('login displays a bounded Retry-After %s', async (header) => {
    fetchMock.mockResolvedValue({ status: 429, headers: { get: () => header } });
    const seconds = header === '12' ? 12 : header === '99999' ? 300 : 1;
    await expect(apiLogin({ email: 'reader@example.invalid', password: 'synthetic' })).rejects.toThrow(
        `Try again in ${seconds} seconds`,
    );
});
test('login displays retryable service outage', async () => {
    response(503, {});
    await expect(apiLogin({ email: 'reader@example.invalid', password: 'synthetic' })).rejects.toThrow(
        'Login unavailable',
    );
});

test('non-JSON credential failure remains a meaningful safe error', async () => {
    fetchMock.mockResolvedValue({
        status: 400,
        json: () => {
            throw new Error('must not parse text');
        },
    });
    await expect(apiLogin({ email: 'reader@example.invalid', password: 'synthetic' })).rejects.toThrow(
        'Invalid email or password',
    );
});
