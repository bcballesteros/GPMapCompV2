import 'dotenv/config';

function parseSmtpSecure(value) {
  if (value === undefined || value.trim() === '') return false;
  if (/^true$/i.test(value.trim())) return true;
  if (/^false$/i.test(value.trim())) return false;
  return null;
}

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
  smtp: {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT === undefined ? 587 : Number(process.env.SMTP_PORT),
    secure: parseSmtpSecure(process.env.SMTP_SECURE),
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    from: process.env.SMTP_FROM,
  },
});
