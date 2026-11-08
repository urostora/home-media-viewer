import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const connectionOptions = (env: NodeJS.ProcessEnv = process.env) => {
    const connectionLimit = Number(env.DB_CONNECTION_LIMIT ?? 5);
    if (!Number.isInteger(connectionLimit) || connectionLimit < 1 || connectionLimit > 20) {
        throw new Error('DB_CONNECTION_LIMIT must be between 1 and 20');
    }
    let url: URL;
    try {
        url = new URL(env.DATABASE_URL ?? '');
        if (url.protocol !== 'mysql:' || !url.hostname || url.pathname.length < 2 || url.hash) throw new Error();
    } catch {
        throw new Error('DATABASE_URL must be a valid MariaDB mysql URL');
    }
    const supported = new Set([
        'connection_limit',
        'pool_timeout',
        'connect_timeout',
        'socket_timeout',
        'sslcert',
        'sslidentity',
        'sslpassword',
        'sslaccept',
        'socket',
    ]);
    for (const key of url.searchParams.keys()) {
        if (!supported.has(key)) throw new Error('DATABASE_URL contains an unsupported connection option');
        if (url.searchParams.getAll(key).length !== 1)
            throw new Error('DATABASE_URL contains a repeated connection option');
    }
    const sslaccept = url.searchParams.get('sslaccept');
    if (sslaccept !== null && sslaccept !== 'strict' && sslaccept !== 'accept_invalid_certs') {
        throw new Error('DATABASE_URL sslaccept must be strict or accept_invalid_certs');
    }
    const caPath = url.searchParams.get('sslcert');
    const identityPath = url.searchParams.get('sslidentity');
    const passphrase = url.searchParams.get('sslpassword');
    const ssl = caPath !== null || identityPath !== null || sslaccept !== null || passphrase !== null;
    try {
        return {
            host: url.hostname.replace(/^\[|\]$/g, ''),
            port: Number(url.port || 3306),
            user: decodeURIComponent(url.username),
            password: decodeURIComponent(url.password),
            database: decodeURIComponent(url.pathname.slice(1)),
            ...(url.searchParams.has('socket') ? { socketPath: url.searchParams.get('socket')! } : {}),
            // Preserve the application policy, including precedence over URL options.
            connectionLimit,
            acquireTimeout: 5_000,
            connectTimeout: 5_000,
            socketTimeout: 10_000,
            queryTimeout: 10_000,
            idleTimeout: 300,
            ...(ssl
                ? {
                      ssl: {
                          rejectUnauthorized: sslaccept !== 'accept_invalid_certs',
                          ...(caPath !== null ? { ca: readFileSync(resolve('prisma', caPath)) } : {}),
                          ...(identityPath !== null ? { pfx: readFileSync(resolve('prisma', identityPath)) } : {}),
                          ...(passphrase !== null ? { passphrase } : {}),
                      },
                  }
                : {}),
        };
    } catch {
        // URL decoding and certificate errors can contain credentials or private paths.
        throw new Error('DATABASE_URL credentials or TLS files are invalid');
    }
};

// The adapter owns its pool; disconnecting this client also closes that pool.
export const createPrismaClient = (): PrismaClient =>
    new PrismaClient({ adapter: new PrismaMariaDb(connectionOptions()) });
