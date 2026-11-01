// Kept independent of Node/Prisma so the preliminary proxy can validate seals.
export const SESSION_ABSOLUTE_SECONDS = 14 * 24 * 60 * 60;
export const SESSION_IDLE_SECONDS = 24 * 60 * 60;
export const isSessionToken = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
export const hasSessionToken = (value: { version?: unknown; token?: unknown }): boolean =>
  value.version === 1 && isSessionToken(value.token);
