import type { NextApiResponse } from 'next';
import { handleApiError, HmvError } from '@/utils/apiHelpers';
import { logLoginSuccess } from '@/utils/apiLogger';
import { validateData } from '@/utils/dataValidator';

const sentinel = 'SYNTHETIC_CREDENTIAL_SENTINEL';
const id = '12345678-1234-1234-1234-123456789abc';

let warn: jest.SpyInstance;
let log: jest.SpyInstance;
beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

const response = () => ({ status: jest.fn().mockReturnThis(), end: jest.fn().mockReturnThis() });

it.each([
    sentinel,
    new Error(sentinel, { cause: new Error(sentinel) }),
    { error: sentinel, publicError: sentinel, stack: sentinel },
    new HmvError(sentinel, { publicMessage: 'Invalid email or password', data: { password: sentinel } }),
])('omits untrusted exception details and nested context (%#)', (error) => {
    const res = response();
    const context = {
        id,
        password: sentinel,
        passwordHash: sentinel,
        nested: [{ authorization: sentinel, cookie: sentinel, PROCESS_TOKEN: sentinel, APP_SESSION_SECRET: sentinel }],
        filter: { email: sentinel },
        toJSON: () => {
            throw new Error('Request serialization must not run');
        },
    };

    handleApiError(res as unknown as NextApiResponse, 'add user', error, context);

    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ event: 'api.error', task: 'add user', id }));
    expect(JSON.stringify([warn.mock.calls, res.end.mock.calls])).not.toContain(sentinel);
    expect(res.end).toHaveBeenCalledTimes(1);
});

it('logs safe diagnostic codes and identifiers without stack, meta or unknown fields', () => {
    const error = Object.assign(new Error(sentinel), { code: 'P2002', meta: { password: sentinel } });
    const context = { id, userId: sentinel, fileId: { password: sentinel } };
    Object.defineProperty(context, 'albumId', {
        get: () => {
            throw new Error('Do not evaluate context getters');
        },
    });

    handleApiError(response() as unknown as NextApiResponse, 'update user', error, context);

    expect(warn).toHaveBeenCalledWith({
        event: 'api.error',
        task: 'update user',
        httpStatus: 400,
        errorKind: 'exception',
        code: 'P2002',
        id,
    });
});

it('ignores secret-bearing error codes and cyclic context', () => {
    const context: { password: string; nested?: unknown } = { password: sentinel };
    context.nested = context;
    handleApiError(response() as unknown as NextApiResponse, 'add user', { code: sentinel }, context);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(sentinel);
});

it('preserves an explicitly public application error and its status', () => {
    const res = response();
    handleApiError(
        res as unknown as NextApiResponse,
        'add user',
        new HmvError('Invalid input', {
            isPublic: true,
            httpStatus: 422,
        }),
    );
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.end).toHaveBeenCalledWith('Error in add user: Invalid input');
});

it.each([id, sentinel])('records login success using only a valid user identifier (%#)', (userId) => {
    logLoginSuccess(userId);
    expect(log).toHaveBeenCalledWith({ event: 'auth.login.success', ...(userId === id ? { userId } : {}) });
    expect(JSON.stringify(log.mock.calls)).not.toContain(sentinel);
});

it.each([
    { value: sentinel, type: 'number' as const },
    { value: { toString: (): string => sentinel }, type: 'string' as const },
    { value: [sentinel], type: 'number' as const, isArrayAllowed: true },
    { value: [sentinel], type: 'string' as const },
    { value: sentinel, type: 'string' as const, valuesAllowed: ['safe'] },
    { value: [sentinel], type: 'string' as const, isArrayAllowed: true, valuesAllowed: ['safe'] },
])('keeps invalid scalar/array/object values out of public validation errors (%#)', ({ value, ...schema }) => {
    const res = response();
    let error: unknown;
    try {
        validateData({ password: value }, [{ field: 'password', ...schema }]);
    } catch (caught) {
        error = caught;
    }
    expect(error).toBeInstanceOf(HmvError);
    handleApiError(res as unknown as NextApiResponse, 'add user', error);
    expect(res.end).toHaveBeenCalledWith(expect.stringContaining('field "password"'));
    expect(JSON.stringify([warn.mock.calls, res.end.mock.calls])).not.toContain(sentinel);
});
