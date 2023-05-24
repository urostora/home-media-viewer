export const getIronSessionOptions = () => {
  return {
    cookieName: 'home-media-viewer-user-cookie',
    password: process.env.APP_SESSION_SECRET ?? '98765432101234567890abcdefghijkl',
    // secure: true should be used in production (HTTPS) but can't be used in development (HTTP)
    cookieOptions: {
      secure: process.env.NODE_ENV === 'production',
    },
  };
};
