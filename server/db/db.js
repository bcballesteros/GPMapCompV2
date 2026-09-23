import pg from 'pg';
import { env } from '../config/env.js';

const { Pool } = pg;

const pool = new Pool({
  host: env.postgres.host,
  port: env.postgres.port,
  database: env.postgres.database,
  user: env.postgres.user,
  password: env.postgres.password,
});

export function query(text, params) {
  return pool.query(text, params);
}
