import { defineConfig } from 'prisma/config';

// Compose injects CLI credentials. Client generation needs no database or secrets.
export default defineConfig({
    schema: 'prisma/schema.prisma',
    migrations: { path: 'prisma/migrations', seed: './node_modules/.bin/ts-node prisma/seed.ts' },
    datasource: { url: process.env.DATABASE_URL, shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL },
});
