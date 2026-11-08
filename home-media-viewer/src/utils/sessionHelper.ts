import type { SessionOptions } from 'iron-session';
import { SESSION_ABSOLUTE_SECONDS } from './auth/sessionPolicy';

export const getIronSessionOptions = (): SessionOptions => {
    const isProduction = process.env.NODE_ENV === 'production';
    const secret = process.env.APP_SESSION_SECRET;
    if (secret === undefined || secret.trim().length < 32) {
        throw new Error('APP_SESSION_SECRET must contain at least 32 characters');
    }
    const secureSetting = process.env.SESSION_COOKIE_SECURE;
    if (secureSetting !== undefined && secureSetting !== 'true' && secureSetting !== 'false') {
        throw new Error('SESSION_COOKIE_SECURE must be true or false');
    }

    return {
        ttl: SESSION_ABSOLUTE_SECONDS,
        cookieName: 'home-media-viewer-user-cookie',
        password: secret,
        cookieOptions: {
            httpOnly: true,
            sameSite: 'lax',
            maxAge: SESSION_ABSOLUTE_SECONDS,
            secure: secureSetting === undefined ? isProduction : secureSetting === 'true',
        },
    };
};
