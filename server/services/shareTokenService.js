import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAX_RECORD_ID = 2147483647;
const TOKEN_PATTERN = /^v1\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{2,14})\.([A-Za-z0-9_-]{22})$/;

export class ShareConfigurationError extends Error {
  constructor() {
    super('Share service is not configured.');
  }
}

export class InvalidShareTokenError extends Error {
  constructor() {
    super('Invalid share token.');
  }
}

function getKey() {
  const secret = env.shareTokenSecret;
  if (typeof secret !== 'string' || secret.length < 32 || !secret.trim()) {
    throw new ShareConfigurationError();
  }

  // Keep this secret stable: shared links have no expiry and a changed secret invalidates them.
  return createHash('sha256').update(secret, 'utf8').digest();
}

function getBaseUrl() {
  const value = env.shareBaseUrl;
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) {
    throw new ShareConfigurationError();
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ShareConfigurationError();
  }

  if (!['http:', 'https:'].includes(url.protocol)
      || !url.hostname || url.username || url.password || url.search || url.hash) {
    throw new ShareConfigurationError();
  }

  return url.href.replace(/\/+$/, '');
}

export function validateShareLinkConfiguration() {
  getKey();
  getBaseUrl();
}

export function createShareToken(recordId) {
  if (!Number.isInteger(recordId) || recordId < 1 || recordId > MAX_RECORD_ID) {
    throw new TypeError('A positive map record id is required.');
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(recordId), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${VERSION}.${iv.toString('base64url')}.${ciphertext.toString('base64url')}.${tag.toString('base64url')}`;
}

export function parseShareToken(token) {
  const match = typeof token === 'string' ? TOKEN_PATTERN.exec(token) : null;
  if (!match) throw new InvalidShareTokenError();

  const [, encodedIv, encodedCiphertext, encodedTag] = match;
  const iv = Buffer.from(encodedIv, 'base64url');
  const ciphertext = Buffer.from(encodedCiphertext, 'base64url');
  const tag = Buffer.from(encodedTag, 'base64url');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES || ciphertext.length < 1
      || iv.toString('base64url') !== encodedIv
      || ciphertext.toString('base64url') !== encodedCiphertext
      || tag.toString('base64url') !== encodedTag) {
    throw new InvalidShareTokenError();
  }

  // A well-formed link still needs the configured key for authentication.
  const key = getKey();

  let plaintext;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new InvalidShareTokenError();
  }

  if (!/^[1-9]\d*$/.test(plaintext)) throw new InvalidShareTokenError();
  const recordId = Number(plaintext);
  if (!Number.isSafeInteger(recordId) || recordId > MAX_RECORD_ID) {
    throw new InvalidShareTokenError();
  }
  return recordId;
}

export function buildShareUrl(token) {
  return `${getBaseUrl()}/share/${token}`;
}
