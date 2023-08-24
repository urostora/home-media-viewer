const hasHostname = typeof process.env?.HOSTNAME === 'string' && process.env.HOSTNAME.length > 0;

export const getIronSessionOptions = () => {
  return {
    cookieName: 'home-media-viewer-user-cookie',
    password: process.env.APP_SESSION_SECRET ?? '98765432101234567890abcdefghijkl',
    // secure: true should be used in production (HTTPS) but can't be used in development (HTTP)
    cookieOptions: {
      httpOnly: false,
      ttl: 14 * 24 * 60 * 60,
      secure: (process.env?.NODE_ENV ?? '') === 'production' && hasHostname,
    },
  };
};
