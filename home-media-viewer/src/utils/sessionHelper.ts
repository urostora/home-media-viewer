import type { IronSessionOptions } from 'iron-session';

const hasHostname = typeof process.env?.HOSTNAME === 'string' && process.env.HOSTNAME.length > 0;

const getRandomSecret = (secretLength: number = 32): string => {
  const charactersAllowed = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

  let result = '';
  for (let i = 0; i < secretLength; i++) {
    result += charactersAllowed[Math.floor(Math.random() * charactersAllowed.length)];
  }

  return result;
};

export const getIronSessionOptions = (): IronSessionOptions => {
  return {
    cookieName: 'home-media-viewer-user-cookie',
    password: process.env.APP_SESSION_SECRET ?? getRandomSecret(),
    // secure: true should be used in production (HTTPS) but can't be used in development (HTTP)
    cookieOptions: {
      httpOnly: false,
      maxAge: 14 * 24 * 60 * 60,
      secure: (process.env?.NODE_ENV ?? '') === 'production' && hasHostname,
    },
  };
};
