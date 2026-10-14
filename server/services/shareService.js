import { createMapComposerRecord, createMapComposerRecords, getMapComposerRecordById } from '../repositories/mapComposerRepository.js';
import { SHARE_MAX_FILE_BYTES } from '../config/share.js';
import { detectShareOutputFormat, SHARE_OUTPUT_TYPES } from './shareOutputFormat.js';
import { buildShareUrl, createShareToken, parseShareToken, validateShareLinkConfiguration } from './shareTokenService.js';
import { sendShareEmail, validateEmailConfiguration } from './emailService.js';
import { normalizeAndValidateEmail } from '../../src/services/email-validation.js';

const SUPPORTED_FORMATS = new Set(['png', 'jpeg', 'pdf']);
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;
const MAX_RECIPIENTS = 5;

export class ShareRequestError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class ShareDeliveryFailureError extends Error {
  constructor(results) {
    super('Unable to send the shared map.');
    this.results = results;
  }
}

function invalidRequest() {
  return new ShareRequestError(400, 'INVALID_REQUEST', 'The share request is invalid.');
}

function validateEmail(value) {
  if (typeof value !== 'string') {
    throw invalidRequest();
  }

  const email = normalizeAndValidateEmail(value);
  if (email === null) {
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

  validateDecodedFileSize(imageData);

  return imageData;
}

export function validateDecodedFileSize(imageData) {
  if (imageData.length > SHARE_MAX_FILE_BYTES) {
    throw new ShareRequestError(413, 'FILE_TOO_LARGE', 'The map output exceeds the allowed size.');
  }
}

export async function processShare(body, dependencies = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw invalidRequest();
  }

  const hasSingle = Object.hasOwn(body, 'recipientEmail');
  const hasMultiple = Object.hasOwn(body, 'recipientEmails');
  if (hasSingle && hasMultiple) throw invalidRequest();
  const multiple = hasMultiple;
  let recipients;
  if (multiple) {
    if (!Array.isArray(body.recipientEmails)) throw invalidRequest();
    if (body.recipientEmails.length > MAX_RECIPIENTS) {
      throw new ShareRequestError(400, 'TOO_MANY_RECIPIENTS', 'You can share a map with up to 5 recipients at a time.');
    }
    if (body.recipientEmails.length === 0) {
      throw new ShareRequestError(400, 'INVALID_EMAIL', 'Enter at least one recipient email address.');
    }
    recipients = body.recipientEmails.map(validateEmail);
    const seen = new Set();
    for (const email of recipients) {
      const normalized = email.toLowerCase();
      if (seen.has(normalized)) {
        throw new ShareRequestError(400, 'DUPLICATE_RECIPIENT', 'Recipient email addresses must be unique.');
      }
      seen.add(normalized);
    }
  } else {
    recipients = [validateEmail(body.recipientEmail)];
  }
  const email = recipients[0];
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
  const storeRecords = dependencies.createMapComposerRecords ?? createMapComposerRecords;
  const makeToken = dependencies.createShareToken ?? createShareToken;
  const makeUrl = dependencies.buildShareUrl ?? buildShareUrl;
  const deliverEmail = dependencies.sendShareEmail ?? sendShareEmail;

  checkShareConfiguration();
  checkEmailConfiguration();
  if (!multiple) {
    const record = await storeRecord({ email, imageData });
    const shareUrl = makeUrl(makeToken(record.id));
    await deliverEmail({ recipientEmail: email, shareUrl });
    return;
  }

  const records = await storeRecords(recipients.map((recipientEmail) => ({ email: recipientEmail, imageData })));
  const results = [];
  // A timeout or disconnect can leave SMTP acceptance uncertain; this flow never retries automatically.
  for (let index = 0; index < recipients.length; index += 1) {
    try {
      const shareUrl = makeUrl(makeToken(records[index].id));
      await deliverEmail({ recipientEmail: recipients[index], shareUrl });
      results.push({ email: recipients[index], status: 'sent' });
    } catch {
      results.push({ email: recipients[index], status: 'failed' });
    }
  }
  const sentCount = results.filter((item) => item.status === 'sent').length;
  const result = { sentCount, failedCount: results.length - sentCount, results };
  if (sentCount === 0) throw new ShareDeliveryFailureError(results);
  return result;
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
