import 'dotenv/config';

export const env = Object.freeze({
  port: Number.parseInt(process.env.PORT ?? '3000', 10),
  postgres: {
    host: process.env.PGHOST,
    port: Number.parseInt(process.env.PGPORT ?? '5432', 10),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
  },
  shareBaseUrl: process.env.SHARE_BASE_URL,
  shareTokenSecret: process.env.SHARE_TOKEN_SECRET,
});
