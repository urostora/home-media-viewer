import { pathToFileURL } from 'node:url';

export function validateProductionConfig(env = process.env, role = 'app') {
  const requireValue = (name, minimum = 1) => {
    if (typeof env[name] !== 'string' || env[name].trim().length < minimum) {
      throw new Error(`${name} must contain at least ${minimum} characters`);
    }
  };
  requireValue('PROCESS_TOKEN');
  if (role === 'scheduler') return;
  requireValue('APP_SESSION_SECRET', 32);
  requireValue('DATABASE_URL');
  let url;
  let username;
  let password;
  try {
    url = new URL(env.DATABASE_URL);
    username = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
  } catch {
    throw new Error('DATABASE_URL must be a valid MariaDB URL');
  }
  if (
    url.protocol !== 'mysql:' ||
    url.hostname !== 'db' ||
    !password.trim() ||
    !username.trim() ||
    username === 'root'
  ) {
    throw new Error('DATABASE_URL must use a non-root user, a password and the db service hostname');
  }
  if (env.SESSION_COOKIE_SECURE !== undefined && !['true', 'false'].includes(env.SESSION_COOKIE_SECURE)) {
    throw new Error('SESSION_COOKIE_SECURE must be true or false');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    validateProductionConfig(process.env, process.argv[2]);
  } catch (error) {
    console.error(`Production configuration rejected: ${error.message}`);
    process.exitCode = 1;
  }
}
