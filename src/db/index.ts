import * as dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { Pool as PgPool, PoolConfig } from 'pg';
import * as schema from './schema.ts';

dotenv.config();

const { Pool } = pg;

declare global {
  var _postgresPool: PgPool | undefined;
}

export function getDatabaseConfig(): PoolConfig {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (databaseUrl) {
    const isSsl =
      process.env.SQL_SSL === 'true' ||
      databaseUrl.includes('sslmode=require') ||
      databaseUrl.includes('supabase.') ||
      databaseUrl.includes('neon.tech') ||
      databaseUrl.includes('pooler.supabase.com') ||
      (!databaseUrl.includes('localhost') && !databaseUrl.includes('127.0.0.1'));

    return {
      connectionString: databaseUrl,
      ssl: isSsl ? { rejectUnauthorized: false } : undefined,
      max: 10,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      keepAlive: true,
    };
  }

  const isSsl = process.env.SQL_SSL === 'true';
  return {
    host: process.env.SQL_HOST || 'localhost',
    port: Number.parseInt(process.env.SQL_PORT || '5432', 10) || 5432,
    user: process.env.SQL_USER || 'postgres',
    password: process.env.SQL_PASSWORD || 'postgres',
    database: process.env.SQL_DB_NAME || 'sahayak',
    ssl: isSsl ? { rejectUnauthorized: false } : undefined,
    max: 10,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    keepAlive: true,
  };
}

export const createPool = () => {
  if (!global._postgresPool) {
    const config = getDatabaseConfig();
    global._postgresPool = new Pool(config);

    global._postgresPool.on('error', (err) => {
      console.warn('Postgres pool idle client warning:', err.message);
    });
  }
  return global._postgresPool;
};

const pool = createPool();

export const db = drizzle(pool, { schema });
