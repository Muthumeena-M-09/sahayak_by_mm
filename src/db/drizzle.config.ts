import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL?.trim();
const sqlHost = process.env.SQL_HOST || 'localhost';
const sqlPort = Number.parseInt(process.env.SQL_PORT || '5432', 10) || 5432;
const sqlDbName = process.env.SQL_DB_NAME || 'sahayak';
const user = process.env.SQL_ADMIN_USER || process.env.SQL_USER || 'postgres';
const password = process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD || 'postgres';
const isSsl =
  process.env.SQL_SSL === 'true' ||
  Boolean(
    databaseUrl &&
      (databaseUrl.includes('sslmode=require') ||
        databaseUrl.includes('supabase.') ||
        databaseUrl.includes('neon.tech') ||
        databaseUrl.includes('pooler.supabase.com') ||
        (!databaseUrl.includes('localhost') && !databaseUrl.includes('127.0.0.1')))
  );

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: ['public'],
  dbCredentials: databaseUrl
    ? {
        url: databaseUrl,
        ssl: isSsl ? { rejectUnauthorized: false } : false,
      }
    : {
        host: sqlHost,
        port: sqlPort,
        user: user,
        password: password,
        database: sqlDbName,
        ssl: isSsl ? { rejectUnauthorized: false } : false,
      },
  verbose: true,
});
