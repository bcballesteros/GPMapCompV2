import { createMapComposerRecord, getMapComposerRecordById } from '../repositories/mapComposerRepository.js';
import { SHARE_MAX_FILE_BYTES } from '../config/share.js';
import { detectShareOutputFormat, SHARE_OUTPUT_TYPES } from './shareOutputFormat.js';
import { buildShareUrl, createShareToken, parseShareToken, validateShareLinkConfiguration } from './shareTokenService.js';
import { sendShareEmail, validateEmailConfiguration } from './emailService.js';

const SUPPORTED_FORMATS = new Set(['png', 'jpeg', 'pdf']);
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

export class ShareRequestError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function invalidRequest() {
  return new ShareRequestError(400, 'INVALID_REQUEST', 'The share request is invalid.');
}

function validateEmail(value) {
  if (typeof value !== 'string') {
    throw invalidRequest();
  }

  const email = value.trim();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (email.length > 255 || !emailPattern.test(email)) {
    throw new ShareRequestError(400, 'INVALID_EMAIL', 'Enter a valid recipient email address.');
  }

  return email;
}

function validateFormat(value) {
  if (typeof value !== 'string') {
    throw invalidRequest();
  }

  if (!SUPPORTED_FORMATS.has(value)) {
    throw new ShareRequestError(400, 'UNSUPPORTED_FORMAT', 'The requested map output format is not supported.');
  }

  return value;
}

function decodeBase64(value) {
  if (typeof value !== 'string'
      || value.length === 0
      || value.length % 4 !== 0
      || !BASE64_PATTERN.test(value)) {
    throw new ShareRequestError(400, 'INVALID_IMAGE_DATA', 'The map output data is invalid.');
  }

  const imageData = Buffer.from(value, 'base64');
  if (imageData.length === 0 || imageData.toString('base64') !== value) {
    throw new ShareRequestError(400, 'INVALID_IMAGE_DATA', 'The map output data is invalid.');
  }

  if (imageData.length > SHARE_MAX_FILE_BYTES) {
    throw new ShareRequestError(413, 'FILE_TOO_LARGE', 'The map output exceeds the allowed size.');
  }

  return imageData;
}

export async function processShare(body, dependencies = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw invalidRequest();
  }

  const email = validateEmail(body.recipientEmail);
  const format = validateFormat(body.format);
  const imageData = decodeBase64(body.imageData);
  const actualFormat = detectShareOutputFormat(imageData);

  if (!actualFormat) {
    throw new ShareRequestError(400, 'INVALID_IMAGE_DATA', 'The map output data is invalid.');
  }
  if (actualFormat !== format) {
    throw new ShareRequestError(400, 'FORMAT_MISMATCH', 'The map output format does not match the uploaded data.');
  }

  const checkShareConfiguration = dependencies.validateShareLinkConfiguration ?? validateShareLinkConfiguration;
  const checkEmailConfiguration = dependencies.validateEmailConfiguration ?? validateEmailConfiguration;
  const storeRecord = dependencies.createMapComposerRecord ?? createMapComposerRecord;
  const makeToken = dependencies.createShareToken ?? createShareToken;
  const makeUrl = dependencies.buildShareUrl ?? buildShareUrl;
  const deliverEmail = dependencies.sendShareEmail ?? sendShareEmail;

  checkShareConfiguration();
  checkEmailConfiguration();
  const record = await storeRecord({ email, imageData });
  const shareUrl = makeUrl(makeToken(record.id));
  await deliverEmail({ recipientEmail: email, shareUrl });
}

export class SharedMapNotFoundError extends Error {
  constructor() {
    super('The shared map could not be found.');
  }
}

export class ShareRetrievalError extends Error {
  constructor() {
    super('Unable to retrieve the shared map.');
  }
}

export async function retrieveSharedMap(token) {
  const id = parseShareToken(token);
  const record = await getMapComposerRecordById(id);
  if (!record) throw new SharedMapNotFoundError();

  const format = detectShareOutputFormat(record.image_data);
  if (!format) throw new ShareRetrievalError();

  return { imageData: record.image_data, ...SHARE_OUTPUT_TYPES[format] };
}
