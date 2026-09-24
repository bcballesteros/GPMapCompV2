import assert from 'node:assert/strict';
import test from 'node:test';
import { processShare, ShareRequestError } from '../services/shareService.js';
import { createShare, handleCreateShare } from '../controllers/shareController.js';
import { EmailConfigurationError, EmailDeliveryError } from '../services/emailService.js';

const recipientEmail = '  recipient@example.test  ';
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const body = { recipientEmail, format: 'png', imageData: png.toString('base64') };
const shareUrl = 'https://maps.example.test/share/v1.secure-token';

function dependencies(overrides = {}) {
  return {
    validateShareLinkConfiguration() {},
    validateEmailConfiguration() {},
    async createMapComposerRecord({ email, imageData }) {
      assert.equal(email, 'recipient@example.test');
      assert.deepEqual(imageData, png);
      return { id: 42 };
    },
    createShareToken(id) {
      assert.equal(id, 42);
      return 'opaque-token';
    },
    buildShareUrl(token) {
      assert.equal(token, 'opaque-token');
      return shareUrl;
    },
    async sendShareEmail(message) {
      assert.deepEqual(message, { recipientEmail: 'recipient@example.test', shareUrl });
    },
    ...overrides,
  };
}

test('processShare stores, creates a secure URL, and emails only the validated recipient and link', async () => {
  await processShare(body, dependencies());
});

test('email configuration is checked before storage', async () => {
  let stored = false;
  await assert.rejects(processShare(body, dependencies({
    validateEmailConfiguration() { throw new EmailConfigurationError(); },
    async createMapComposerRecord() { stored = true; },
  })), EmailConfigurationError);
  assert.equal(stored, false);
});

test('validation errors occur before email delivery', async () => {
  let attempted = false;
  await assert.rejects(processShare({ ...body, format: 'gif' }, dependencies({
    async sendShareEmail() { attempted = true; },
  })), (error) => error instanceof ShareRequestError && error.code === 'UNSUPPORTED_FORMAT');
  assert.equal(attempted, false);
});

test('storage failures are not converted to email errors', async () => {
  await assert.rejects(processShare(body, dependencies({
    async createMapComposerRecord() { throw new Error('database unavailable'); },
  })), /database unavailable/);
});

test('a stored record is preserved when email delivery fails', async () => {
  let stored = false;
  await assert.rejects(processShare(body, dependencies({
    async createMapComposerRecord() { stored = true; return { id: 42 }; },
    async sendShareEmail() { throw new EmailDeliveryError(); },
  })), EmailDeliveryError);
  assert.equal(stored, true);
});

function responseRecorder() {
  return {
    statusCode: undefined,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

test('controller returns the complete share success response', async () => {
  const res = responseRecorder();
  await handleCreateShare({ body }, res, async () => {});
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, { success: true, message: 'Map shared successfully.' });
});

test('Express third next argument cannot bypass the real Share processor', async () => {
  const res = responseRecorder();
  let nextCalled = false;
  const next = () => { nextCalled = true; };
  await createShare({ body: { ...body, format: 'gif' } }, res, next);
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'UNSUPPORTED_FORMAT');
});

test('controller does not return success before the injected processor completes', async () => {
  const res = responseRecorder();
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const handling = handleCreateShare({ body }, res, async () => pending);
  assert.equal(res.statusCode, undefined);
  release();
  await handling;
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, { success: true, message: 'Map shared successfully.' });
});

test('controller maps email failures to stable responses without SMTP details', async () => {
  for (const [error, expected] of [
    [new EmailConfigurationError(), { code: 'EMAIL_CONFIGURATION_ERROR', message: 'Email service is not configured.' }],
    [new EmailDeliveryError('smtp secret host failure'), { code: 'EMAIL_DELIVERY_FAILED', message: 'Unable to send the shared map.' }],
  ]) {
    const res = responseRecorder();
    await handleCreateShare({ body }, res, async () => { throw error; });
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { success: false, error: expected });
    assert.equal(JSON.stringify(res.body).includes('smtp'), false);
  }
});

test('controller preserves storage failure response', async () => {
  const res = responseRecorder();
  const originalError = console.error;
  console.error = () => {};
  try {
    await handleCreateShare({ body }, res, async () => { throw new Error('database detail'); });
  } finally {
    console.error = originalError;
  }
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    success: false,
    error: { code: 'SHARE_STORAGE_FAILED', message: 'Unable to store the shared map.' },
  });
});
